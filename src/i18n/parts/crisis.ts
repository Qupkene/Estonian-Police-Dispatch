// Suurõnnetus (2.37.0, docs/CRISIS.md): the staff panel, the briefing, the bar over the map, the notes and toasts
// (src/ui/game/CrisisPanel.tsx), and the crisis in the shift report.
import type { Dict } from '../index';

export default {
  'game.crisis.tab': { et: 'Staap', en: 'Staff' },
  'game.crisis.kicker': { et: 'Suurõnnetus', en: 'Major incident' },
  'game.crisis.barTitle': { et: 'Ava staap: ülesanded, otsused, olukord', en: 'Open the staff: tasks, decisions, situation' },
  'game.crisis.barTasks': { et: '{done}/{all} ülesannet tehtud', en: '{done}/{all} tasks done' },
  'game.crisis.barWaiting': { et: '{n} ootab ekipaaži', en: '{n} waiting for a crew' },
  'game.crisis.barDecision': { et: 'Otsus ootab', en: 'Decision waiting' },

  'game.crisis.level': { et: 'Olukord', en: 'Situation' },
  'game.crisis.levelMax': { et: 'Halvim olukord', en: 'Worst situation' },
  'game.crisis.level.0': { et: 'Kontrolli all', en: 'Under control' },
  'game.crisis.level.1': { et: 'Pingeline', en: 'Tense' },
  'game.crisis.level.2': { et: 'Kriitiline', en: 'Critical' },
  'game.crisis.level.3': { et: 'Väga kriitiline', en: 'Very critical' },

  // The briefing when it breaks out
  'game.crisis.briefTitle': { et: 'Suurõnnetus', en: 'Major incident' },
  'game.crisis.toStaff': { et: 'Ava staap', en: 'Open the staff' },
  'game.crisis.briefNow': { et: 'Kohe', en: 'Now' },
  'game.crisis.briefDeadline': { et: 'ekipaaž {n} min jooksul', en: 'a crew within {n} min' },
  'game.crisis.briefLater': { et: 'Hiljem', en: 'Later' },
  'game.crisis.briefAt': { et: '{n} min pärast', en: 'in {n} min' },
  'game.crisis.how': {
    et: 'Ülesanded on järjekorras tavaliste väljakutsetena (kood SUUR). Kui ülesanne ootab ekipaaži üle tähtaja, olukord halveneb ja tuleb uus ülesanne. Staap küsib sinult otsuseid: kui sa 10 minutiga ei vasta, otsustab staap ise.',
    en: 'The tasks are in the queue as ordinary calls (code SUUR). When a task waits for a crew past its deadline, the situation gets worse and a new task comes. The staff asks you for decisions: if you do not answer in 10 minutes, the staff decides.',
  },
  'game.crisis.howCoop': {
    et: 'Ülesanded on järjekorras tavaliste väljakutsetena (kood SUUR). Üks mängija juhib staapi ja teeb otsused; kui keegi ei juhi, otsustab staap ise.',
    en: 'The tasks are in the queue as ordinary calls (code SUUR). One player commands the staff and makes the decisions; when nobody does, the staff decides.',
  },
  'game.crisis.howLead': {
    et: 'Ülesanded on järjekorras tavaliste väljakutsetena (kood SUUR). Sina juhid staapi: otsused on sinu.',
    en: 'The tasks are in the queue as ordinary calls (code SUUR). You command the staff: the decisions are yours.',
  },

  // The staff panel
  'game.crisis.decisions': { et: 'Otsused', en: 'Decisions' },
  'game.crisis.tasks': { et: 'Ülesanded', en: 'Tasks' },
  'game.crisis.take': { et: 'Võta juhtimine', en: 'Take command' },
  'game.crisis.takeOver': { et: 'Võta üle', en: 'Take over' },
  'game.crisis.leadYou': { et: 'Sina juhid staapi.', en: 'You command the staff.' },
  'game.crisis.leadBy': { et: 'Staapi juhib {name}.', en: '{name} commands the staff.' },
  'game.crisis.leadNobody': {
    et: 'Staapi ei juhi keegi: otsused teeb staap ise.',
    en: 'Nobody commands the staff: it makes the decisions itself.',
  },
  'game.crisis.byStaff': { et: 'staap otsustas', en: 'by the staff' },
  'game.crisis.defaultIn': {
    et: 'Kui keegi {t} jooksul ei otsusta, valib staap: {option}',
    en: 'If nobody decides within {t}, the staff picks: {option}',
  },
  'game.crisis.onlyLead': { et: 'Otsustab staabi juht.', en: "The staff's commander decides." },
  'game.crisis.helpOn': {
    et: 'Naabrid aitavad: ülesande, mis ootab üle tähtaja veel {n} min, võtab üle naaberüksus (vähem punkte).',
    en: 'The neighbours help: a task that waits {n} min past its deadline goes to a neighbouring unit (fewer points).',
  },
  'game.crisis.helpOff': {
    et: 'Abi ei küsitud: ootavaid ülesandeid keegi üle ei võta.',
    en: 'No help asked: nobody takes over the tasks that wait.',
  },
  'game.crisis.anyDesk': { et: 'Iga laud võib saata oma ekipaaže.', en: 'Every desk may send its own crews.' },
  'game.crisis.st.later': { et: 'avaneb {t}', en: 'opens at {t}' },
  'game.crisis.st.waiting': { et: 'ootab ekipaaži, aega {t}', en: 'waiting for a crew, {t} left' },
  'game.crisis.st.escalated': { et: 'üle tähtaja, olukord halvenes', en: 'past its deadline, the situation got worse' },
  'game.crisis.st.escalatedHelp': {
    et: 'üle tähtaja, naabrid võtavad üle {t} pärast',
    en: 'past its deadline, the neighbours take over in {t}',
  },
  'game.crisis.st.enroute': { et: 'teel: {crews}', en: 'en route: {crews}' },
  'game.crisis.st.onscene': { et: 'kohal: {crews}', en: 'on scene: {crews}' },
  'game.crisis.st.helped': { et: 'naaberüksus võttis üle', en: 'a neighbouring unit took over' },
  'game.crisis.st.done': { et: 'tehtud, {n} punkti', en: 'done, {n} points' },
  'game.crisis.followTitle': {
    et: 'Tekkis, sest üks ülesanne ootas liiga kaua',
    en: 'It came because a task waited too long',
  },
  'game.crisis.result': { et: 'Tulemus', en: 'Result' },
  'game.crisis.endedAt': { et: 'Lahendatud', en: 'Resolved' },
  'game.crisis.took': { et: '{n} min', en: '{n} min' },
  'game.crisis.helped': { et: 'Naabrid aitasid', en: 'Neighbours helped' },

  // On a crisis task's incident
  'game.crisis.noteTask': { et: 'Suurõnnetuse ülesanne: {task} ({title}).', en: 'Major incident task: {task} ({title}).' },
  'game.crisis.noteDeadline': {
    et: 'Saada ekipaaž {t} jooksul, muidu olukord halveneb.',
    en: 'Send a crew within {t}, or the situation gets worse.',
  },
  'game.crisis.noteEscalated': {
    et: 'Ootas üle tähtaja: olukord halvenes.',
    en: 'It waited past its deadline: the situation got worse.',
  },

  // The shift report
  'crisis.rep.title': { et: 'Suurõnnetus', en: 'Major incident' },
  'crisis.rep.took': { et: 'Lahendati {n} minutiga', en: 'Resolved in {n} min' },
  'crisis.rep.open': { et: 'Jäi vahetuse lõpuks lahendamata', en: 'Not resolved by the end of the shift' },
  'crisis.rep.level': { et: 'Halvim olukord: {level}', en: 'Worst situation: {level}' },
  'crisis.rep.helped': { et: 'Naabrid võtsid üle: {n}', en: 'Taken over by the neighbours: {n}' },
  'crisis.rep.lead': { et: 'Staapi juhtis {name}', en: 'Commanded by {name}' },
  'crisis.rep.tasks': { et: 'Ülesanded', en: 'Tasks' },
  'crisis.rep.decisions': { et: 'Otsused', en: 'Decisions' },
  'crisis.rep.escalated': { et: 'ootas liiga kaua', en: 'waited too long' },
  'crisis.rep.taskHelped': { et: 'naabrid', en: 'neighbours' },

  // Toasts
  'game.toast.crisisDecision': { et: 'Staap ootab otsust', en: 'The staff needs a decision' },
  'game.toast.crisisEscalated': { et: 'Suurõnnetus halvenes', en: 'The major incident got worse' },
  'game.toast.crisisEnd': { et: 'Suurõnnetus lahendatud', en: 'Major incident resolved' },
} satisfies Dict;
