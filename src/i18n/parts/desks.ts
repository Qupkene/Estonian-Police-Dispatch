// UI strings for sector co-op (Sektorid, docs/MULTIPLAYER.md section 8): the lobby's desk choice, the desks in the
// game (own queue, neighbours' events, lending crews, hand-overs) and the per-desk report.
import type { Dict } from '../index';

export default {
  // Lobby
  'desk.opt.desks': { et: 'Töölauad', en: 'Desks' },
  'desk.opt.hint': {
    et: 'Vali 2-4 kõrvuti asuvat sektorit. Klõpsa kaardil või nimekirjas.',
    en: 'Pick 2-4 neighbouring sectors. Click on the map or in the list.',
  },
  'desk.opt.add': { et: 'Lisa {name}', en: 'Add {name}' },
  'desk.opt.remove': { et: 'Eemalda {name}', en: 'Remove {name}' },
  'desk.opt.count': { et: '{n} lauda', en: '{n} desks' },
  'desk.pick': { et: 'Sinu töölaud', en: 'Your desk' },
  'desk.pick.nobody': { et: 'vaba', en: 'free' },
  'desk.hint.ai': {
    et: 'Vaba lauda juhib AI-kolleeg ({names}): võtab oma sektori väljakutsed, küsib vahel abi ega kasuta teie ekipaaže.',
    en: 'A free desk is run by its AI colleague ({names}): they take their sector’s calls, ask for help now and then and never use your crews.',
  },
  'desk.hint.all': {
    et: 'Igal laual on mängija. Kaks mängijat samas lauas jagavad selle tööd.',
    en: 'Every desk has a player. Two players at the same desk share its work.',
  },
  'desk.rules.1': {
    et: 'Iga mängija juhib ühe sektori lauda: oma 112 kõned, oma sündmused ja oma sektori ekipaažid.',
    en: 'Each player runs one sector’s desk: their own 112 calls, their own events and their sector’s crews.',
  },
  'desk.rules.2': {
    et: 'Naabrite sündmused ja ekipaažid paistavad kaardil tuhmilt. Ekipaaži saab üle piiri laenata palvega, mille teine laud võtab vastu või lükkab tagasi.',
    en: 'The neighbours’ events and crews show dimmed on the map. A crew crosses a border on a request the other desk accepts or declines.',
  },
  'desk.rules.3': {
    et: 'Jälituse, mis liigub naabri sektorisse, saab anda üle naaberlauale. Kui keegi lahkub, võtab tema laua üle AI-kolleeg.',
    en: 'A pursuit that runs into a neighbour’s sector can be handed over to their desk. When somebody leaves, the AI colleague takes over their desk.',
  },
  'desk.rules.4': {
    et: 'Kogemuspunktid lähevad iga mängija karjääri üks kord: meeskonna punktid ja osa oma laua tööst, sh naabrite abistamine.',
    en: 'Experience goes into every player’s career once: the team’s points and a share for their desk’s work, helping the neighbours included.',
  },
  'desk.run.text': {
    et: 'Ühisvahetus algas {time}. Igaüks töötab oma sektori laua taga.',
    en: 'The shared shift started at {time}. Everyone works at their own sector’s desk.',
  },

  // Game: the desks
  'desk.colleague': { et: 'AI-kolleeg {name}', en: 'AI colleague {name}' },
  'desk.panel.desk': { et: 'Laud', en: 'Desk' },
  'desk.queue.mine': { et: 'Minu laud: {desk}', en: 'My desk: {desk}' },
  'desk.queue.neighbours': { et: 'Naaberlauad ({n})', en: 'Neighbouring desks ({n})' },
  'desk.queue.away': {
    et: 'Sinu lauda hoiab praegu AI-kolleeg. Naase ruumi kaudu.',
    en: 'An AI colleague holds your desk for now. Come back through the room.',
  },
  'desk.note.incident': {
    et: 'Naaberlaua sündmus: {desk}, juhib {who}. Saad pakkuda oma ekipaaži.',
    en: 'A neighbouring desk’s event: {desk}, run by {who}. You can offer one of your crews.',
  },
  'desk.note.unit': {
    et: 'Naaberlaua ekipaaž: {desk}, juhib {who}. Laenamiseks küsi seda oma sündmusele.',
    en: 'A neighbouring desk’s crew: {desk}, run by {who}. Ask for it on one of your events to borrow it.',
  },
  'desk.note.shared': {
    et: 'Prefektuuri valveüksus: iga laud saab seda saata.',
    en: 'A prefecture on-call asset: every desk can send it.',
  },
  'desk.lend.title': { et: 'Naaberlaudade vabad ekipaažid', en: 'Neighbouring desks’ free crews' },
  'desk.lend.ask': { et: 'Küsi', en: 'Ask' },
  'desk.lend.askTitle': {
    et: 'Palu ekipaaž {cs} laenuks lauast {desk}',
    en: 'Ask the {desk} desk to lend crew {cs}',
  },
  'desk.lend.offerTitle': { et: 'Paku oma ekipaaži', en: 'Offer one of your crews' },
  'desk.lend.offer': { et: 'Paku', en: 'Offer' },
  'desk.lend.offerHint': { et: 'Paku ekipaaž {cs} lauale {desk}', en: 'Offer crew {cs} to the {desk} desk' },
  'desk.lend.none': { et: 'Vaba ekipaaži ei ole.', en: 'No free crew.' },
  'desk.lend.sending': { et: 'Saadan…', en: 'Sending…' },
  'desk.lend.state.open': { et: 'ootab vastust', en: 'waiting for an answer' },
  'desk.lend.state.accepted': { et: 'nõustus', en: 'accepted' },
  'desk.lend.state.declined': { et: 'keeldus', en: 'declined' },
  'desk.lend.state.expired': { et: 'aegus', en: 'lapsed' },
  'desk.lend.state.failed': { et: 'ei õnnestunud', en: 'did not work out' },
  'desk.req.title': { et: 'Laenupalved', en: 'Lend requests' },
  'desk.req.ask': {
    et: '{desk} palub ekipaaži {cs}: {code} {title}',
    en: '{desk} asks for crew {cs}: {code} {title}',
  },
  'desk.req.offer': {
    et: '{desk} pakub ekipaaži {cs}: {code} {title}',
    en: '{desk} offers crew {cs}: {code} {title}',
  },
  'desk.req.give': { et: 'Anna', en: 'Lend' },
  'desk.req.take': { et: 'Võta vastu', en: 'Accept' },
  'desk.req.no': { et: 'Keeldu', en: 'Decline' },
  'desk.req.mine': { et: '{cs} → {desk}: {state}', en: '{cs} → {desk}: {state}' },
  'desk.req.toast': { et: 'Laenupalve naaberlaualt', en: 'Lend request from the next desk' },
  'desk.seat.countsTitle': {
    et: 'Kõned / saadetud ekipaažid / laenatud ekipaažid',
    en: 'Calls / crews sent / crews lent',
  },
  // Taking over a desk nobody holds (docs/MULTIPLAYER.md section 12)
  'desk.free.row': {
    et: '{desk}: lauas pole kedagi, kolleeg {name} hoiab seda.',
    en: '{desk}: nobody at the desk, colleague {name} holds it.',
  },
  'desk.take': { et: 'Võta üle', en: 'Take over' },
  'desk.take.title': {
    et: 'Võta laud {desk} enda kätte: selle sündmused, ekipaažid ja 112 kõned on siis sinu omad',
    en: 'Take the {desk} desk: its events, crews and 112 calls are then yours',
  },
  'desk.taken.row': {
    et: '{desk}: sinu käes. Omanik saab selle tagasi, kui naaseb.',
    en: '{desk}: yours now. Its player gets it back on return.',
  },
  'desk.give': { et: 'Anna tagasi', en: 'Hand back' },
  'desk.give.title': {
    et: 'Anna laud {desk} kolleeg {name} kätte',
    en: 'Hand the {desk} desk to colleague {name}',
  },
  'desk.board.neighbours': { et: 'Naabrid', en: 'Neighbours' },
  'desk.board.neighboursTitle': {
    et: 'Näita naaberlaudade ekipaaže',
    en: 'Show the neighbouring desks’ crews',
  },

  // Report
  'desk.rep.title': { et: 'Töölauad', en: 'Desks' },
  'desk.rep.meta': { et: 'Iga sektori laua töö', en: 'What each sector desk did' },
  'desk.rep.col.desk': { et: 'Töölaud', en: 'Desk' },
  'desk.rep.col.who': { et: 'Juhtis', en: 'Run by' },
  'desk.rep.col.incidents': { et: 'Sündmused', en: 'Events' },
  'desk.rep.col.closed': { et: 'Lõpetatud', en: 'Closed' },
  'desk.rep.col.lent': { et: 'Laenas', en: 'Lent' },
  'desk.rep.col.helped': { et: 'Abistas', en: 'Helped' },
  'desk.rep.col.handover': { et: 'Üle antud', en: 'Handed over' },
  'desk.rep.col.taken': { et: 'Kolleegile', en: 'To colleague' },
} satisfies Dict;
