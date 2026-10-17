/** Fixture incident templates covering every beat kind the engine handles. */
import type { IncidentTemplate, OutcomeSpec, Text } from '@/sim/types';

const T = (et: string, en: string): Text => ({ et, en });

const OK: OutcomeSpec = { id: 'ok', weight: 1, result: 'resolved', text: T('{callsign}: korras.', '{callsign}: done.') };

export const T_SIMPLE: IncidentTemplate = {
  id: 't_simple',
  category: 'assist',
  code: 'AB',
  title: T('Abipalve', 'Request for help'),
  priority: 3,
  weight: 5,
  places: ['street'],
  units: { need: [{ type: 'patrol', count: 1 }] },
  onScene: [10, 10],
  persons: [{ role: 'caller' }],
  summary: [T('{address}. Teataja vajab abi.', '{address}. Caller needs help.')],
  details: [T('Teataja on eakas.', 'The caller is elderly.')],
  outcomes: [OK],
  expiresMin: 30,
};

export const T_QUERY: IncidentTemplate = {
  id: 't_query',
  category: 'violence',
  code: 'KV',
  title: T('Kehaline väärkohtlemine', 'Assault'),
  priority: 2,
  weight: 2,
  places: ['street'],
  units: { need: [{ type: 'patrol', count: 1 }] },
  onScene: [15, 15],
  persons: [
    { role: 'suspect', wanted: 1, gender: 'M', age: [20, 40] },
    { role: 'victim', age: [20, 60] },
  ],
  summary: [T('{address}. Mees lõi möödujat. Kahtlustatav: {suspect}.', '{address}. A man hit a passer-by. Suspect: {suspect}.')],
  beats: [
    {
      kind: 'query',
      queryType: 'person',
      subject: 'suspect',
      at: 'arrive',
      radio: [T('Juhtimiskeskus, {callsign}. Kontrolli isikut {name}, isikukood {idcode}.', 'Control, {callsign}. Check {name}, ID code {idcode}.')],
    },
  ],
  outcomes: [
    { id: 'arrest', weight: 1, minSuccess: 0.5, result: 'arrest', arrests: 1, text: T('{callsign}: kahtlustatav kinni peetud.', '{callsign}: suspect detained.') },
    { id: 'escaped', weight: 1, maxSuccess: 0.5, result: 'escaped', text: T('{callsign}: kahtlustatav pääses.', '{callsign}: suspect got away.') },
  ],
  tags: ['violent'],
};

export const T_VQUERY: IncidentTemplate = {
  id: 't_vquery',
  category: 'traffic',
  code: 'LJ',
  title: T('Liiklusjärelevalve', 'Traffic stop'),
  priority: 3,
  weight: 2,
  places: ['street'],
  units: { need: [{ type: 'patrol', count: 1 }] },
  onScene: [8, 8],
  persons: [{ role: 'driver' }],
  vehicles: [{ role: 'suspect', stolen: 1, driverRole: 'driver' }],
  summary: [T('{address}. Peatati sõiduk {car}.', '{address}. Stopped {car}.')],
  beats: [{ kind: 'query', queryType: 'vehicle', subject: 'vehicle', at: 'arrive', radio: [] }],
  outcomes: [OK],
};

export const T_BACKUP: IncidentTemplate = {
  id: 't_backup',
  category: 'violence',
  code: 'KL',
  title: T('Kaklus', 'Fight'),
  priority: 2,
  weight: 2,
  places: ['bar'],
  units: { need: [{ type: 'patrol', count: 1 }], ideal: [{ type: 'patrol', count: 2 }] },
  onScene: [12, 12],
  persons: [{ role: 'suspect' }, { role: 'victim' }],
  summary: [T('{place}, {address}. Kaklus.', '{place}, {address}. A fight.')],
  beats: [
    {
      kind: 'backup',
      at: 'arrive',
      need: { type: 'patrol', count: 1 },
      timeoutMin: 3,
      failEffects: { success: -0.3, trust: -6 },
      successEffects: { success: 0.1 },
      radio: [T('{callsign}: toetust vajab, kaklus laieneb!', '{callsign}: need backup, the fight is spreading!')],
    },
  ],
  outcomes: [OK],
};

