# Load ja ametlikud logod

EPD on mitteametlik ja tasuta fännimäng, mis ei teeni tulu. Mäng ei ole ühegi allpool nimetatud asutuse ega ettevõtte
ametlik toode ega nendega seotud. Siin on kirjas, milliseid ametlikke logosid mängus kasutatakse, kelle loal ja millistel
tingimustel. Kontakt ja õiguste küsimused: [info@politsei.eu](mailto:info@politsei.eu).

## Load

Kõik load on saanud mängu omanik 19.10.2026. Kirjalikud vastused hoiab alles omanik (mitte siin hoidlas).

| Omanik | Mis | Kust fail on võetud | Failid hoidlas | Kus mängus |
| --- | --- | --- | --- | --- |
| Politsei- ja Piirivalveamet (PPA) | PPA logo (kilp koos sõnamärgiga ja ainult kilp) | www.politsei.ee päis | `public/brand/ppa/ppa-logo.svg`, `public/brand/ppa/ppa-emblem.svg` | kõigi menüüekraanide ülariba (esimesena, EPD sõnamärgi ees), käivitus ja sisselogimine (ka klassikalise sisselogimise valge kasti kohal), päevakäsu ja vahetuse aruande päis, karjääri päis (kilp), laadimisekraan, tiitrid, mängu ülariba (kilp) |
| SK ID Solutions | Smart-ID sümbol | www.smart-id.com päis | `public/brand/smart-id/smart-id.svg` | Smart-ID sisselogimise vahekaart ja telefoni kinnitusaken, tiitrid |
| SK ID Solutions | Mobiil-ID logo | www.mobiil-id.ee päis (eemaldatud ainult ekspordi taustaristkülikud) | `public/brand/mobiil-id/mobiil-id.svg` | Mobiil-ID vahekaart ja telefoni kinnitusaken, tiitrid |
| Riigi Infosüsteemi Amet (RIA) | id.ee "iD" logo (ID-kaart ja DigiDoc) | www.id.ee | `public/brand/id-kaart/id-ee.webp` | ID-kaardi vahekaart ja sammud, tempel "Digitaalselt allkirjastatud" päevakäsul ja vahetuse aruandel, tiitrid |

PPA luba anti e-kirjaga: PPA logosid politsei.ee lehelt võib mängus kasutada. RIA ja SK ID Solutionsi nõusolekud on samuti
kirjalikud (omaniku teatel 19.10.2026).

## Tingimused

- Iga ekraani jaluses on märkus, et EPD on mitteametlik ja tasuta fännimäng, mis ei ole Politsei- ja Piirivalveameti toode
  ega ametiga seotud (PPA tingimus). Sama märkus on tiitrite lehel, 404-lehel, README-s ja mujal.
- Mäng on mitteäriline: tasuta, ilma tuluta.
- Logod on omanike enda failid, muutmata kujul. Neid ei joonistata ümber, ei jäljendata, ei venitata ega pöörata.
  Ühevärvilised failid (`fill="currentColor"`: PPA, Smart-ID) võtavad teema tekstivärvi; värvilised failid
  (Mobiil-ID, iD) on täpselt sellised, nagu need on. Väike rasterfail `id-ee.webp` (81 × 60) ei ole kunagi kõrgem kui
  30 CSS-pikslit.
- Logo puudumisel ei näidata midagi (`src/ui/components/BrandLogo.tsx`), mitte asendusjoonistust.

## Mida ei kasutata

- Riigivappi (suurt ega väikest) ei kasutata. Väike riigivapp on ainult PPA logo sees, nii nagu see on. Suure riigivapi
  kasutamine on seadusega piiratud riigiasutustega ja ükski luba seda ei hõlma.
- eesti.ee logo ei ole (selle lehel on riigivapp): eesti.ee on vajadusel kirjas tavalise tekstina.
- KAPO märke ei kasutata.
- Lipp ega vapp ei ole mängus jäljendatud. Sinimustvalge värvid on EPD enda embleemis.

## EPD ikoon

Saidi ikoon ("lipukilp": sinimustvalge kilp sinise äärisega) on mängu jaoks loodud originaal
(`src/ui/components/Emblem.tsx`, `public/favicon.svg`, `public/favicon.ico`, `public/icons/`, `public/og-image.*`). See ei ole
PPA ega Eesti riigi sümbol. Brauseri vahekaart, avaekraani ikoonid ja lingi eelvaade kasutavad ainult seda ikooni, et
otsingutulemused ega järjehoidjad ei näeks välja nagu ametlik PPA leht. Mängu sees on süsteemi omaniku märk PPA logo.

<details>
<summary>English summary</summary>

EPD is an unofficial, free fan game that earns no money; it is not an official product of, or affiliated with, any of the
organisations below. On 19.10.2026 the owner received permission to use in the game: the logos of the Police and Border
Guard Board (PPA, by email; condition: every screen's footer says it is an unofficial fan game, not affiliated with PPA
and not an official product of the agency), the Smart-ID and Mobile-ID logos (SK ID Solutions) and the id.ee "iD" logo
for the ID card and DigiDoc (RIA). The files are the owners' own, unaltered, in `public/brand/`; single-colour files take
the text colour through `currentColor`, coloured ones are shown as they are, and a missing file renders nothing. The state
coat of arms is never used (the small one appears only inside the PPA logo, as it is); eesti.ee has no logo here; KAPO
marks are not used. Inside the game PPA's logo is the system owner's mark (top bars, boot, sign-in, letterheads, credits);
the favicon, app icons and link preview use only the game's own shield icon. Contact: info@politsei.eu.

</details>
