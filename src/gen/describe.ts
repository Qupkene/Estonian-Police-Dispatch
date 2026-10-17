// Owned by gen-people. Witness-style descriptions of persons and vehicles (et + en).
import { wall } from '@/sim/time';
import type { Appearance, Gender, Person, Text, Vehicle } from '@/sim/types';

/** Visible tattoos; `rough` ones are reserved for people with a criminal past. */
export const TATTOOS: { text: Text; gender?: Gender; rough?: boolean }[] = [
  { text: { et: 'lohe paremal käsivarrel', en: 'dragon on the right forearm' } },
  { text: { et: 'rist vasakul randmel', en: 'cross on the left wrist' } },
  { text: { et: 'ankur parema käe seljal', en: 'anchor on the back of the right hand' }, gender: 'M' },
  {
    text: { et: 'kiri „Mama“ vasakul õlavarrel', en: '"Mama" lettering on the left upper arm' },
    gender: 'M',
  },
  { text: { et: 'roosid kaelal', en: 'roses on the neck' } },
  { text: { et: 'tähed sõrmenukkidel', en: 'letters on the knuckles' }, rough: true },
  { text: { et: 'okastraat ümber käsivarre', en: 'barbed wire around the forearm' }, rough: true },
  { text: { et: 'hundipea paremal õlal', en: 'wolf head on the right shoulder' }, gender: 'M' },
  { text: { et: 'ämblikuvõrk vasakul küünarnukil', en: 'spider web on the left elbow' }, rough: true },
  { text: { et: 'ornament vasakul säärel', en: 'ornamental pattern on the left calf' } },
  { text: { et: 'kolju parema käe seljal', en: 'skull on the back of the right hand' }, rough: true },
  { text: { et: 'lapse nimi vasakul randmel', en: "a child's name on the left wrist" } },
  { text: { et: 'pääsuke kaela küljel', en: 'swallow on the side of the neck' } },
  { text: { et: 'rukkilill pahkluul', en: 'cornflower on the ankle' }, gender: 'F' },
  { text: { et: 'liblikas vasakul abaluul', en: 'butterfly on the left shoulder blade' }, gender: 'F' },
  { text: { et: 'täheke kõrva taga', en: 'small star behind the ear' }, gender: 'F' },
  { text: { et: 'pisarad silmanurgas', en: 'teardrops at the corner of the eye' }, rough: true },
  { text: { et: 'tiigripea paremal õlavarrel', en: 'tiger head on the right upper arm' } },
  { text: { et: 'kompass vasakul käsivarrel', en: 'compass on the left forearm' } },
  { text: { et: 'lilleornament paremal randmel', en: 'floral pattern on the right wrist' }, gender: 'F' },
];

/** English text for a tattoo stored in Estonian (falls back to the original). */
export function tattooText(et: string): Text {
  return TATTOOS.find((t) => t.text.et === et)?.text ?? { et, en: et };
}

let lastWall: { minute: number; w: ReturnType<typeof wall> } | undefined;
function wallCached(now: number): ReturnType<typeof wall> {
  const minute = Math.floor(now / 60000);
  if (!lastWall || lastWall.minute !== minute) lastWall = { minute, w: wall(now) };
  return lastWall.w;
}

/** Exact age in full years at `now` (Tallinn calendar date) for a YYYY-MM-DD birth date. */
export function ageAt(birthDate: string, now: number): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  const w = wallCached(now);
  let a = w.year - y;
  if (w.month < m || (w.month === m && w.day < d)) a--;
  return a;
}

export function ageOf(p: Person, now: number): number {
  return ageAt(p.birthDate, now);
}

export function fullName(p: Pick<Person, 'firstName' | 'lastName'>): string {
  return `${p.firstName} ${p.lastName}`;
}

/** Age as a witness would guess it: rounded to 5 from 20 up. */
export function witnessAge(age: number): number {
  return age >= 20 ? Math.round(age / 5) * 5 : age;
}

function nounFor(gender: Gender, age: number): Text {
  const m = gender === 'M';
  if (age < 13) return m ? { et: 'poiss', en: 'boy' } : { et: 'tüdruk', en: 'girl' };
  if (age < 18) return m ? { et: 'noormees', en: 'teenage boy' } : { et: 'neiu', en: 'teenage girl' };
  if (age < 20) return m ? { et: 'noormees', en: 'young man' } : { et: 'neiu', en: 'young woman' };
  if (age >= 70)
    return m ? { et: 'eakas mees', en: 'elderly man' } : { et: 'eakas naine', en: 'elderly woman' };
  return m ? { et: 'mees', en: 'man' } : { et: 'naine', en: 'woman' };
}

/**
 * An English description used inside a sentence needs its article: "the attacker is a man, about
 * 30…", "an elderly woman…". describePerson itself stays a bare label ("man, about 30…").
 */
export function withArticleEn(desc: string): string {
  if (/^(a|an|the)\s/i.test(desc)) return desc;
  if (!/^(boy|girl|teenage|young|elderly|man|woman)\b/i.test(desc)) return desc;
  return `${/^[aeiou]/i.test(desc) ? 'an' : 'a'} ${desc}`;
}

const BUILD: Record<Appearance['build'], Text> = {
  slim: { et: 'kõhna kehaehitusega', en: 'slim build' },
  average: { et: 'keskmise kehaehitusega', en: 'medium build' },
  athletic: { et: 'sportliku kehaehitusega', en: 'athletic build' },
  heavy: { et: 'tugeva kehaehitusega', en: 'heavy build' },
};

