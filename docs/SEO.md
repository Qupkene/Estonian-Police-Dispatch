# SEO ja lingieelvaated (politsei.eu)

Mis on tehtud:

- `index.html`: pealkiri ja kirjeldus, canonical `https://politsei.eu/`, Open Graph ja X/Twitteri suur kaart, JSON-LD (VideoGame + WebApplication ja WebSite), ikoonid ning laadimisleht, mille tekst on nähtav ka ilma JavaScriptita.
- `public/og-image.png` (1200 × 630, alla 300 kB, et ka WhatsApp eelvaadet näitaks): EPD ikoon (sinimustvalge kilp) ja pealkiri ning päris mängupildi väljalõige (sündmuste nimekiri, kaart, raadio; mängu ülariba koos logodega jääb välja), HTML-mall renderdati Playwrightiga ja pakiti 256 värvini. `public/og-image.svg` on sama kaardi vektorversioon. Eelvaates on ainult mängu enda ikoon, mitte PPA ega muu ametlik logo (docs/PERMISSIONS.md).
- `public/icons/`: PNG ikoonid (32, 192, 512, maskable 512 ja apple-touch-icon 180) ning `public/favicon.ico` (16, 32, 48) failist `public/favicon.svg` (EPD ikoon, sinimustvalge kilp, `src/ui/components/Emblem.tsx`). Maskable ja Apple ikoonil on tume taust ja kilp jääb keskmise 80 % ringi sisse. `public/screenshots/`: manifesti ekraanipildid (WebP, 1600 × 900).
- `public/manifest.webmanifest`: id, kirjeldus, kategooriad, PNG ja maskable ikoonid ning laiad ekraanipildid, nii näitab Chrome rikkalikumat paigaldusakent.
- `public/robots.txt` keelab `/api/` ja `/tiles/`, `public/sitemap.xml` sisaldab mängu ja kahte vana versiooni. Uue avaliku lehe lisamisel pane see sitemapi ja uuenda `lastmod`.
- Caddyfile: `/api/*` vastustel on `X-Robots-Tag: noindex`; robots, sitemap ja pildid tulevad päris failidena koos vahemäluajaga, puuduv fail annab 404, mitte `index.html`-i.
- Kontroll: `npx vitest run tests/seo.test.ts`.

Tutvustavad lehed (2.22.0):

- `public/politseimang/`, `public/juhend/`, `public/mitmikmang/` ja `public/en/` (`index.html` igas). Need on tavaline HTML ilma JavaScriptita, et otsingumootor loeks sisu kohe. Lehed teeb `node scripts/build-landing.mjs` (sisu ja ühine raam on skriptis, `tests/seo.test.ts` kontrollib, et failid on skriptiga samad). Pärast teksti muutmist käivita skript uuesti.
- Märksõnad, mille järgi lehed on kirjutatud: politsei mäng, politseimäng, politsei mängud, politsei simulaator, 112 mäng, häirekeskuse mäng, dispetšeri mäng, politsei mäng sõpradega, tasuta mäng brauseris; inglise keeles police dispatch game, police dispatcher simulator.
- Igal lehel on oma pealkiri, kirjeldus, canonical, Open Graph, JSON-LD (WebPage, BreadcrumbList, `politseimang` ja `en` lehel ka FAQPage) ning `politseimang` ja `en` vahel hreflang. Avalehe JSON-LD viitab lehtedele (`subjectOf`).
- Caddy: kaust ilma kaldkriipsuta suunatakse 301-ga kaldkriipsuga aadressile ja `kaust/` annab `kaust/index.html`-i. Tundmatu tee annab endiselt mängu (`index.html`).
- Mängu menüü jaluses ja laadimislehel on lingid lehtedele, nii leiab Google need ka ilma saidikaardita.

Omaniku valikulised sammud:

1. Google Search Console: lisa omand tüübiga "Domeen" (`politsei.eu`), kopeeri sealt TXT kirje ja lisa see registripidaja DNS-i. Pärast kinnitamist ava "Saidikaardid" ja saada `https://politsei.eu/sitemap.xml`. Seejärel "URL-i kontroll" avalehe ja nelja tutvustava lehe jaoks ning "Taotle indekseerimist".
2. Bing Webmaster Tools: vali "Import from Google Search Console", sait tuleb üle koos sitemapiga.
3. Eelvaate kontroll: Facebook Sharing Debugger (`developers.facebook.com/tools/debug`, "Scrape Again" loeb lehe uuesti), opengraph.xyz näitab kõiki platvorme korraga. X/Twitteril validaatorit pole, postita link testkontolt või saada see endale otsesõnumina.
4. Discord, Slack ja WhatsApp hoiavad vana eelvaadet kaua vahemälus. Kui pilt muutub, anna sellele uus nimi või lisa `og:image` aadressile `?v=2`.
5. Tagasilingid tõstavad kohta otsingus kõige rohkem: link politsei.eu-le GitHubi README-s, YouTube'i video kirjelduses, Redditi r/Eesti postituses, Facebooki gruppides ja mängusaitidel (näiteks itch.io lehel). Lingi tekstiks sobib "politsei mäng" või "politseimäng".
