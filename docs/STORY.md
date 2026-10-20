# The career in chapters

Phase 2 of the career redesign: the career is told in chapters with a recurring cast. It is a light narrative
layer over the existing career (docs/SECTORS.md), not a new game: the chapters begin at real career milestones,
their objectives are met by normal play, and the characters speak through the channels the game already has.
Nothing in a shift plays differently; the story only reads the paid shift's report.

| Part                                                              | Where                                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Content (cast, chapters, objectives, questions, newspaper pieces) | `src/data/story.ts`                                                                                                  |
| Rules (progress, objectives, answers, views)                      | `src/sim/story.ts`                                                                                                   |
| Saved state                                                       | `CareerProfile.story` (`StoryState` in `src/sim/types.ts`)                                                           |
| Career page panel                                                 | `src/ui/screens/career/StoryPanel.tsx` (styles `.cr-story*` in `career.css`)                                         |
| Menu line, notices                                                | `src/ui/screens/MenuScreen.tsx` (`.vk-car__story`), `src/ui/screens/shell/menuModel.ts`, `notices.tsx`               |
| Briefing, report                                                  | `BriefingScreen.tsx` (`.sh-order__story`), `ReportScreen.tsx` and `shell/Newspaper.tsx` (`extra`)                    |
| UI strings                                                        | `src/i18n/parts/story.ts`                                                                                            |
| Tests                                                             | `tests/story.test.ts`, `tests/upgrade-paths.test.ts` (rollback to 2.17.0), fixture set `tests/fixtures/saves/story/` |

## Cast

All fictional. Names always stand in the nominative in the texts (no case endings to get wrong).

| Who                                           | Per        | Source                                                                                                                                                                                                         |
| --------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prefect                                       | prefecture | the prefecture's `commander` in `src/data/regions/*` (Põhja Liisa Tamm, Ida Indrek Mardisoo, Lõuna Indrek Haavasalu, Lääne Kadri Liivamägi), so the päevakäsk, the offer and the story sign with the same name |
| Shift supervisor (vahetuse vanem), the mentor | prefecture | `MENTORS`: Aivar Kuusemets, Svetlana Ignatjeva, Mati Tõnisson, Piret Laansoo (vanemkomissar)                                                                                                                   |
| AI colleague at the neighbouring desk         | career     | `SectorDef.colleague` of the featured desk: a sector next to the start sector, drawn once from the career seed and kept in `story.desk`                                                                        |
| Union representative (usaldusisik)            | one        | `UNION_REP`: Helle Rand                                                                                                                                                                                        |
| Reporter                                      | prefecture | `JOURNALISTS`, one per newspaper of `MASTHEADS` (src/sim/report.ts): Joonas Vaarik (Pealinna Kuulutaja), Olga Kalinina (Viru Valvur), Karl-Erik Mõttus (Lõuna Postipoiss), Liis Rannamäe (Lääne Lainetus)      |

The cast of a career follows its home prefecture (`CareerProfile.regionId`).

## Chapters

A chapter begins when the previous one is finished and its milestone (`gate`) holds. It finishes when `need` of
its objectives are met and it has lasted `minShifts` paid shifts (so a great first shift does not end the first
week). Then the outro is spoken, the reward given once, and the newspaper prints its piece; the next chapter
begins at once if its milestone already holds, else the panel says what it waits for.