/** Hair colour: Estonian genitive plural (for "…juustega") and English adjective. */
const HAIR_COLOR: Record<Appearance['hairColor'], Text> = {
  black: { et: 'mustade', en: 'black' },
  brown: { et: 'tumedate', en: 'dark' },
  blond: { et: 'heledate', en: 'fair' },
  red: { et: 'punaste', en: 'red' },
  grey: { et: 'hallide', en: 'grey' },
  white: { et: 'valgete', en: 'white' },
  dyed: { et: 'värvitud', en: 'dyed' },
};

/** Hair phrase in the comitative: "lühikeste tumedate juustega" / "short dark hair". */
export function hairPhrase(a: Pick<Appearance, 'hair' | 'hairColor'>): Text {
  const c = HAIR_COLOR[a.hairColor];
  switch (a.hair) {
    case 'bald':
      return { et: 'kiilaspäine', en: 'bald' };
    case 'shaved':
      return { et: 'kiilaks aetud peaga', en: 'shaved head' };
    case 'buzz':
      return { et: `lühikeseks pöetud ${c.et} juustega`, en: `close-cropped ${c.en} hair` };
    case 'ponytail':
      return { et: `hobusesabasse seotud ${c.et} juustega`, en: `${c.en} hair in a ponytail` };
    case 'curly':
      return { et: `lokkis ${c.et} juustega`, en: `curly ${c.en} hair` };
    case 'long':
      return { et: `pikkade ${c.et} juustega`, en: `long ${c.en} hair` };
    default:
      return { et: `lühikeste ${c.et} juustega`, en: `short ${c.en} hair` };
  }
}

const BEARD: Record<NonNullable<Appearance['beard']>, Text> = {
  stubble: { et: 'habemetüükaga', en: 'stubble' },
  full: { et: 'habemega', en: 'a beard' },
  moustache: { et: 'vuntsidega', en: 'a moustache' },
  goatee: { et: 'kitsehabemega', en: 'a goatee' },
};

/** "a, b and c" */
function listEn(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Full witness-style description, e.g. "mees, umbes 35-aastane, u 182 cm, tugeva kehaehitusega,
 * lühikeste tumedate juustega, habemega, prillidega; seljas must talvejope".
 */
export function describePerson(p: Person, now: number): Text {
  const age = ageOf(p, now);
  const a = p.appearance;
  const noun = nounFor(p.gender, age);
  const wa = witnessAge(age);
  const hair = hairPhrase(a);
  const et = [noun.et, `umbes ${wa}-aastane`, `u ${a.heightCm} cm`, BUILD[a.build].et, hair.et];
  const en = [noun.en, `about ${wa} years old`, `approx. ${a.heightCm} cm`, BUILD[a.build].en, hair.en];
  const withEn: string[] = [];
  if (a.beard) {
    et.push(BEARD[a.beard].et);
    withEn.push(BEARD[a.beard].en);
  }
  if (a.glasses) {
    et.push('prillidega');
    withEn.push('glasses');
  }
  if (withEn.length) en.push(`with ${listEn(withEn)}`);
  if (a.tattoo) {
    const t = tattooText(a.tattoo);
    et.push(`tätoveering: ${t.et}`);
    en.push(`tattoo: ${t.en}`);
  }
  const clothing = a.clothing;
  return {
    et: et.join(', ') + (clothing?.et ? `; ${clothing.et}` : ''),
    en: en.join(', ') + (clothing?.en ? `; ${clothing.en}` : ''),
  };
}

/** Short: "mees, 35a" / "male, 35". */
export function shortPerson(p: Person, now: number): Text {
  const age = ageOf(p, now);
  const m = p.gender === 'M';
  if (age < 13)
    return m ? { et: `poiss, ${age}a`, en: `boy, ${age}` } : { et: `tüdruk, ${age}a`, en: `girl, ${age}` };
  return m ? { et: `mees, ${age}a`, en: `male, ${age}` } : { et: `naine, ${age}a`, en: `female, ${age}` };
}

/** Brief suspect description for summaries: "mees, u 35a, seljas must talvejope". */
export function briefPerson(p: Person, now: number): Text {
  const age = ageOf(p, now);
  const noun = nounFor(p.gender, age);
  const wa = witnessAge(age);
  const top = {
    et: p.appearance.clothing?.et.split(', ')[0] ?? '',
    en: p.appearance.clothing?.en.split(/, | and /)[0] ?? '',
  };
  return {
    et: `${noun.et}, u ${wa}a` + (top.et ? `, ${top.et}` : ''),
    en: `${noun.en}, approx. ${wa}` + (top.en ? `, ${top.en}` : ''),
  };
}

/** "hall Toyota Avensis (123 ABC)" / "grey Toyota Avensis (123 ABC)". */
export function describeVehicle(v: Vehicle): Text {
  const car = `${v.make} ${v.model}`.trim();
  const et = v.color?.et ? `${v.color.et.toLowerCase()} ${car}` : car;
  const en = v.color?.en ? `${v.color.en.toLowerCase()} ${car}` : car;
  return { et: `${et} (${v.plate})`, en: `${en} (${v.plate})` };
}

/** Vehicle without the plate: "hall Toyota Avensis" (for the {car} placeholder). */
export function vehicleName(v: Vehicle): Text {
  const car = `${v.make} ${v.model}`.trim();
  return {
    et: v.color?.et ? `${v.color.et.toLowerCase()} ${car}` : car,
    en: v.color?.en ? `${v.color.en.toLowerCase()} ${car}` : car,
  };
}
