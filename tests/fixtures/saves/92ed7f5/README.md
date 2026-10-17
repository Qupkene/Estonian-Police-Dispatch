# Salvestuste kuldfiksatuurid: 92ed7f5

Need failid on täpselt sellised, nagu mängu versioon **92ed7f5** (commit
`92ed7f5ec45b805cb2bd3d7ccbea6f8eea3220e1`, esimene avalik EPD 2.0) need brauserisse ja pilve kirjutas,
baidi täpsusega. Need tegi selle versiooni enda kood: `generator.test.ts.txt` mängis karjääri läbi
30 päris vahetust ning salvestas siis pooleli ja lõppenud vahetused ja sünkroonimise märgi.

`tests/saves-upgrade.test.ts` laeb iga faili praeguse koodiga (poed, automaatsalvestus, pilvesünk) ja
kontrollib, et midagi ei kao.

| Fail | Kus see elab | Sisu |
| --- | --- | --- |
| `epd-career.json` | `localStorage['epd:career']` | Mari Tamm, märk 085, Põhja, päev 31: 30 vahetust, 9 töötajat (üks palgatud), 3 autot (üks müüdud), täiendused `bodycam` ja `spikes`, 200 kannet pearaamatus, 10 saavutust, avatud Põhja, Lõuna ja Ida, palgapäev möödas, postkastis 4 teadet, lisaväli `counters` |
| `epd-career-new.json` | `localStorage['epd:career']` | Aleksei Ivanov, märk 412, Ida: just loodud karjäär, ühtki vahetust pole |
| `epd-career-empty.json` | `localStorage['epd:career']` | Karjäär kustutatud (`profile: null`) |
| `epd-settings-default.json` | `localStorage['epd:settings']` | Vaikeseaded |
| `epd-settings-custom.json` | `localStorage['epd:settings']` | Kõik seaded muudetud (inglise keel, heli, Maa-ameti kaart, hele teema, suurendus 1,15 jne) |
| `epd-autosave-career.json` | `localStorage['epd:autosave']` | Karjäärivahetus pooleli (75 minutit, üks ekipaaž teel sündmusele) |
| `epd-autosave-free.json` | `localStorage['epd:autosave']` | Kiirmäng Lõunas pooleli, 112 kõne käib (vastatud, üks küsimus esitatud), neli sündmust ootab |
| `epd-autosave-ended.json` | `localStorage['epd:autosave']` | Kiirmäng Idas, kell sai täis, aruannet pole veel avatud (`ended: true`, 30 sekundi salvestus) |
| `epd-sync-guest.json` | `localStorage['epd:sync']` | Külalise märk: vorming 1 (`owner: null`, kohalikud muutmisajad) |
| `epd-sync.json` | `localStorage['epd:sync']` | Kontokasutaja märk pärast sünki: vorming 1 (`owner: 7`, serveri ajad) |
| `cloud-save-response.json` | `GET /api/save` | Serveri vastus täpselt nii, nagu `server/lib/saves.php` selle kokku paneb: andmebaasi `saves.json` read (karjäär, seaded, karjäärivahetus) muutmata kujul ja nende `updated` ajad |

## Reeglid

- Neid faile ei muudeta ega kustutata kunagi. Iga tulevane versioon peab need ilma kadudeta laadima.
- Kui salvestuse kuju muutub, lisa uus kaust `tests/fixtures/saves/<commit>/` uue väljalaske andmetega
  (oma README ja generaatoriga). Test leiab kõik kaustad ise. Vanad kaustad jäävad alles.
- Failid on kompaktne JSON nagu brauseris. Ära vorminda neid ümber: sisu jääb küll samaks, aga siis pole
  need enam baidi pealt need, mis mäng kirjutas.
- Generaator töötab ainult selle versiooni koodiga (git worktree), juhised on faili alguses. Jooks on
  deterministlik: sama käsk annab samad failid.