export const T_CHOICE: IncidentTemplate = {
  id: 't_choice',
  category: 'domestic',
  code: 'PV',
  title: T('Perevägivald', 'Domestic violence'),
  priority: 2,
  weight: 2,
  places: ['residential', 'street'],
  units: { need: [{ type: 'patrol', count: 1 }] },
  onScene: [20, 20],
  persons: [{ role: 'victim', gender: 'F' }, { role: 'suspect', gender: 'M', relation: 'partner', restraining: 1 }],
  summary: [T('{address}. Naine hüüab appi.', '{address}. A woman is calling for help.')],
  beats: [
    {
      kind: 'choice',
      at: 2,
      timeoutMin: 4,
      defaultOption: 'go',
      radio: [T('{callsign}: uks lukus. Kas siseneme jõuga?', '{callsign}: door locked. Force entry?')],
      options: [
        { id: 'wait', label: T('Oodake toetust', 'Wait for backup'), reply: T('{callsign}, oodake.', '{callsign}, wait.'), effects: { success: 0.1 } },
        { id: 'go', label: T('Sisenege', 'Go in'), reply: T('{callsign}, sisenege.', '{callsign}, go in.'), effects: { success: -0.1, risk: 0.1 } },
      ],
    },
  ],
  outcomes: [OK],
};

export const T_TRANSPORT: IncidentTemplate = {
  id: 't_transport',
  category: 'public_order',
  code: 'JI',
  title: T('Joobes isik', 'Drunk person'),
  priority: 3,
  weight: 2,
  places: ['street'],
  units: { need: [{ type: 'patrol', count: 1 }] },
  onScene: [8, 8],
  persons: [{ role: 'suspect', intoxicated: 1 }],
  summary: [T('{address}. Joobes mees lamab maas.', '{address}. A drunk man lies on the ground.')],
  beats: [{ kind: 'transport', at: 4, dest: 'arrest', paperworkMin: [10, 10], radio: [T('{callsign}: toimetame kainenema.', '{callsign}: taking him to sober up.')] }],
  outcomes: [{ id: 'arrest', weight: 1, result: 'arrest', arrests: 1, text: T('{callsign}: toimetatud.', '{callsign}: transported.') }],
};

export const T_AGENCY: IncidentTemplate = {
  id: 't_agency',
  category: 'traffic',
  code: 'LÕ',
  title: T('Liiklusõnnetus kannatanuga', 'Traffic accident with injuries'),
  priority: 1,
  weight: 2,
  places: ['street'],
  units: { need: [{ type: 'patrol', count: 1 }] },
  onScene: [15, 15],
  persons: [{ role: 'victim' }],
  summary: [T('{address}. Kokkupõrge, üks vigastatu.', '{address}. Collision, one injured.')],
  beats: [
    {
      kind: 'agency',
      agency: 'kiirabi',
      at: 'arrive',
      timeoutMin: 5,
      failEffects: { success: -0.2 },
      successEffects: { success: 0.05 },
      radio: [T('{callsign}: vajame kiirabi!', '{callsign}: we need an ambulance!')],
    },
    { kind: 'info', at: 5, radio: [T('{callsign}: liiklus suunatud ümber.', '{callsign}: traffic diverted.')] },
  ],
  outcomes: [OK],
};

export const T_ESCALATE: IncidentTemplate = {
  id: 't_escalate',
  category: 'public_order',
  code: 'ÖR',
  title: T('Öörahu rikkumine', 'Noise complaint'),
  priority: 3,
  weight: 2,
  places: ['residential', 'street'],
  units: { need: [{ type: 'patrol', count: 1 }] },
  onScene: [10, 10],
  persons: [{ role: 'caller' }],
  summary: [T('{address}. Vali muusika.', '{address}. Loud music.')],
  escalation: { afterMin: 5, chance: 1, toPriority: 1, text: T('Teataja kuuleb karjumist.', 'The caller hears screaming.') },
  outcomes: [OK],
  expiresMin: 120,
};

export const T_EASTER: IncidentTemplate = {
  id: 't_easter',
  category: 'easter',
  code: 'XX',
  title: T('Kass puu otsas', 'Cat in a tree'),
  priority: 4,
  weight: 40,
  places: ['street'],
  units: { need: [{ type: 'any', count: 1 }] },
  onScene: [5, 5],
  persons: [],
  summary: [T('Kass puu otsas.', 'Cat in a tree.')],
  outcomes: [OK],
  easterEgg: true,
};

export const T_ARMED: IncidentTemplate = {
  id: 't_armed',
  category: 'violence',
  code: 'RR',
  title: T('Relvastatud rööv', 'Armed robbery'),
  priority: 1,
  weight: 1,
  places: ['mall', 'street'],
  units: { need: [{ type: 'patrol', count: 2 }], ideal: [{ type: 'rapid', count: 1 }] },
  onScene: [25, 25],
  persons: [{ role: 'suspect', weapon: 1 }],
  summary: [T('{place}. Relvastatud rööv.', '{place}. Armed robbery.')],
  outcomes: [OK],
  tags: ['armed'],
};

export const FIXTURE_TEMPLATES: IncidentTemplate[] = [T_SIMPLE, T_QUERY, T_VQUERY, T_BACKUP, T_CHOICE, T_TRANSPORT, T_AGENCY, T_ESCALATE, T_EASTER, T_ARMED];
