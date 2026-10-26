// Väljakutse lingiga (2.38.0, docs/CHALLENGE.md, src/ui/screens/shell/Challenge.tsx): sending a free shift as a link,
// the challenge a link opens, the comparison in the report and the player's challenges in the multiplayer menu.
import type { Dict } from '../index';

export default {
  'challenge.title': { et: 'Väljakutse', en: 'Challenge' },
  'challenge.from': { et: '{name} kutsub sind väljakutsele', en: '{name} challenges you' },
  'challenge.own': { et: 'Sinu väljakutse', en: 'Your challenge' },
  'challenge.shift': { et: 'Vahetus', en: 'Shift' },
  'challenge.shiftLine': { et: '{when} {from}-{to} · {hours} h · {difficulty}', en: '{when} {from}-{to} · {hours} h · {difficulty}' },
  'challenge.crisisMay': { et: 'Võib tulla suurõnnetus.', en: 'A major incident may come.' },
  'challenge.same': {
    et: 'Sama vahetus samade väljakutsetega: kõned tulevad samal ajal ja samas kohas, mida iganes sa teed.',
    en: 'The same shift with the same calls: they come at the same time and place whatever you do.',
  },
  'challenge.theirs': { et: '{name} sai {score} punkti ({grade}).', en: '{name} scored {score} points ({grade}).' },
  'challenge.version': {
    et: 'Väljakutse saadeti versioonist {version}. Mäng on vahepeal uuenenud, nii et vahetus võib veidi erineda.',
    en: 'The challenge was sent from version {version}. The game has been updated since, so the shift may differ slightly.',
  },
  'challenge.board': { et: 'Tulemused', en: 'Results' },
  'challenge.players': { et: '{n} mängijat', en: '{n} players' },
  'challenge.players.1': { et: '1 mängija', en: '1 player' },
  'challenge.you': { et: 'sina', en: 'you' },
  'challenge.sender': { et: 'saatja', en: 'sender' },
  'challenge.accept': { et: 'Võta väljakutse vastu', en: 'Take the challenge' },
  'challenge.again': { et: 'Mängi uuesti (harjutus)', en: 'Play again (practice)' },
  'challenge.played': {
    et: 'Sa mängisid selle juba: {score} punkti, {rank}. koht. Uus kord on harjutus.',
    en: 'You played it already: {score} points, place {rank}. Another run is practice.',
  },
  'challenge.guest': {
    et: 'Külalisena saad mängida ja tulemusi võrrelda. Tabelisse läheb tulemus ainult kontoga.',
    en: 'As a guest you can play and compare. Only an account goes on the board.',
  },
  'challenge.loading': { et: 'Laen väljakutset…', en: 'Loading the challenge…' },
  'challenge.notFound': {
    et: 'Seda väljakutset ei ole või see on aegunud (väljakutsed kehtivad 90 päeva).',
    en: 'This challenge does not exist or has expired (challenges last 90 days).',
  },
  'challenge.error': { et: 'Väljakutset ei õnnestunud laadida.', en: 'The challenge could not be loaded.' },
  'challenge.close': { et: 'Sulge', en: 'Close' },

  // Sending it
  'challenge.send': { et: 'Saada väljakutse', en: 'Send a challenge' },
  'challenge.send.about': {
    et: 'Saada sõbrale link: ta mängib täpselt sama vahetuse ja näeb tulemusi sinu omadega kõrvuti.',
    en: 'Send a friend a link: they play exactly the same shift and see their results next to yours.',
  },
  'challenge.send.guest': { et: 'Väljakutse saatmiseks logi kontoga sisse.', en: 'Sign in to an account to send a challenge.' },
  'challenge.send.busy': { et: 'Teen linki…', en: 'Making the link…' },
  'challenge.send.error': { et: 'Linki ei õnnestunud teha. Proovi uuesti.', en: 'The link could not be made. Try again.' },
  'challenge.send.ready': { et: 'Link on valmis. Saada see sõbrale:', en: 'The link is ready. Send it to a friend:' },
  'challenge.share': { et: 'Jaga', en: 'Share' },
  'challenge.copy': { et: 'Kopeeri link', en: 'Copy the link' },
  'challenge.copied': { et: 'Link on kopeeritud.', en: 'The link is copied.' },
  'challenge.share.title': { et: 'EPD väljakutse', en: 'EPD challenge' },
  'challenge.share.text': {
    et: '{name}: {score} punkti, {region}, {when}. Kas teed paremini?',
    en: '{name}: {score} points, {region}, {when}. Can you do better?',
  },
  'challenge.passOn': { et: 'Jaga edasi', en: 'Pass it on' },

  // The comparison in the report
  'challenge.rep.title': { et: 'Väljakutse', en: 'Challenge' },
  'challenge.rep.vs': { et: 'Sina ja {name}', en: 'You and {name}' },
  'challenge.rep.win': { et: 'Tegid paremini kui {name}!', en: 'You beat {name}!' },
  'challenge.rep.lose': { et: '{name} tegi seekord paremini.', en: '{name} did better this time.' },
  'challenge.rep.tie': { et: 'Viik: sama palju punkte.', en: 'A tie: the same points.' },
  'challenge.rep.rank': { et: 'Sinu koht väljakutses: {rank}. / {players}', en: 'Your place in the challenge: {rank} of {players}' },
  'challenge.rep.practice': {
    et: 'Harjutus: sinu esimene tulemus jääb tabelisse.',
    en: 'Practice: your first result stays on the board.',
  },
  'challenge.rep.sending': { et: 'Saadan tulemust…', en: 'Sending the result…' },
  'challenge.rep.error': { et: 'Tulemust ei õnnestunud saata.', en: 'The result could not be sent.' },
  'challenge.rep.retry': { et: 'Proovi uuesti', en: 'Try again' },
  'challenge.rep.none': { et: 'Keegi teine pole seda veel mänginud.', en: 'Nobody else has played it yet.' },
  'challenge.col.you': { et: 'Sina', en: 'You' },
  'challenge.stat.score': { et: 'Punktid', en: 'Points' },
  'challenge.stat.closed': { et: 'Lahendatud sündmusi', en: 'Incidents handled' },
  'challenge.stat.arrests': { et: 'Kinnipidamisi', en: 'Arrests' },
  'challenge.stat.p1': { et: 'Kõige kiireloomulisemad (keskmine)', en: 'Most urgent calls (average)' },
  'challenge.stat.crisis': { et: 'Suurõnnetus', en: 'Major incident' },
  'challenge.min': { et: '{n} min', en: '{n} min' },

  // The player's challenges (multiplayer menu)
  'challenge.list.title': { et: 'Väljakutsed', en: 'Challenges' },
  'challenge.list.about': {
    et: 'Väljakutsed, mille saatsid või mida mängisid. Saada uus vaba vahetuse raportist.',
    en: 'The challenges you sent or played. Send a new one from a free shift’s report.',
  },
  'challenge.list.empty': { et: 'Väljakutseid veel ei ole.', en: 'No challenges yet.' },
  'challenge.list.sent': { et: 'saatsid sina', en: 'sent by you' },
  'challenge.list.by': { et: 'saatis {name}', en: 'sent by {name}' },
} satisfies Dict;
