// UI strings for accounts, cloud saves and the leaderboard (src/net, login, menu, report).
import type { Dict } from '../index';

export default {
  // ── Login screen ──
  'account.login.offline': {
    et: 'Kontod töötavad politsei.eu serveris. Siin saad mängida külalisena.',
    en: 'Accounts work on the politsei.eu server. Here you can play as a guest.',
  },
  'account.login.note': {
    et: 'Konto hoiab sinu karjääri ja salvestused pilves, igas seadmes.',
    en: 'An account keeps your career and saves in the cloud, on every device.',
  },
  'account.login.simNote': {
    et: 'Simulatsioon: päris ID-kaarti, Mobiil-ID-d ega Smart-ID-d ei kasutata. Konto salvestab nime, parooli räsi ja mänguseisu politsei.eu serverisse.',
    en: 'Simulation: no real ID card, Mobile-ID or Smart-ID is used. An account stores your name, a password hash and your progress on the politsei.eu server.',
  },
  'account.login.hint': {
    et: 'Kasutajakonto? Logi sisse vahekaardil Klassika.',
    en: 'Have an account? Sign in on the Classic tab.',
  },
  'account.login.toRegister': { et: 'Pole veel kontot? Loo konto', en: 'No account yet? Create one' },
  'account.login.toLogin': { et: 'Mul on juba konto. Logi sisse', en: 'I already have an account. Sign in' },
  'account.login.busy': { et: 'Ühendan…', en: 'Connecting…' },
  'account.register.title': { et: 'Loo konto', en: 'Create account' },
  'account.register.submit': { et: 'Loo konto', en: 'Create account' },
  'account.register.repeat': { et: 'Korda parooli', en: 'Repeat password' },
  'account.rules': { et: 'Nõuded', en: 'Requirements' },
  'account.rule.name': {
    // No-break spaces keep "_ . -" together when the line wraps.
    et: 'Nimi: 3 kuni 24 märki, ladina tähed (ka õ, ä, ö, ü, š, ž), numbrid ja _\u00a0.\u00a0-',
    en: 'Name: 3 to 24 characters, Latin letters (including õ ä ö ü š ž), digits and _\u00a0.\u00a0-',
  },
  'account.rule.pass': { et: 'Parool: vähemalt 8 märki', en: 'Password: at least 8 characters' },
  'account.rule.repeat': { et: 'Paroolid kattuvad', en: 'Passwords match' },
  'account.rule.name.short': {
    et: 'Nimi on liiga lühike, vaja on vähemalt 3 märki.',
    en: 'The name is too short, it needs at least 3 characters.',
  },
  'account.rule.name.long': {
    et: 'Nimi on liiga pikk, lubatud on kuni 24 märki.',
    en: 'The name is too long, 24 characters at most.',
  },
  'account.rule.name.chars': {
    et: 'Nimes võivad olla ainult ladina tähed (ka õ, ä, ö, ü, š, ž), numbrid ja märgid _ . -',
    en: 'The name may only contain Latin letters (including õ ä ö ü š ž), digits and the characters _ . -',
  },
  'account.rule.pass.short': {
    et: 'Parool peab olema vähemalt {n} märki pikk.',
    en: 'The password must be at least {n} characters long.',
  },
  'account.rule.pass.mismatch': { et: 'Paroolid ei kattu.', en: 'The passwords do not match.' },
  'account.resume.title': { et: 'Sisse logitud: {name}', en: 'Signed in: {name}' },
  'account.resume.text': {
    et: 'Sinu karjäär ja salvestused on pilves olemas.',
    en: 'Your career and saves are waiting in the cloud.',
  },
  'account.resume.continue': { et: 'Jätka', en: 'Continue' },
  'account.lost': {
    et: 'Sessioon lõppes. Logi uuesti sisse, et pilvesalvestus jätkuks.',
    en: 'Your session ended. Sign in again to keep saving to the cloud.',
  },

  // ── Account chip (menu) ──
  'account.method': { et: 'Konto', en: 'Account' },
  'account.logout': { et: 'Logi välja', en: 'Sign out' },
  'account.chip.menu': { et: 'Konto valikud', en: 'Account options' },
  'account.chip.since': { et: 'Konto loodud {date}', en: 'Account created {date}' },
  'account.chip.relogin': { et: 'Logi uuesti sisse', en: 'Sign in again' },
  'account.cloud.saved': { et: 'Pilves salvestatud', en: 'Saved in the cloud' },
  'account.cloud.saving': { et: 'Salvestan pilve…', en: 'Saving to the cloud…' },
  'account.cloud.error': {
    et: 'Pilvesalvestus ebaõnnestus, proovin uuesti',
    en: 'Cloud save failed, trying again',
  },
  'account.cloud.off': { et: 'Pilvesalvestus väljas', en: 'Cloud save off' },
  'account.delete': { et: 'Kustuta konto', en: 'Delete account' },
  'account.delete.title': { et: 'Kustuta konto', en: 'Delete account' },
  'account.delete.text': {
    et: 'Konto {name} kustutatakse jäädavalt koos pilvesalvestuste, karjääri ja edetabeli tulemustega. Selles brauseris olevad andmed jäävad alles ja saad jätkata külalisena.',
    en: 'The account {name} is deleted for good, together with its cloud saves, career and leaderboard results. The data in this browser stays and you can carry on as a guest.',
  },
  'account.delete.password': { et: 'Kinnita parooliga', en: 'Confirm with your password' },
  'account.delete.confirm': { et: 'Kustuta jäädavalt', en: 'Delete for good' },
  'account.delete.cancel': { et: 'Loobu', en: 'Cancel' },

  // ── Settings ──
  'account.set.storage': {
    et: 'Sinu konto andmed on ka politsei.eu serveris. Kõigi andmete kustutamine logib sind välja ja eemaldab andmed ainult sellest brauserist. Konto kustutamiseks ava peamenüüs konto valikud.',
    en: 'Your account data is also kept on the politsei.eu server. Deleting all data signs you out and removes the data from this browser only. To delete the account, open the account options in the main menu.',
  },
  'account.set.clearAll': {
    et: 'Sind logitakse välja. Konto ja selle pilvesalvestused jäävad serverisse alles.',
    en: 'You will be signed out. The account and its cloud saves stay on the server.',
  },

  // ── Guest hint (menu) ──
  'account.guest.title': { et: 'Mängi igas seadmes', en: 'Play on every device' },
  'account.guest.text': {
    et: 'Konto hoiab sinu karjääri ja salvestused alles igas seadmes ning viib tulemused edetabelisse.',
    en: 'An account keeps your career and saves on every device and puts your results on the leaderboard.',
  },
  'account.guest.cta': { et: 'Loo konto', en: 'Create account' },

  // ── Leaderboard ──
  'account.lb.title': { et: 'Edetabel', en: 'Leaderboard' },
  'account.lb.top': { et: 'TOP 10', en: 'TOP 10' },
  'account.lb.filter': { et: 'Prefektuur', en: 'Prefecture' },
  'account.lb.all': { et: 'Kõik', en: 'All' },
  'account.lb.region.pohja': { et: 'Põhja', en: 'North' },
  'account.lb.region.ida': { et: 'Ida', en: 'East' },
  'account.lb.region.louna': { et: 'Lõuna', en: 'South' },
  'account.lb.region.laane': { et: 'Lääne', en: 'West' },
  'account.lb.loading': { et: 'Laadin edetabelit…', en: 'Loading the leaderboard…' },
  'account.lb.empty': {
    et: 'Edetabel on veel tühi. Lõpeta vahetus ja ole esimene!',
    en: 'The leaderboard is still empty. Finish a shift and be the first!',
  },
  'account.lb.error': { et: 'Edetabelit ei õnnestunud laadida.', en: 'Could not load the leaderboard.' },
  'account.lb.retry': { et: 'Proovi uuesti', en: 'Try again' },
  'account.lb.you': { et: 'sina', en: 'you' },
  'account.lb.score': { et: '{score} punkti', en: '{score} points' },
  'account.lb.incidents': { et: '{n} sündmust', en: '{n} incidents' },

  // ── Report ──
  'account.rep.rank': { et: 'Sinu koht edetabelis: {rank}', en: 'Your place on the leaderboard: {rank}' },
  'account.rep.ranked': { et: 'Tulemus on edetabelis.', en: 'Your result is on the leaderboard.' },
  'account.rep.sending': { et: 'Saadan tulemust edetabelisse…', en: 'Sending your result to the leaderboard…' },
  'account.rep.error': { et: 'Tulemuse saatmine ebaõnnestus.', en: 'Could not send your result.' },
  'account.rep.retry': { et: 'Proovi uuesti', en: 'Try again' },
  'account.rep.notRanked': {
    et: 'Selle režiimi tulemusi edetabelisse ei kanta.',
    en: 'Results from this mode do not go on the leaderboard.',
  },
  'account.rep.empty': {
    et: 'Vahetuses ei olnud ühtegi sündmust, seega see edetabelisse ei lähe.',
    en: 'There were no incidents in this shift, so it does not go on the leaderboard.',
  },
  'account.rep.guest': {
    et: 'Loo konto (peamenüüs), et su tulemused jõuaksid edetabelisse.',
    en: 'Create an account (in the main menu) to get your results on the leaderboard.',
  },

  // ── Errors (the Estonian UI shows the server's own message when there is one) ──
  'account.err.network': {
    et: 'Serveriga ei saanud ühendust. Proovi hiljem uuesti.',
    en: 'Could not reach the server. Try again later.',
  },
  'account.err.timeout': {
    et: 'Server ei vastanud õigel ajal. Proovi uuesti.',
    en: 'The server did not answer in time. Try again.',
  },
  'account.err.server': { et: 'Serveri viga. Proovi hiljem uuesti.', en: 'Server error. Try again later.' },
  'account.err.400': { et: 'Kontrolli nime ja parooli.', en: 'Check the name and password.' },
  'account.err.401': { et: 'Vale kasutajanimi või parool.', en: 'Wrong username or password.' },
  'account.err.403': { et: 'Server keeldus päringust.', en: 'The server refused the request.' },
  'account.err.409': { et: 'See nimi on juba võetud.', en: 'That name is already taken.' },
  'account.err.413': { et: 'Salvestus on liiga suur.', en: 'The save is too large.' },
  'account.err.429': {
    et: 'Liiga palju katseid. Oota mõni minut ja proovi uuesti.',
    en: 'Too many attempts. Wait a few minutes and try again.',
  },
  'account.err.password': { et: 'Vale parool.', en: 'Wrong password.' },
  // Server error codes (server/lib/*.php)
  'account.err.bad_login': { et: 'Vale kasutajanimi või parool.', en: 'Wrong username or password.' },
  'account.err.name_taken': { et: 'See nimi on juba võetud.', en: 'That name is already taken.' },
  'account.err.invalid_name': {
    et: 'Nimi peab olema 3 kuni 24 märki pikk ja sisaldama ainult ladina tähti (ka õ, ä, ö, ü, š, ž), numbreid ning märke _ . -',
    en: 'The name must be 3 to 24 characters long and contain only Latin letters (including õ ä ö ü š ž), digits and the characters _ . -',
  },
  'account.err.invalid_password': {
    et: 'Parool peab olema vähemalt 8 märki pikk.',
    en: 'The password must be at least 8 characters long.',
  },
  'account.err.rate_limited': {
    et: 'Liiga palju katseid, proovi 15 minuti pärast uuesti.',
    en: 'Too many attempts, try again in 15 minutes.',
  },
  'account.err.wrong_password': { et: 'Vale parool.', en: 'Wrong password.' },
  'account.err.password_required': { et: 'Kinnitamiseks sisesta oma parool.', en: 'Enter your password to confirm.' },
  'account.err.user_mismatch': {
    et: 'Selles brauseris on vahepeal sisse logitud teine konto.',
    en: 'Another account has signed in to this browser meanwhile.',
  },
  'account.err.save_conflict': {
    et: 'Salvestus on vahepeal teises seadmes muutunud.',
    en: 'The save has changed on another device meanwhile.',
  },
  'account.err.unknown': { et: 'Midagi läks valesti. Proovi uuesti.', en: 'Something went wrong. Try again.' },
} satisfies Dict;
