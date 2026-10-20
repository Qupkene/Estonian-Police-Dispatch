// UI strings for the career's story in chapters (docs/STORY.md, src/sim/story.ts): the chapter panel on the career
// page, the line on the menu's Karjäär panel and the question notice. The chapters' own texts are in
// src/data/story.ts.
import type { Dict } from '../index';

export default {
  'story.title': { et: 'Lugu', en: 'Story' },
  'story.chapter': { et: 'Peatükk {n}', en: 'Chapter {n}' },
  'story.chapterTitle': { et: 'Peatükk {n} · {title}', en: 'Chapter {n} · {title}' },
  'story.of': { et: '{n}/{total}', en: '{n} of {total}' },
  'story.since': { et: 'alates P{day}', en: 'since D{day}' },
  'story.strip': { et: 'Peatükid', en: 'Chapters' },
  'story.seg': { et: 'Peatükk {n}: {title}, {state}', en: 'Chapter {n}: {title}, {state}' },
  'story.state.done': { et: 'lõpetatud', en: 'finished' },
  'story.state.current': { et: 'käimas', en: 'in progress' },
  'story.state.locked': { et: 'ees', en: 'ahead' },
  'story.state.before': { et: 'enne lugu', en: 'before the story' },
  'story.goals': { et: 'Eesmärgid', en: 'Objectives' },
  'story.met': { et: 'täidetud {met}/{need}', en: '{met} of {need} met' },
  'story.metOf': {
    et: 'Peatüki lõpetamiseks on vaja {need} eesmärki {total}-st.',
    en: 'Any {need} of the {total} objectives finish the chapter.',
  },
  'story.shiftsLeft': {
    et: 'Eesmärgid on täidetud, peatükk lõpeb pärast veel {n} vahetust.',
    en: 'The objectives are met; the chapter ends after {n} more shifts.',
  },
  'story.shiftsLeftOne': {
    et: 'Eesmärgid on täidetud, peatükk lõpeb pärast järgmist vahetust.',
    en: 'The objectives are met; the chapter ends after your next shift.',
  },
  'story.goalDone': { et: 'täidetud', en: 'met' },
  'story.goalOpen': { et: 'täitmata', en: 'open' },
  'story.readAll': { et: 'Loe kogu tekst', en: 'Read it all' },
  'story.cast': { et: 'Tegelased', en: 'Cast' },
  'story.ask': { et: 'Küsimus', en: 'Question' },
  'story.noMoney': { et: 'Eelarves pole piisavalt raha', en: 'Not enough money in the budget' },
  'story.answered': { et: 'Vastus on antud', en: 'Answer given' },
  'story.answerFailed': { et: 'Vastata ei õnnestunud', en: 'Could not answer' },
  'story.waiting': { et: 'Peatükk on lõpetatud.', en: 'Chapter finished.' },
  'story.next': { et: 'Järgmine: {title}', en: 'Next: {title}' },
  'story.nextNeeds': { et: 'Algab, kui:', en: 'Begins when:' },
  'story.nextReady': { et: 'Algab pärast sinu järgmist vahetust.', en: 'Begins after your next shift.' },
  'story.told': {
    et: 'Lugu on jutustatud. Karjäär jätkub: vahetused, sektorid ja prefektuurid on endiselt sinu.',
    en: 'The story is told. The career goes on: the shifts, sectors and prefectures are still yours.',
  },
  'story.notStarted': {
    et: 'Lugu algab sinu järgmise vahetusega sellest peatükist.',
    en: 'The story begins at this chapter with your next shift.',
  },
  'story.before': {
    et: 'Peatükid enne {n}. peatükki jäid sinu karjääris enne lugu.',
    en: 'The chapters before chapter {n} came before the story in your career.',
  },
  'story.intro': { et: 'Sissejuhatus', en: 'Introduction' },
  'story.note.ask': { et: '{text} Vasta karjääri lehel.', en: '{text} Answer it on the career page.' },
  'story.menu': {
    et: 'Peatükk {n}/{total} · {title} · eesmärke {met}/{need}',
    en: 'Chapter {n}/{total} · {title} · {met}/{need} objectives',
  },
  'story.menuWaiting': {
    et: 'Peatükk {n}/{total} · {title} · lõpetatud',
    en: 'Chapter {n}/{total} · {title} · finished',
  },
  'story.menuTold': { et: 'Lugu jutustatud · {total} peatükki', en: 'Story told · {total} chapters' },
  'story.menuAsk': { et: 'küsimus ootab', en: 'a question waits' },
  'story.press': { et: '{byline}', en: '{byline}' },
  'shell.menu.note.story': { et: 'Lugu', en: 'Story' },
} satisfies Dict;
