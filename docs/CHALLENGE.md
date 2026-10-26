# Väljakutse lingiga: a friend plays your shift (2.38.0)

The owner's multiplayer list, point 11: "Väljakutse sõbrale: saadad lingi oma vahetusele (tee parem tulemus kui
mina)." Agreed form: after a shift a link with a preview ("Magnus: 87 punkti, Põhja, reede öö. Kas teed paremini?"),
the friend plays exactly the same shift and sees the results side by side.

## 1. The flow

1. **Send.** The report of a free shift (Kiirmäng) has "Saada väljakutse". It stores the shift's setup and the
   player's result on the server and answers a link, `https://politsei.eu/v/<code>`. The phone's share sheet opens
   with the text; elsewhere the link is copied. A guest is asked to sign in first (the challenge carries a name).
2. **The preview.** A messenger that fetches the link reads its `og:` tags: the title with the name and the points,
   the shift in the description, and a picture of the prefecture's challenge card (`/og/challenge-<region>.png`,
   static, no picture is uploaded).
3. **Accept.** Opening the link boots the game; after signing in (or as a guest) the challenge opens: who sent it,
   the shift (prefecture, day and time, length, difficulty, weather), their result and everyone else's.
   "Võta väljakutse vastu" starts the same shift.
4. **Compare.** The report shows the two results side by side (points and grade, incidents handled, arrests, the
   average response to the most urgent calls, the crisis), and the challenge's board. An account's first run counts;
   later runs are practice. A guest sees the comparison but is not on the board.
5. **Pass it on.** The same link works for anybody: everyone who plays it is on one board. The multiplayer menu
   lists the player's challenges (sent and played) with their boards.

## 2. The same shift

- A free shift started from the briefing is a fixed-schedule shift from 2.38.0 on (`fixedSchedule`, as the daily
  challenge and the rooms): the calls come at the same times and places whatever the player does, so the friend
  gets the same calls. A custom game keeps its colleagues and is never a challenge.
- The setup (`ShiftSetup`, `src/sim/challenge.ts`): seed, prefecture, difficulty, start, hours, the weather the
  briefing gave (`flags['setup:wx']`) and the crisis chance (`flags['setup:crisis']`). The report carries it
  (`ShiftReport.setup`) for a free fixed-schedule shift that was not a custom game, a daily run or a room.
- A challenge run is marked `flags.challenge = <code>`; its report carries `challenge` and is never a new challenge
  (it can pass the same link on).
- The game version is kept with the challenge: after an update the shift may differ slightly, and the challenge says
  so.

## 3. Server (`server/lib/challenges.php`, schema step 16)

- `challenges`: id, code (6 characters of the rooms' alphabet), user (the sender), setup (JSON), version, created.
- `challenge_results`: challenge, user, score, grade, incidents, arrests, p1 (tenths of a minute or null), crisis
  (0..100 or null), at; one row per player (the first run).
- `POST /api/challenges` (account): `{ setup, result, version }`; the same shift sent again answers the same
  challenge. 30 an hour per account. Kept 90 days.
- `GET /api/challenges/<code>`: open to anyone (a guest opens a link): the sender, the setup, the version, the board
  (top 50, rank by points), `me` for an account.
- `POST /api/challenges/<code>/result` (account): the first run counts, later ones answer `counted: false`.
- `GET /api/challenges` (account): the player's challenges, sent or played, newest first, 30.
- `GET /v/<code>` (Caddy hands `/v/*` to PHP): the game's `index.html` with the challenge's `og:` and `twitter:` tags;
  an unknown code gets the page unchanged. `noindex`.
- Deleting an account deletes its challenges with their boards, and its rows on others' boards.

## 4. Not now

- Sending a challenge to a friend in the game itself (2.40.0, the friends list).
- A challenge of a career shift (it depends on the career's force and upgrades).