| #   | Title          | Milestone                               | Objectives (3 of 4, at least 3 shifts)                                                                                            | Question                                                                                             | Reward              |
| --- | -------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------- |
| 1   | Esimene laud   | the start                               | 3 shifts; a shift graded B or better; a shift of 8+ incidents with none expired; 3+ 112 calls answered in a shift                 | mentor: stay for a radio debrief (Staatus +1, 90 € overtime) or go home                              | Staatus +2          |
| 2   | Naabrid        | rank Konstaabel                         | a crew reaches a neighbouring desk's call for help; Staatus 35 at a shift's end; a second sector; P1 reached in 12 min on average | union: 1 200 € for the station break room (morale +4 %) or not now                                   | Staatus +2          |
| 3   | Vahetuse vanem | 2 sectors in the home prefecture        | a third sector; a shift graded A; a shift of 10+ incidents with no officer hurt; Staatus 50                                       | reporter: a comment (Staatus +2, the prefect's next offer a shift later) or the press officer        | Staatus +2, 1 000 € |
| 4   | Prefektuur     | rank Vanemkonstaabel and 3 home sectors | a shift in another prefecture; Staatus 60; 3 shifts in a row graded A; the whole home prefecture                                  | prefect: mentor two new dispatchers (Staatus +2, 1 500 € grant, next offer a shift later) or not now | Staatus +3          |
| 5   | Keskuse juht   | rank Komissar and a whole prefecture    | two whole prefectures; Staatus 75; a shift graded S; 25 officers                                                                  | union: pay overtime now (2 500 €, morale +5 %, Staatus +1) or with next month's pay (morale -3 %)    | Staatus +3          |

Covering a prefecture whole counts as all its sectors. Staatus and streak objectives count at the end of a paid
shift; sector, whole prefecture and staff objectives as soon as they hold (an accepted sector records its objective
at once, `storyProgress`). After chapter 5 the story is told; the career goes on as before.

## Where the characters speak

- **Teated** (career inbox, menu and career page): intros, outros, objectives met, questions and replies are career
  messages (`StoryMessage`: `{ et, en, who?, story: { chapter, kind } }`). A message with `who` shows the speaker
  and role instead of the kind. A waiting question has its own notice (like the prefect's offer).
- **Career page**: the chapter panel under the map: the chapter strip, the speaker's intro, the objectives with
  their counts, and the waiting question with its two answers (or the next chapter's milestone, or the cast).
- **Menu**: one line in the Karjäär panel (`Peatükk 2/5 · Naabrid · eesmärke 1/3`).
- **Briefing**: the current chapter's line in the päevakäsk (`order`).
- **Report**: the newspaper prints the reporter's signed piece on the report of the shift that finished a chapter
  (one finished outside a shift runs in the next paper), and the outro is in the Postkast.

## Questions

One per chapter, asked after `after` paid shifts in it (always before it can end), answered on the career page.
Consequences are modest and never take anything away: Staatus, a ledger line, everyone's morale, or one more shift
before the prefect's next sector offer (`sectorsChangedDay`, only for a sector career with no offer waiting). An
answer that costs money is refused (and its button disabled) when the budget does not have it. A question still
open when its chapter finishes lapses with no effect (`answers[id] = '-'`).

## Determinism and saves

Everything follows the career's state, its seed (the featured desk) and the reports; the same career and shifts
give the same story. `CareerProfile.story` is a new optional field: no version bump.

- **Old careers** have no `story`. They load deep-equal (the normaliser adds nothing; golden fixtures unchanged),
  the panel shows the chapter their state matches (`matchingChapter`: the furthest chapter whose milestone holds,
  every earlier one holding too) with "the story begins with your next shift", and their next paid shift starts the
  story there: the intro arrives, nothing of that shift counts, and no reward of an earlier chapter is given
  (`from` marks where the story began; earlier chapters show as "before the story").
- **Normaliser** (`storyState` in `src/store/migrate.ts`, also for cloud copies): numbers checked, bad entries
  dropped one by one (`done`, `answers`, `choice`, `press`, `complete`, `desk`), unknown fields kept. A story with no
  usable `chapter` is dropped and starts again from the state. A chapter a later version adds is kept and left alone.
- **Rollback**: the previous release (2.17.0) keeps `story` as an unknown field (`tests/upgrade-paths.test.ts`
  runs its normaliser, kept in `tests/fixtures/saves/story/migrate.686f0f1.ts.txt`).

## Adding content

Append a chapter to `STORY_CHAPTERS` (a new id, objective and choice ids unique across chapters, `need` and
`minShifts`, a question asked before `minShifts`), with Estonian first and a faithful English text. Placeholders are
listed at the top of `src/data/story.ts`. Objective kinds are `StoryTest`; a new kind needs a branch in
`objectiveMet` (and `objectiveProgress` if it counts). `tests/story.test.ts` checks every text for placeholders
left unfilled and for dashes in every prefecture.
