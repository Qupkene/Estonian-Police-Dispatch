# Salvestuste kuldfiksatuurid: lugu peatükkidena

Esimene versioon, kus karjääri jutustatakse peatükkidena (docs/STORY.md). `epd-career.json` on täpselt see, mille
selle versiooni kood brauserisse kirjutas: `generator.test.ts.txt` lõi karjääri poe kaudu ja mängis päris vahetusi,
kuni vahetuse vanema küsimus jäi vastust ootama. Komplekt tuli 2.17.0 (686f0f1) järel (selle versiooni commit'i id
lisa siia, kui versioon on avaldatud).

`tests/saves-upgrade.test.ts` laeb selle nagu iga teise komplekti: profiil tuleb tagasi muutmata kujul ja ühtegi
varukoopiat ei teki. `tests/upgrade-paths.test.ts` laeb sama faili eelmise väljalaske (2.17.0) normaliseerijaga ja
kontrollib, et tagasipööramine ei kaota välja `story`.

| Fail | Kus see elab | Sisu |
| --- | --- | --- |
| `epd-career.json` | `localStorage['epd:career']` | Liisa Kuusk, märk 318, Lõuna, Tartu linn: peatükk 1 (Esimene laud), 2 makstud vahetust, kolm eesmärki täidetud, küsimus `c1-debrief` ootab vastust, naaberlaud `louna-tartumaa`; postkastis peatüki sissejuhatus, eesmärgid ja küsimus |
| `migrate.686f0f1.ts.txt` | (kood, mitte salvestus) | `src/store/migrate.ts` versioonis 2.17.0 baidi täpsusega (`git show 686f0f1:src/store/migrate.ts`): eelmise väljalaske normaliseerija tagasipööramise testi jaoks |

## Reeglid

Samad mis kaustas `92ed7f5`: faile ei muudeta ega kustutata, neid ei vormindata ümber. Generaator töötab ainult
selle versiooni koodiga, juhised on faili alguses.
