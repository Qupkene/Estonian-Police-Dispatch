// UI strings for Mitmikmäng (rooms, docs/MULTIPLAYER.md): the menu row, the lobby, the room board and the report.
import type { Dict } from '../index';

export default {
  'rooms.title': { et: 'Mitmikmäng', en: 'Multiplayer' },
  'rooms.menu.row': {
    et: 'Kuni 4 dispetšerit, ruum koodiga',
    en: 'Up to 4 dispatchers, a room with a code',
  },
  'rooms.menu.rowIn': { et: 'Ruum {code}: {state}', en: 'Room {code}: {state}' },
  'rooms.sub': {
    et: 'Kuni 4 mängijat ühes ruumis. Mängimiseks on vaja kontot.',
    en: 'Up to 4 players in one room. You need an account to play.',
  },
  'rooms.sub.room': { et: 'Ruum {code} · {state}', en: 'Room {code} · {state}' },

  // Room states
  'rooms.state.lobby': { et: 'ootab alustamist', en: 'waiting to start' },
  'rooms.state.running': { et: 'vahetus käib', en: 'shift on' },
  'rooms.state.finished': { et: 'voor läbi', en: 'round over' },
  'rooms.round': { et: '{n}. voor', en: 'round {n}' },
  'rooms.state.closed': { et: 'suletud', en: 'closed' },

  // Modes
  'rooms.mode': { et: 'Režiim', en: 'Mode' },
  'rooms.mode.race': { et: 'Võistlus', en: 'Competition' },
  'rooms.mode.race.desc': {
    et: 'Kõik teevad sama vahetuse omaette: samad väljakutsed samal ajal ja samas kohas. Tulemused pannakse kõrvuti.',
    en: 'Everyone works the same shift on their own: the same calls at the same times and places. Results side by side.',
  },
  'rooms.mode.sector': { et: 'Sektorid', en: 'Sectors' },
  'rooms.mode.sector.desc': {
    et: 'Ühine vahetus, igaüks juhib sama prefektuuri naabersektori pulti ja laenab vajadusel ekipaaže.',
    en: 'One shared shift: each player runs a neighbouring sector desk of the same prefecture and lends crews when needed.',
  },
  'rooms.mode.role': { et: 'Rollid', en: 'Roles' },
  'rooms.mode.role.desc': {
    et: 'Üks ühine vahetus, töölauad jagatud: kõnevastuvõtja võtab vastu 112 kõned, dispetšer saadab ekipaaže, kolmas mängija hoiab raadiot ja registreid.',
    en: 'One shared shift with split desks: the call-taker answers 112, the dispatcher sends the crews, a third player keeps the radio and the registries.',
  },
  'rooms.mode.soon': { et: 'Tulekul', en: 'Coming soon' },

  // Sign-in and connection
  'rooms.guest.title': { et: 'Mitmikmäng vajab kontot', en: 'Multiplayer needs an account' },
  'rooms.guest.text': {
    et: 'Ruumi loomiseks ja ruumiga liitumiseks logi sisse oma EPD kontoga. Külaliskasutaja saab mängida üksi.',
    en: 'Sign in with your EPD account to create or join a room. As a guest you can play on your own.',
  },
  'rooms.guest.signin': { et: 'Logi sisse', en: 'Sign in' },
  'rooms.offline': {
    et: 'Server ei vasta. Mitmikmäng vajab serveriühendust.',
    en: 'The server does not answer. Multiplayer needs a connection to the server.',
  },
  'rooms.loading': { et: 'Kontrollin ruume…', en: 'Checking rooms…' },

  // Create
  'rooms.create.title': { et: 'Uus ruum', en: 'New room' },
  'rooms.create.go': { et: 'Loo ruum', en: 'Create room' },
  'rooms.create.meta': { et: '2-4 mängijat', en: '2-4 players' },
  'rooms.opt.region': { et: 'Prefektuur', en: 'Prefecture' },
  'rooms.opt.sector': { et: 'Ala', en: 'Area' },
  'rooms.opt.whole': { et: 'Kogu prefektuur', en: 'Whole prefecture' },
  'rooms.opt.difficulty': { et: 'Raskus', en: 'Difficulty' },
  'rooms.opt.hours': { et: 'Pikkus', en: 'Length' },
  'rooms.opt.hoursN': { et: '{n} h', en: '{n} h' },
  'rooms.opt.slot': { et: 'Aeg', en: 'Time' },
  'rooms.opt.crisis': { et: 'Suurõnnetus', en: 'Major crisis' },
  'rooms.opt.crisis.random': { et: 'Juhus {p} %', en: 'Chance {p}%' },
  'rooms.opt.crisis.on': { et: 'Kindlasti', en: 'Always' },
  'rooms.opt.crisis.off': { et: 'Ei', en: 'Never' },
  'rooms.opt.hint': {
    et: 'Ilm ja täpne algusaeg tulevad ruumi seemnest: kõigil sama.',
    en: 'The weather and the exact start come from the room seed: the same for everyone.',
  },

  // Join
  'rooms.join.title': { et: 'Liitu koodiga', en: 'Join with a code' },
  'rooms.join.label': { et: 'Ruumi kood', en: 'Room code' },
  'rooms.join.placeholder': { et: 'nt K7M 2QX', en: 'e.g. K7M 2QX' },
  'rooms.join.go': { et: 'Liitu', en: 'Join' },
  'rooms.join.hint': {
    et: 'Kood on 6 märki. Küsi seda ruumi loojalt.',
    en: 'The code has 6 characters. Ask the room creator for it.',
  },
  'rooms.how.title': { et: 'Kuidas see käib', en: 'How it works' },
  'rooms.how.1': {
    et: 'Üks mängija loob ruumi ja valib ala, raskuse ning vahetuse pikkuse.',
    en: 'One player creates a room and picks the area, difficulty and shift length.',
  },
  'rooms.how.2': {
    et: 'Teised liituvad koodiga ja annavad märku, et on valmis.',
    en: 'The others join with the code and mark themselves ready.',
  },
  'rooms.how.3': {
    et: 'Looja alustab vahetust. Pärast seda jätkate samas ruumis: looja valib järgmise vooru, kood jääb samaks.',
    en: 'The creator starts the shift. Afterwards you carry on in the same room: the creator sets up the next round, the code stays.',
  },

  'rooms.rules.title': { et: 'Võistluse reeglid', en: 'Competition rules' },
  'rooms.rules.1': {
    et: 'Kõigil on sama vahetus: sama seeme, samad väljakutsed samal ajal ja samas kohas.',
    en: 'Everyone gets the same shift: the same seed, the same calls at the same times and places.',
  },
  'rooms.rules.2': {
    et: 'Iga mängija saadab ühe tulemuse. Arvesse läheb esimene.',
    en: 'Each player sends one result. The first one counts.',
  },
  'rooms.rules.3': {
    et: 'Kogemuspunktid tulevad nagu tavalisel vabal vahetusel. Üldisesse edetabelisse ruumi tulemused ei lähe.',
    en: 'Experience comes as on a normal free shift. Room results do not go on the general leaderboard.',
  },
  'rooms.rules.4': {
    et: 'Lahkunud mängija rida jääb tabelisse. Ruum, kus keegi 30 minutit ei käi, suletakse.',
    en: 'A player who leaves keeps their row on the board. A room nobody visits for 30 minutes closes.',
  },

  // Room
  'rooms.room': { et: 'Ruum', en: 'Room' },
  'rooms.code': { et: 'Kood', en: 'Code' },
  'rooms.copy': { et: 'Kopeeri kood', en: 'Copy code' },
  'rooms.copied': { et: 'Kood on kopeeritud', en: 'Code copied' },
  'rooms.copyFailed': {
    et: 'Kopeerimine ei õnnestunud, ütle kood ise edasi',
    en: 'Could not copy, pass the code on yourself',
  },
  'rooms.players': { et: 'Mängijad', en: 'Players' },
  'rooms.seat.free': { et: 'Vaba koht', en: 'Free seat' },
  'rooms.badge.host': { et: 'Looja', en: 'Host' },
  'rooms.badge.you': { et: 'sina', en: 'you' },
  'rooms.p.ready': { et: 'Valmis', en: 'Ready' },
  'rooms.p.waiting': { et: 'Ootab', en: 'Not ready' },
  'rooms.p.offline': { et: 'Ühendus katkenud', en: 'Connection lost' },
  'rooms.p.left': { et: 'Lahkus', en: 'Left' },
  'rooms.p.playing': { et: 'Vahetus pooleli', en: 'On shift' },
  'rooms.p.done': { et: 'Lõpetas', en: 'Finished' },
  'rooms.ready': { et: 'Olen valmis', en: "I'm ready" },
  'rooms.unready': { et: 'Ei ole veel valmis', en: 'Not ready yet' },
  'rooms.start': { et: 'Alusta vahetust', en: 'Start the shift' },
  'rooms.leave': { et: 'Lahku ruumist', en: 'Leave the room' },
  'rooms.leave.confirm': {
    et: 'Vahetus käib. Kui lahkud, jääb su koht tabelisse märkega "lahkus" ja tulemust enam saata ei saa.',
    en: 'The shift is on. If you leave, your row stays on the board marked "left" and you can no longer send a result.',
  },
  'rooms.leave.yes': { et: 'Jah, lahku', en: 'Yes, leave' },
  'rooms.rep.leaveConfirm': {
    et: 'Sinu tulemus pole veel ruumi jõudnud. Kui lahkud, jääb su rida tabelisse märkega "lahkus" ja tulemust enam saata ei saa.',
    en: 'Your result has not reached the room yet. If you leave, your row stays on the board marked "left" and the result can no longer be sent.',
  },
  'rooms.leave.no': { et: 'Jää ruumi', en: 'Stay' },
  // Removing a player (docs/MULTIPLAYER.md section 12)
  'rooms.kick': { et: 'Eemalda', en: 'Remove' },
  'rooms.kick.aria': { et: 'Eemalda {name} ruumist', en: 'Remove {name} from the room' },
  'rooms.kick.title': { et: 'Eemalda mängija', en: 'Remove a player' },
  'rooms.kick.confirm': {
    et: '{name} eemaldatakse ruumist kohe, ka käimasolevast vahetusest, ega saa sama koodiga tagasi tulla. Kas eemaldada?',
    en: '{name} leaves the room at once, the running shift too, and cannot come back with the code. Remove them?',
  },
  'rooms.kick.yes': { et: 'Jah, eemalda', en: 'Yes, remove' },
  'rooms.kick.no': { et: 'Tühista', en: 'Cancel' },
  'rooms.kick.done': { et: '{name} eemaldati ruumist.', en: '{name} was removed from the room.' },
  'rooms.kicked': {
    et: 'Ruumi looja eemaldas sind sellest ruumist.',
    en: 'The room’s host removed you from this room.',
  },
  'rooms.block.too_few': {
    et: 'Alustamiseks on vaja vähemalt kahte mängijat. Saada kood edasi.',
    en: 'You need at least two players to start. Pass the code on.',
  },
  'rooms.block.away': {
    et: 'Teised mängijad ei ole praegu ruumis. Alustada saab, kui keegi on tagasi.',
    en: 'The other players are not in the room right now. You can start once someone is back.',
  },
  'rooms.block.not_ready': {
    et: 'Ootan, kuni kõik mängijad on valmis.',
    en: 'Waiting for every player to be ready.',
  },
  'rooms.block.ok': {
    et: 'Kõik on valmis. Vahetuse võib alustada.',
    en: 'Everyone is ready. You can start the shift.',
  },
  'rooms.wait.host': {
    et: 'Vahetuse alustab ruumi looja {name}.',
    en: '{name}, the room creator, starts the shift.',
  },
  'rooms.wait.ready': {
    et: 'Anna märku, kui oled valmis. Valikute muutmisel tuleb märku anda uuesti.',
    en: 'Mark yourself ready. When the options change you have to do it again.',
  },
  'rooms.hostEdits': {
    et: 'Valikuid saab muuta ruumi looja. Muutmisel kaob teiste valmisolek.',
    en: 'The room creator can change the options. A change clears everyone else’s ready mark.',
  },
  'rooms.run.title': { et: 'Vahetus', en: 'Shift' },
  'rooms.run.start': { et: 'Alusta oma vahetust', en: 'Start your shift' },
  'rooms.run.resume': { et: 'Jätka vahetust', en: 'Continue the shift' },
  'rooms.run.report': { et: 'Vaata aruannet', en: 'See the report' },
  'rooms.run.sent': {
    et: 'Sinu tulemus on tabelis. Ootame teisi.',
    en: 'Your result is on the board. Waiting for the others.',
  },
  'rooms.run.sentDone': { et: 'Kõik tulemused on koos.', en: 'All results are in.' },
  'rooms.run.next': {
    et: 'Kui kõik on lõpetanud, avaneb ruum järgmiseks vooruks.',
    en: 'Once everyone has finished, the room opens for the next round.',
  },
  'rooms.run.endHint': {
    et: 'Kui kellelgi läheb kaua, võid vooru kõigi jaoks lõpetada.',
    en: 'If someone takes long, you can end the round for everyone.',
  },
  'rooms.endRound': { et: 'Lõpeta voor', en: 'End the round' },
  'rooms.endRound.confirm': {
    et: 'Voor lõpeb kõigi jaoks ja ruum avaneb järgmiseks vooruks. Kes on veel vahetuses, selle tulemus tabelisse ei jõua.',
    en: 'The round ends for everyone and the room opens for the next one. Anyone still on shift will not get a result on the board.',
  },
  'rooms.endRound.yes': { et: 'Jah, lõpeta voor', en: 'Yes, end the round' },
  'rooms.endRound.no': { et: 'Oota veel', en: 'Keep waiting' },
  'rooms.reopening': { et: 'Avan ruumi järgmiseks vooruks…', en: 'Opening the room for the next round…' },
  'rooms.last.title': { et: 'Eelmine voor', en: 'Last round' },
  'rooms.last.caption': { et: '{n}. vooru tulemused', en: 'Results of round {n}' },
  'rooms.run.text': {
    et: 'Vahetus algas {time}. Kõigil on sama vahetus, igaüks mängib omaette.',
    en: 'The shift started at {time}. Everyone has the same shift and plays on their own.',
  },
  'rooms.run.left': {
    et: 'Sa lahkusid sellest ruumist enne tulemuse saatmist.',
    en: 'You left this room before sending a result.',
  },
  'rooms.closed': {
    et: 'Ruum on suletud: keegi ei olnud seal 30 minutit.',
    en: 'The room is closed: nobody was in it for 30 minutes.',
  },
  'rooms.new': { et: 'Uus ruum', en: 'New room' },
  'rooms.gone': {
    et: 'Ruumi ei ole enam või sa ei ole selle liige.',
    en: 'The room is gone or you are not in it.',
  },

  // Board
  'rooms.board.title': { et: 'Ruumi tulemused', en: 'Room results' },
  'rooms.board.titleCode': { et: 'Ruumi {code} tulemused', en: 'Room {code} results' },
  'rooms.board.empty': { et: 'Tulemusi veel ei ole.', en: 'No results yet.' },
  'rooms.board.of': { et: '{n}/{m} lõpetanud', en: '{n}/{m} finished' },
  'rooms.board.incidents': { et: '{n} sündmust', en: '{n} incidents' },
  'rooms.board.incidents.one': { et: '1 sündmus', en: '1 incident' },
  'rooms.board.live': { et: 'Uueneb ise', en: 'Updates live' },
  'rooms.board.final': { et: 'Lõplik', en: 'Final' },
  'rooms.board.note': {
    et: 'Ruumi tulemused ei lähe üldisesse edetabelisse.',
    en: 'Room results do not go on the general leaderboard.',
  },

  // Report
  'rooms.rep.mode': { et: 'Mitmikmäng', en: 'Multiplayer' },
  'rooms.rep.sending': { et: 'Saadan tulemuse ruumi…', en: 'Sending the result to the room…' },
  'rooms.rep.rank': { et: 'Ruumis {code}: koht {rank}/{n}', en: 'Room {code}: place {rank}/{n}' },
  'rooms.rep.replay': {
    et: 'Tulemus oli juba saadetud: kehtib esimene.',
    en: 'A result had already been sent: the first one stands.',
  },
  'rooms.rep.guest': {
    et: 'Ruumi tulemus läheb arvesse ainult kontoga.',
    en: 'A room result only counts with an account.',
  },
  'rooms.rep.toRoom': { et: 'Tagasi ruumi', en: 'Back to the room' },
  'rooms.rep.wait': { et: 'Ootame, kuni teised lõpetavad.', en: 'Waiting for the others to finish.' },
  'rooms.rep.over': {
    et: 'Voor on läbi. Järgmine voor algab samas ruumis.',
    en: 'The round is over. The next one starts in the same room.',
  },
  'rooms.rep.open': {
    et: 'Ruum on järgmiseks vooruks avatud. Uue vooru alustab {name}.',
    en: 'The room is open for the next round. {name} starts it.',
  },
  'rooms.rep.openMine': {
    et: 'Ruum on järgmiseks vooruks avatud. Uue vooru alustad sina.',
    en: 'The room is open for the next round. You start it.',
  },
  'rooms.rep.next': {
    et: 'Ruumis käib juba järgmine voor.',
    en: 'The next round is already on in the room.',
  },
  'rooms.rep.closed': { et: 'Ruum on suletud.', en: 'The room is closed.' },
  'rooms.rep.left': {
    et: 'Sa lahkusid ruumist. Sinu tulemus jääb selle vooru tabelisse.',
    en: 'You left the room. Your result stays on this round’s board.',
  },

  // Errors
  'rooms.err.bad_code': {
    et: 'Kood on 6 märki: tähed ja numbrid.',
    en: 'A code has 6 characters: letters and digits.',
  },
  'rooms.err.officer_taken': {
    et: 'Mõni valitud politseinik on juba teise mängija koosseisus. Vali keegi teine.',
    en: 'One of the officers you picked is already in another player’s force. Pick someone else.',
  },
  'rooms.err.not_custom': {
    et: 'Selles ruumis oma koosseisu ei valita.',
    en: 'Players do not draft their own force in this room.',
  },
  'rooms.err.round_over': {
    et: 'See voor oli juba läbi, tulemus tabelisse ei jõudnud.',
    en: 'This round was already over, the result did not reach the board.',
  },
  'rooms.err.room_not_found': { et: 'Sellise koodiga ruumi ei ole.', en: 'There is no room with that code.' },
  'rooms.err.room_full': { et: 'Ruum on täis (4 mängijat).', en: 'The room is full (4 players).' },
  'rooms.err.room_started': {
    et: 'Selle ruumi vahetus on juba alanud.',
    en: 'This room’s shift has already started.',
  },
  'rooms.err.room_closed': { et: 'Selle ruumi tulemused on suletud.', en: 'This room’s results are closed.' },
  'rooms.err.not_host': {
    et: 'Seda saab teha ainult ruumi looja.',
    en: 'Only the room creator can do that.',
  },
  'rooms.err.not_ready': { et: 'Kõik mängijad ei ole veel valmis.', en: 'Not every player is ready yet.' },
  'rooms.err.too_few': {
    et: 'Alustamiseks on vaja vähemalt kahte mängijat.',
    en: 'You need at least two players to start.',
  },
  'rooms.err.rate_limited': {
    et: 'Liiga palju katseid, proovi mõne minuti pärast uuesti.',
    en: 'Too many attempts, try again in a few minutes.',
  },
  'rooms.err.auth_required': {
    et: 'Seanss on lõppenud, logi uuesti sisse.',
    en: 'Your session ended, sign in again.',
  },
  'rooms.err.mode_unavailable': { et: 'See režiim ei ole veel avatud.', en: 'This mode is not open yet.' },
  'rooms.err.empty_shift': {
    et: 'Sündmusteta vahetus ruumi tabelisse ei lähe.',
    en: 'A shift without incidents does not go on the room board.',
  },
  'rooms.err.left_room': { et: 'Sa lahkusid sellest ruumist.', en: 'You left this room.' },
  'rooms.err.kicked': {
    et: 'Ruumi looja eemaldas sind sellest ruumist.',
    en: 'The room’s host removed you from this room.',
  },
  'rooms.err.unsigned': {
    et: 'Tulemust ei saanud mänguserverilt kinnitada. Värskenda leht ja proovi uuesti.',
    en: 'The game server could not confirm the result. Reload the page and try again.',
  },
  'rooms.err.player_not_found': {
    et: 'Selles kohas ei ole enam mängijat.',
    en: 'Nobody sits there any more.',
  },
  'rooms.err.kick_self': {
    et: 'Iseennast ei saa eemaldada, lahku ruumist.',
    en: 'You cannot remove yourself; leave the room instead.',
  },
  'rooms.err.mp_unavailable': {
    et: 'Mänguserver ei vasta. Proovi hetke pärast uuesti.',
    en: 'The game server does not answer. Try again in a moment.',
  },
  'rooms.err.replaced': {
    et: 'See vahetus avati teises aknas.',
    en: 'This shift was opened in another window.',
  },
  'rooms.err.network': {
    et: 'Server ei vasta, proovin uuesti.',
    en: 'The server does not answer, retrying.',
  },
  'rooms.err.timeout': {
    et: 'Server ei vasta, proovin uuesti.',
    en: 'The server does not answer, retrying.',
  },
  'rooms.err.other': { et: 'Midagi läks valesti, proovi uuesti.', en: 'Something went wrong, try again.' },
  'rooms.retry': { et: 'Proovi uuesti', en: 'Try again' },
} satisfies Dict;
