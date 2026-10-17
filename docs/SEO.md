# SEO ja lingieelvaated (politsei.eu)

Mis on tehtud:

- `index.html`: pealkiri ja kirjeldus, canonical `https://politsei.eu/`, Open Graph ja X/Twitteri suur kaart, JSON-LD (VideoGame + WebApplication ja WebSite), ikoonid ning laadimisleht, mille tekst on nähtav ka ilma JavaScriptita.
- `public/og-image.png` (1200 × 630, alla 300 kB, et ka WhatsApp eelvaadet näitaks): tehtud päris mängupildist `docs/screenshots/game.png`, HTML-mall renderdati Playwrightiga ja pakiti 256 värvini. `public/og-image.svg` on sama kaardi vektorversioon.
- `public/icons/`: PNG ikoonid (32, 192, 512, maskable 512 ja apple-touch-icon 180) failist `public/favicon.svg`. `public/screenshots/`: manifesti ekraanipildid (WebP, 1600 × 900).
- `public/manifest.webmanifest`: id, kirjeldus, kategooriad, PNG ja maskable ikoonid ning laiad ekraanipildid, nii näitab Chrome rikkalikumat paigaldusakent.
- `public/robots.txt` keelab `/api/` ja `/tiles/`, `public/sitemap.xml` sisaldab mängu ja kahte vana versiooni. Uue avaliku lehe lisamisel pane see sitemapi ja uuenda `lastmod`.
- Caddyfile: `/api/*` vastustel on `X-Robots-Tag: noindex`; robots, sitemap ja pildid tulevad päris failidena koos vahemäluajaga, puuduv fail annab 404, mitte `index.html`-i.
- Kontroll: `npx vitest run tests/seo.test.ts`.

Omaniku valikulised sammud:

1. Google Search Console: lisa omand tüübiga "Domeen" (`politsei.eu`), kopeeri sealt TXT kirje ja lisa see registripidaja DNS-i. Pärast kinnitamist ava "Saidikaardid" ja saada `https://politsei.eu/sitemap.xml`.
2. Bing Webmaster Tools: vali "Import from Google Search Console", sait tuleb üle koos sitemapiga.
3. Eelvaate kontroll: Facebook Sharing Debugger (`developers.facebook.com/tools/debug`, "Scrape Again" loeb lehe uuesti), opengraph.xyz näitab kõiki platvorme korraga. X/Twitteril validaatorit pole, postita link testkontolt või saada see endale otsesõnumina.
4. Discord, Slack ja WhatsApp hoiavad vana eelvaadet kaua vahemälus. Kui pilt muutub, anna sellele uus nimi või lisa `og:image` aadressile `?v=2`.
