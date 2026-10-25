// UI strings for the shared co-op shift (role co-op, docs/MULTIPLAYER.md sections 4 and 5): the lobby's role picker,
// the in-game panel and desks, and the team report.
import type { Dict } from '../index';

export default {
  // Roles
  'coop.role.calls': { et: 'Kõnevastuvõtja', en: 'Call-taker' },
  'coop.role.dispatch': { et: 'Dispetšer', en: 'Dispatcher' },
  'coop.role.radio': { et: 'Raadio ja registrid', en: 'Radio and registries' },
  'coop.role.calls.short': { et: 'Kõned', en: 'Calls' },
  'coop.role.dispatch.short': { et: 'Dispetšer', en: 'Dispatch' },
  'coop.role.radio.short': { et: 'Raadio', en: 'Radio' },
  'coop.role.calls.desc': {
    et: 'Võtab vastu 112 kõned, esitab küsimused, kutsub tõlgi ja registreerib sündmuse.',
    en: 'Answers 112 calls, asks the questions, calls the interpreter and creates the incident.',
  },
  'coop.role.dispatch.desc': {
    et: 'Kinnitab sündmused, muudab prioriteeti, saadab ja kutsub tagasi ekipaaže, sulgeb sündmused.',
    en: 'Acknowledges incidents, sets priorities, sends and recalls crews, closes incidents.',
  },
  'coop.role.radio.desc': {
    et: 'Vastab ekipaažidele raadios, teeb isiku- ja sõidukipäringud, annab ekipaažidele pausi.',
    en: 'Answers the crews on the radio, runs person and vehicle checks, gives crews their breaks.',
  },
  'coop.role.pick': { et: 'Sinu töölaud', en: 'Your desk' },
  'coop.role.calls.cover': {
    et: 'Kõnevastuvõtjat ei ole: kõned võtab vastu dispetšer.',
    en: 'No call-taker: the dispatcher answers the calls.',
  },
  'coop.role.dispatch.cover': {
    et: 'Dispetšerit ei ole: ekipaaže saadab raadio töölaud.',
    en: 'No dispatcher: the radio desk sends the crews.',
  },
  'coop.role.radio.cover': {
    et: 'Raadio töölauda ei ole: raadiot hoiab dispetšer.',
    en: 'No radio desk: the dispatcher keeps the radio.',
  },
  'coop.role.allCovered': {
    et: 'Kõik töölauad on kaetud. Kaks samas rollis jagavad tööd: kõne jääb sellele, kes vastas esimesena.',
    en: 'Every desk is covered. Two in the same role share the work: a call stays with whoever answered first.',
  },

  // Lobby and the running room
  'coop.rules.title': { et: 'Ühisvahetuse reeglid', en: 'Shared shift rules' },
  'coop.rules.1': {
    et: 'Kõik töötavad samas vahetuses. Iga töölaud näeb sama kaarti, aga ainult oma rolli nuppe.',
    en: 'Everyone works the same shift. Every desk sees the same map but only its own role’s controls.',
  },
  'coop.rules.2': {
    et: 'Tegevus jõuab kõigini 2-3 sekundi pärast. Kiirust ja pausi juhib ruumi looja.',
    en: 'An action reaches everyone 2-3 seconds later. The room creator controls speed and pause.',
  },
  'coop.rules.3': {
    et: 'Kui keegi lahkub või ühendus katkeb, võtavad teised tema töölaua üle. Tagasi saab ruumi kaudu.',
    en: 'When somebody leaves or loses the connection, the others take over their desk. They can return through the room.',
  },
  'coop.rules.4': {
    et: 'Kogemuspunktid lähevad iga mängija karjääri üks kord: meeskonna punktid ja osa oma tööst. Raha, töötajaid ja autosid ei puudutata.',
    en: 'Experience goes into every player’s career once: the team’s points and a share for their own work. Money, staff and vehicles are not touched.',
  },
  'coop.run.text': {
    et: 'Ühisvahetus algas {time}. Kõik töötavad samas vahetuses, igaüks oma töölauas.',
    en: 'The shared shift started at {time}. Everyone works the same shift at their own desk.',
  },
  'coop.run.join': { et: 'Liitu vahetusega', en: 'Join the shift' },

  // In game: panel
  'coop.panel': { et: 'Ühisvahetus', en: 'Shared shift' },
  'coop.panel.title': { et: 'Ruum {code}', en: 'Room {code}' },
  'coop.panel.hide': { et: 'Peida', en: 'Hide' },
  'coop.panel.show': { et: 'Näita', en: 'Show' },
  'coop.status.connecting': { et: 'Ühendan', en: 'Connecting' },
  'coop.status.catching': { et: 'Järele jõudmas ({n} s)', en: 'Catching up ({n} s)' },
  'coop.status.live': { et: 'Ühendatud', en: 'Connected' },
  'coop.status.waiting': { et: 'Ootan logi', en: 'Waiting for the log' },
  'coop.status.resync': { et: 'Taastan olekut', en: 'Resyncing' },
  'coop.status.offline': { et: 'Ühendus katkes', en: 'Connection lost' },
  'coop.status.ended': { et: 'Vahetus lõppenud', en: 'Shift over' },
  'coop.status.gone': { et: 'Ruumi ei ole', en: 'Room gone' },
  'coop.status.resyncs': { et: 'Olek taastatud {n} korda', en: 'State resynced {n} times' },
  'coop.kicked': {
    et: 'Ruumi looja eemaldas sind sellest ruumist. Sinu laud läks kolleegile.',
    en: 'The room’s host removed you from this room. Your desk went to a colleague.',
  },
  'coop.kicked.leave': { et: 'Välju vahetusest', en: 'Leave the shift' },
  'coop.seat.away': { et: 'Eemal', en: 'Away' },
  'coop.seat.countsTitle': {
    et: 'Kõned / saadetud ekipaažid / raadiovastused',
    en: 'Calls / crews sent / radio replies',
  },
  'coop.ping.none': { et: 'Sõnumeid ei ole.', en: 'No messages.' },
  'coop.ping.placeholder': { et: 'Sõnum teistele töölaudadele', en: 'Message to the other desks' },
  'coop.ping.send': { et: 'Saada', en: 'Send' },
  'coop.quick.mine': { et: 'Võtan selle', en: 'I’ll take it' },
  'coop.quick.help': { et: 'Vajan abi', en: 'Need a hand' },
  'coop.quick.check': { et: 'Kontrolli registrist', en: 'Check the registry' },
  'coop.sending': { et: 'Saadan…', en: 'Sending…' },
  'coop.pending': { et: 'Teel: {n} käsku', en: 'On the way: {n} commands' },

  // In game: desks
  'coop.call.ringing': { et: '112 kõne heliseb. Vastab {name}.', en: '112 call ringing. {name} answers.' },
  'coop.call.talking': {
    et: '{name} räägib helistajaga ({t}).',
    en: '{name} is talking to the caller ({t}).',
  },
  'coop.call.connecting': { et: 'Ühendan…', en: 'Connecting…' },
  'coop.note.calls': { et: 'Kõnesid võtab vastu {name}.', en: '{name} takes the calls.' },
  'coop.note.dispatch': { et: 'Ekipaaže saadab dispetšer {name}.', en: 'Dispatcher {name} sends the crews.' },
  'coop.note.radio': { et: 'Vastab {name}.', en: '{name} replies.' },
  'coop.note.calls.nobody': { et: 'Kõnevastuvõtjat ei ole.', en: 'No call-taker.' },
  'coop.note.dispatch.nobody': { et: 'Dispetšerit ei ole.', en: 'No dispatcher.' },
  'coop.note.radio.nobody': { et: 'Raadio töölauda ei ole.', en: 'No radio desk.' },
  'coop.speed.host': {
    et: 'Kiirust ja pausi juhib ruumi looja',
    en: 'The room creator controls speed and pause',
  },
  'coop.toast.denied': { et: 'Ei ole sinu töölaua ülesanne', en: 'Not your desk’s task' },
  'coop.toast.sentNote': { et: 'Ekipaaž saadetud', en: 'Crew sent' },
  'coop.pause.leave': { et: 'Välju (saad naasta)', en: 'Leave (you can return)' },
  'coop.pause.endAll': { et: 'Lõpeta vahetus kõigile', en: 'End the shift for everyone' },
  'coop.pause.confirmEnd': {
    et: 'Vahetus lõpeb kõigil korraga ja igaüks saab sama aruande.',
    en: 'The shift ends for everyone at once and each gets the same report.',
  },

  // Report
  'coop.rep.title': { et: 'Meeskonna töö', en: 'Team work' },
  'coop.rep.meta': { et: 'Iga töölaua tegevus', en: 'What each desk did' },
  'coop.rep.col.player': { et: 'Mängija', en: 'Player' },
  'coop.rep.col.role': { et: 'Töölaud', en: 'Desk' },
  'coop.rep.col.calls': { et: 'Kõned', en: 'Calls' },
  'coop.rep.col.created': { et: 'Sündmused', en: 'Incidents' },
  'coop.rep.col.acks': { et: 'Kinnitatud', en: 'Acknowledged' },
  'coop.rep.col.sent': { et: 'Saadetud', en: 'Sent' },
  'coop.rep.col.radio': { et: 'Raadio', en: 'Radio' },
  'coop.rep.col.queries': { et: 'Päringud', en: 'Queries' },
  'coop.rep.col.pings': { et: 'Sõnumid', en: 'Messages' },
  'coop.rep.xp': {
    et: 'Sinu kogemuspunktid: {xp} (meeskond {team}, oma töö +{own}).',
    en: 'Your experience: {xp} (team {team}, own work +{own}).',
  },
  'coop.rep.career': { et: 'Kantud sinu karjääri.', en: 'Added to your career.' },
  'coop.rep.careerPaid': {
    et: 'See ruum on sinu karjääri juba kantud.',
    en: 'This room is already in your career.',
  },
  'coop.rep.noCareer': {
    et: 'Karjääri ei ole: punktid jäävad aruandesse.',
    en: 'No career: the points stay in the report.',
  },
} satisfies Dict;
