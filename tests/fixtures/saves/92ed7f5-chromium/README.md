# Salvestuste kuldfiksatuurid: 92ed7f5 päris brauseris

Need failid kirjutas mängu versioon **92ed7f5** (commit `92ed7f5ec45b805cb2bd3d7ccbea6f8eea3220e1`)
Chromiumi `localStorage`-isse uuenduse otsast lõpuni testi ajal: ehitatud mäng, PHP API ja Playwright,
mängija klõpsis läbi päris kasutajaliidese. Väärtused on baidi täpsusega need stringid, mis brauser hoidis.

See komplekt näitab 92ed7f5 viga, mille tagajärjega uus versioon peab toime tulema: kui karjäärivahetus
lõpetati enne aega („Lõpeta vahetus”) ja vaheleht suleti aruande ekraanil, salvestas `beforeunload`
juba makstud vahetuse uuesti automaatsalvestusse. 92ed7f5 pakkus seda menüüs „Jätka vahetust” ja maksis
selle teist korda.

| Fail | Kus see elab | Sisu |
| --- | --- | --- |
| `epd-career-paid.json` | `localStorage['epd:career']` | Ants Ader, märk 318, Põhja, päev 2: esimene vahetus lõpetati enne aega ja on makstud (ajaloos üks kirje, päev 1) |
| `epd-autosave-after-report.json` | `localStorage['epd:autosave']` | Sama päeva 1 vahetus (17.10.2026 kell 19.00 algus, 12 sündmust), mille 92ed7f5 salvestas pärast aruannet uuesti |
| `epd-sync-guest.json` | `localStorage['epd:sync']` | Sama külalise märk: vorming 1 (`owner: null`, kohalikud muutmisajad, seadeid pole muudetud) |
| `epd-settings-changed.json` | `localStorage['epd:settings']` | Teise külalise seaded samast testist: helitugevus 0,35, heliefektid väljas, taktikaline kaart, suurendus 1,1, vihjed väljas, värvipimeda režiim |
| `epd-sync-account.json` | `localStorage['epd:sync']` | Kontokasutaja märk samast testist: vorming 1 (`owner: 1`, serveri ajad, viimane kohalik muutmisaeg) |

`tests/saves-upgrade.test.ts` laeb need nagu iga teise komplekti. `tests/upgrade-paths.test.ts` kontrollib,
et uus versioon ei paku seda vahetust jätkamiseks ega maksa päeva 1 eest teist korda, ning hoiab salvestuse
varukoopias alles.

## Reeglid

Samad mis kaustas `92ed7f5`: faile ei muudeta ega kustutata, neid ei vormindata ümber.
