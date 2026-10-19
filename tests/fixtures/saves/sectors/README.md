# Salvestuste kuldfiksatuurid: sektorid

Esimene versioon, kus karjäär katab sektoreid (docs/SECTORS.md). `epd-career.json` on täpselt see, mille selle
versiooni kood brauserisse kirjutas: `generator.test.ts.txt` lõi karjääri poe kaudu, avas politseipunkti ja
mängis päris vahetusi, kuni prefekt tegi pakkumise. Komplekt tuli 2.8.0 (d7871ad) järel (selle versiooni commit'i
id lisa siia, kui versioon on avaldatud).

`tests/saves-upgrade.test.ts` laeb selle nagu iga teise komplekti: profiil tuleb tagasi muutmata kujul ja ühtegi
varukoopiat ei teki. `tests/upgrade-paths.test.ts` laeb sama faili eelmise väljalaske (2.8.0) normaliseerijaga ja
kontrollib, et tagasipööramine ei kaota sektorite välju.

| Fail | Kus see elab | Sisu |
| --- | --- | --- |
| `epd-career.json` | `localStorage['epd:career']` | Kristjan Kask, märk 214, Ida: üks sektor (`ida-laaneviru`, Lääne-Virumaa), avatud politseipunkt `ida-tapa`, prefekti pakkumine (`ida-johvi`) ootab vastust, 3 makstud vahetust, 10 töötajat ja 5 autot |
| `migrate.d7871ad.ts.txt` | (kood, mitte salvestus) | `src/store/migrate.ts` versioonis 2.8.0 baidi täpsusega (`git show d7871ad:src/store/migrate.ts`, sama fail mis 22513eb-s): eelmise väljalaske normaliseerija tagasipööramise testi jaoks |

## Reeglid

Samad mis kaustas `92ed7f5`: faile ei muudeta ega kustutata, neid ei vormindata ümber. Generaator töötab ainult
selle versiooni koodiga, juhised on faili alguses.
