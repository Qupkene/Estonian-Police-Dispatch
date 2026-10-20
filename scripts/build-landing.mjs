#!/usr/bin/env node
// Maandumislehed (docs/SEO.md): plain HTML pages about the game for search engines and for people who arrive from
// a search. One shared frame (header, footer, style), the content of each page below. Writes public/<slug>/index.html.
// Run after changing a page: `node scripts/build-landing.mjs` (tests/seo.test.ts checks the output is up to date).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://politsei.eu/';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const NAV = [
  { slug: 'politseimang', et: 'Mängust', en: 'About' },
  { slug: 'juhend', et: 'Juhend', en: 'Guide' },
  { slug: 'mitmikmang', et: 'Mitmikmäng', en: 'Multiplayer' },
  { slug: 'en', et: 'English', en: 'English' },
];

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
:root{color-scheme:dark;--bg:#0b1016;--panel:#121a23;--line:#243140;--text:#e6ecf2;--muted:#9fb0c1;--accent:#4ea3ff;--accent-ink:#06121f;--amber:#f2b441}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f3f5f8;--panel:#ffffff;--line:#d5dde6;--text:#14202c;--muted:#4c5d6e;--accent:#0b62c4;--accent-ink:#ffffff;--amber:#a86a00}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
.top{border-bottom:1px solid var(--line);background:var(--panel)}
.top__in,.main,.foot__in{max-width:880px;margin:0 auto;padding:0 16px}
.top__in{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;min-height:60px}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;font-weight:800;letter-spacing:.06em}
.brand small{display:block;font-weight:500;letter-spacing:0;color:var(--muted);font-size:13px}
.nav{display:flex;flex-wrap:wrap;gap:4px 16px;margin-left:auto;font-size:15px}
.nav a{color:var(--muted);text-decoration:none;padding:10px 0}
.nav a[aria-current]{color:var(--text);font-weight:600}
.main{padding-top:32px;padding-bottom:48px}
.kicker{margin:0;color:var(--muted);font-size:13px;font-weight:600;letter-spacing:.18em;text-transform:uppercase}
h1{margin:8px 0 12px;font-size:clamp(28px,6vw,42px);line-height:1.15}
h2{margin:40px 0 8px;font-size:24px;line-height:1.25}
h3{margin:24px 0 4px;font-size:18px}
.lead{font-size:19px;color:var(--text);max-width:40em}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0 8px}
.btn{display:inline-flex;align-items:center;min-height:48px;padding:0 22px;border-radius:8px;border:1px solid var(--line);color:var(--text);text-decoration:none;font-weight:600}
.btn--primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
figure{margin:28px 0}
figure img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:8px}
figcaption{margin-top:6px;color:var(--muted);font-size:14px}
ul,ol{padding-left:22px}
li{margin:4px 0}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:16px 0}
.card{padding:16px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}
.card h3{margin-top:0}
.card p{margin:0}
.faq dt{margin-top:18px;font-weight:700}
.faq dd{margin:4px 0 0}
@media (max-width:600px){
body{font-size:16px}
.top__in{gap:0;padding-top:8px}
.nav{order:3;width:100%;margin:0 -16px;padding:0 16px;flex-wrap:nowrap;gap:20px;overflow-x:auto;border-top:1px solid var(--line);scrollbar-width:none}
.nav a{white-space:nowrap;padding:12px 0}
.main{padding-top:20px}
h1{font-size:28px}
h2{font-size:21px;margin-top:32px}
.lead{font-size:17px}
.cta .btn{flex:1;justify-content:center}
figure picture img{max-width:300px;margin:0 auto}
figcaption{text-align:center}
.cards{grid-template-columns:1fr}
}
.foot{border-top:1px solid var(--line);background:var(--panel);color:var(--muted);font-size:14px}
.foot__in{padding-top:20px;padding-bottom:28px}
.foot p{margin:4px 0}
`;

const shield = `<svg width="36" height="36" viewBox="0 0 64 64" aria-hidden="true"><clipPath id="s"><path d="M12 8H52V33C52 44 43.6 51.6 32 56C20.4 51.6 12 44 12 33Z"/></clipPath><path d="M8 4H56V33C56 46.6 45.6 55.2 32 60C18.4 55.2 8 46.6 8 33Z" fill="#0072CE"/><g clip-path="url(#s)"><rect y="24" width="64" height="16" fill="#000"/><rect y="40" width="64" height="24" fill="#fff"/></g></svg>`;

function frame(p) {
  const lang = p.lang;
  const url = `${SITE}${p.slug}/`;
  const navLinks = NAV.map(
    (n) =>
      `<a href="/${n.slug}/"${n.slug === p.slug ? ' aria-current="page"' : ''}${n.slug === 'en' && lang !== 'en' ? ' hreflang="en" lang="en"' : ''}>${n[lang]}</a>`,
  ).join('');
  const crumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'EPD', item: SITE },
      { '@type': 'ListItem', position: 2, name: p.crumb, item: url },
    ],
  };
  const graph = [
    {
      '@type': 'WebPage',
      '@id': `${url}#page`,
      url,
      name: p.title,
      description: p.description,
      inLanguage: lang,
      isPartOf: { '@id': `${SITE}#website` },
      about: { '@id': `${SITE}#game` },
      primaryImageOfPage: `${SITE}og-image.png`,
      dateModified: p.modified,
    },
    crumbs,
  ];
  if (p.faq)
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      inLanguage: lang,
      mainEntity: p.faq.map(([q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') },
      })),
    });
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(
    /</g,
    '\\u003c',
  );
  const alternates = p.alternates
    ? p.alternates
        .map(
          ([hl, slug]) =>
            `<link rel="alternate" hreflang="${hl}" href="${slug === '' ? SITE : `${SITE}${slug}/`}" />`,
        )
        .join('\n    ')
    : '';
  const faqHtml = p.faq
    ? `<h2 id="kkk">${lang === 'en' ? 'Questions and answers' : 'Korduma kippuvad küsimused'}</h2>\n<dl class="faq">${p.faq
        .map(([q, a]) => `<dt>${esc(q)}</dt><dd>${a}</dd>`)
        .join('')}</dl>`
    : '';
  const play = lang === 'en' ? 'Play now, free' : 'Mängi kohe tasuta';
  const disclaimer =
    lang === 'en'
      ? 'An unofficial, free fan game. Not a product of the Estonian Police and Border Guard Board (PPA) and not affiliated with it. In an emergency call 112.'
      : 'Mitteametlik ja tasuta fännimäng. Ei ole Politsei- ja Piirivalveameti toode ega ametiga seotud. Hädaolukorras helista 112.';
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(p.title)}</title>
    <meta name="description" content="${esc(p.description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${url}" />
    ${alternates}
    <meta name="theme-color" content="#0b1016" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${url}" />
    <meta property="og:site_name" content="EPD · Eesti Politsei Dispetšer" />
    <meta property="og:title" content="${esc(p.title)}" />
    <meta property="og:description" content="${esc(p.description)}" />
    <meta property="og:locale" content="${lang === 'en' ? 'en_GB' : 'et_EE'}" />
    <meta property="og:image" content="${SITE}og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">
${ld}
    </script>
    <style>${STYLE.trim().replace(/\n/g, '')}</style>
  </head>
  <body>
    <header class="top">
      <div class="top__in">
        <a class="brand" href="/">${shield}<span>EPD<small>${lang === 'en' ? 'Estonian Police Dispatch' : 'Eesti Politsei Dispetšer'}</small></span></a>
        <nav class="nav" aria-label="${lang === 'en' ? 'Pages' : 'Lehed'}">${navLinks}</nav>
      </div>
    </header>
    <main class="main">
      <p class="kicker">${esc(p.kicker)}</p>
      <h1>${esc(p.h1)}</h1>
      <p class="lead">${p.lead}</p>
      <p class="cta"><a class="btn btn--primary" href="/">${play}</a>${p.cta2 ?? ''}</p>
${p.body.trim()}
${faqHtml}
      <p class="cta"><a class="btn btn--primary" href="/">${play}</a></p>
    </main>
    <footer class="foot">
      <div class="foot__in">
        <p>${disclaimer}</p>
        <p>EPD · <a href="/">politsei.eu</a> · <a href="mailto:info@politsei.eu">info@politsei.eu</a></p>
      </div>
    </footer>
  </body>
</html>
`;
}

/** A screenshot: the wide one on a computer, the phone one (public/screenshots/phone-*.webp) on a phone. */
const shot = (src, alt, caption) =>
  `<figure><picture><source media="(max-width: 600px)" srcset="/screenshots/phone-${src}.webp" width="780" height="1688" /><img src="/screenshots/${src}.webp" width="1600" height="900" alt="${esc(alt)}" loading="lazy" decoding="async" /></picture><figcaption>${caption}</figcaption></figure>`;

const MODIFIED = '2026-10-20';

export const PAGES = [
  {
    slug: 'politseimang',
    lang: 'et',
    modified: MODIFIED,
    crumb: 'Politseimäng',
    alternates: [
      ['et', 'politseimang'],
      ['en', 'en'],
      ['x-default', 'politseimang'],
    ],
    title: 'Politseimäng: tasuta politsei mäng eesti keeles | EPD',
    description:
      'Tasuta politsei mäng eesti keeles: võta vastu 112-kõned, saada patrullid välja ja juhi päris Eesti kaardil oma prefektuuri. Mängi brauseris, ka sõpradega.',
    kicker: 'Politsei mäng · tasuta · eesti keeles',
    h1: 'Politseimäng, kus sina oled juhtimiskeskuse dispetšer',
    lead: 'EPD (Eesti Politsei Dispetšer) on tasuta politsei mäng, mis töötab otse brauseris. Sa võtad vastu 112-kõnesid, otsustad, kui kiiresti on abi vaja, saadad välja patrullid ja kontrollid inimesi ning sõidukeid andmebaasist. Kõik toimub päris Eesti kaardil, Tallinnast Võruni.',
    body: `
${shot('game', 'EPD mänguvaade: sündmuste nimekiri, Eesti kaart patrullidega, raadio ja üksuste tabel', 'Juhtimiskeskus: sündmused, kaart, raadio ja üksused.')}
<h2>Mida sa selles politsei mängus teed</h2>
<div class="cards">
<div class="card"><h3>Võtad vastu 112-kõned</h3><p>Helistaja on segaduses, hirmul või purjus. Küsi, kus ta on ja mis juhtus, ning otsusta, kas see on päris hädaolukord, eksitus või pahatahtlik kõne.</p></div>
<div class="card"><h3>Saadad patrullid välja</h3><p>Vali sündmusele sobiv ekipaaž: lähim vaba patrull, kiirreageerijad või abi naabersektorist. Iga minut loeb, sest viivitus läheb hindesse.</p></div>
<div class="card"><h3>Kontrollid andmebaasist</h3><p>Otsi isikut või numbrimärki, vaata juhilube, kindlustust, varasemaid rikkumisi ja tagaotsitavust, ning anna patrullile vastus raadio teel.</p></div>
<div class="card"><h3>Juhid raadiot</h3><p>Patrullid räägivad sinuga eesti keeles: nad jõuavad kohale, küsivad lisajõude, teatavad kinnipidamisest või sõidavad jälitusse.</p></div>
</div>
<p>Mängus on üle 400 erineva väljakutse: liiklusõnnetused, perevägivald, vargused, joobes juhid, kadunud lapsed, häiresignaalid, piiriintsidendid ja palju muud. Iga vahetus on erinev ja lõpus saad hinde koos põhjaliku aruandega.</p>
${shot('call', '112-kõne kaart: helistaja tekst, küsimused ja prioriteedi valik', '112-kõne: küsi õiged küsimused ja vali prioriteet.')}
<h2>Mängurežiimid</h2>
<ul>
<li><strong>Karjäär:</strong> alusta noorema dispetšerina oma sektoris, kasva vahetuse vanemaks ja prefektuuri juhiks. Karjäär on jaotatud peatükkideks ja seal on oma tegelased.</li>
<li><strong>Kiirmäng:</strong> üks vahetus omal valikul: prefektuur, sektor, raskus, kellaaeg ja pikkus.</li>
<li><strong>Päeva väljakutse:</strong> kõigil mängijatel on sama vahetus ja sama päeva edetabel.</li>
<li><strong>Mitmikmäng:</strong> kuni neli mängijat ühes ruumis, võistlus või ühine vahetus. Vaata <a href="/mitmikmang/">mitmikmängu lehte</a>.</li>
<li><strong>Režissööri režiim:</strong> loo ise stseene ja sündmusi.</li>
</ul>
<h2>Päris Eesti kaart ja neli prefektuuri</h2>
<p>Mäng kasutab päris Eesti tänavakaarti ning Põhja, Ida, Lõuna ja Lääne prefektuuri piirkondi. Patrullid sõidavad mööda päris teid ja sündmused toimuvad päris majade juures. Kinnipeetu viiakse lähimasse arestimajja või jaoskonda, mitte teise linna.</p>
<h2>Kellele see mäng sobib</h2>
<p>Kõigile, kellele meeldivad politseimängud, simulaatorid ja strateegia. Mäng sobib ka neile, kes tahavad näha, kuidas töötab häirekeskuse ja politsei juhtimiskeskuse töö: kiired otsused, piiratud ressursid ja palju samaaegseid sündmusi. Kui mängid esimest korda, loe <a href="/juhend/">juhendit</a>.</p>
`,
    faq: [
      [
        'Kas see politsei mäng on tasuta?',
        'Jah. EPD on täiesti tasuta, reklaamideta ja sellega ei teenita raha.',
      ],
      [
        'Kas mängu peab alla laadima?',
        'Ei. Mäng töötab brauseris aadressil <a href="/">politsei.eu</a>. Soovi korral saad selle telefoni või arvuti avakuvale lisada nagu rakenduse.',
      ],
      [
        'Kas mäng on eesti keeles?',
        'Jah, kogu mäng on eesti keeles ja raadio räägib eesti keeles. Seadetes saab valida ka inglise keele.',
      ],
      [
        'Kas see on Politsei- ja Piirivalveameti mäng?',
        'Ei. EPD on mitteametlik fännimäng, mis ei ole PPA toode ega ametiga seotud. Päris hädaolukorras helista 112.',
      ],
      [
        'Kas sõpradega saab koos mängida?',
        'Jah. Mitmikmängus saab kuni neli mängijat ühte ruumi, nii võistlusena kui ühise vahetusena.',
      ],
      [
        'Kas mäng töötab telefonis?',
        'Jah, mäng töötab nii arvutis kui ka telefonis ja tahvlis, kuid suurel ekraanil on juhtimiskeskus kõige parem.',
      ],
      [
        'Kas mäng salvestab mu edu?',
        'Jah. Ilma kontota salvestub mäng sinu brauserisse, kontoga ka serverisse, nii et saad jätkata teises seadmes.',
      ],
    ],
  },
  {
    slug: 'juhend',
    lang: 'et',
    modified: MODIFIED,
    crumb: 'Juhend',
    title: 'Kuidas mängida politsei dispetšerit: juhend | EPD',
    description:
      'Juhend algajale: kuidas võtta vastu 112-kõne, valida prioriteet, saata patrull, kasutada andmebaasi ja raadiot ning saada vahetuse lõpus hea hinne.',
    kicker: 'Juhend · 112 mäng · dispetšer',
    h1: 'Kuidas mängida politsei dispetšerit',
    lead: 'Dispetšeri töö on lihtne õppida ja raske hästi teha. See juhend käib läbi ühe vahetuse: kõnest kuni aruandeni.',
    body: `
<h2>1. Vali vahetus</h2>
<p>Esimest korda mängides vali menüüst <strong>Kiirmäng</strong> või alusta <strong>karjääri</strong>. Lühike vahetus väiksemas sektoris on algajale parim, sest sündmusi on vähem ja kaarti on lihtsam jälgida.</p>
<h2>2. Võta vastu 112-kõne</h2>
<p>Kui telefon heliseb, vasta. Mängu aeg aeglustub kõne ajaks, et jõuaksid rahulikult lugeda. Küsi kõigepealt <strong>kus</strong> helistaja on ja <strong>mis juhtus</strong>. Vajadusel küsi, kas keegi on vigastatud, kas kellelgi on relv ja kuhu kahtlusalune läks. Iga küsimus annab infot, aga võtab ka aega.</p>
<p>Ole tähelepanelik: osa kõnesid on eksitused, osa pahatahtlikud. Pahatahtliku kõne võid sündmust loomata lõpetada.</p>
<h2>3. Vali prioriteet</h2>
<p>Prioriteet ütleb, kui kiiresti on abi vaja:</p>
<ol>
<li><strong>Prioriteet 1:</strong> elu on ohus, näiteks relvaga ähvardamine või raske õnnetus.</li>
<li><strong>Prioriteet 2:</strong> kiire, kuid otsest eluohtu pole, näiteks käimasolev vargus või joobes juht.</li>
<li><strong>Prioriteet 3:</strong> tavaline väljakutse, näiteks lärm või pisivargus.</li>
<li><strong>Prioriteet 4:</strong> ei ole kiire, näiteks info edastamine.</li>
</ol>
<p>Liiga madal prioriteet tähendab, et abi jõuab hilja. Liiga kõrge prioriteet seob patrullid, keda mujal vaja läheb.</p>
<h2>4. Saada patrull</h2>
<p>Võta sündmus vastu ja vaata soovitatud ekipaaže. Mäng näitab kaugust, saabumise aega ja seda, kui hästi üksus sündmusele sobib. Tõsisele sündmusele saada mitu ekipaaži, vajadusel kutsu kiirabi, päästeamet või teised asutused.</p>
${shot('game', 'Kaart patrullidega ja sündmuse paneel soovitatud ekipaažidega', 'Vali sündmus ja saada sobivaim vaba ekipaaž.')}
<h2>5. Raadio ja andmebaas</h2>
<p>Kohale jõudnud patrull räägib sinuga raadio teel: ta teatab olukorrast, palub isikut või sõidukit kontrollida või küsib lisajõude. Ava andmebaas, otsi nime või numbrimärgi järgi ja vasta patrullile. Õige ja kiire vastus parandab tulemust.</p>
<h2>6. Väsimus ja pausid</h2>
<p>Patrullid väsivad. Pikal vahetusel anna neile pausi, kui on rahulikum aeg, muidu lähevad nad aeglasemaks.</p>
<h2>7. Vahetuse lõpp ja hinne</h2>
<p>Vahetuse lõpus näed aruannet: kui kiiresti abi kohale jõudis, mitu sündmust lahendati, mitu kinnipidamist tehti ja milline on avalik usaldus. Karjääris tõstavad head vahetused sinu auastet ja avavad uusi sektoreid.</p>
<h2>Nõuanded</h2>
<ul>
<li>Hoia vähemalt üks patrull vaba, sest uus prioriteet 1 sündmus võib tulla igal hetkel.</li>
<li>Saada lähim sobiv ekipaaž, mitte esimene vaba.</li>
<li>Loe raadiot: patrull ütleb sageli, mida ta järgmisena vajab.</li>
<li>Öised vahetused on rahulikumad, reede ja laupäeva õhtud kõige tihedamad.</li>
</ul>
<p>Kui tahad mängida koos sõbraga, loe <a href="/mitmikmang/">mitmikmängu</a> kohta. Mängu üldkirjelduse leiad lehelt <a href="/politseimang/">politseimäng</a>.</p>
`,
  },
  {
    slug: 'mitmikmang',
    lang: 'et',
    modified: MODIFIED,
    crumb: 'Mitmikmäng',
    title: 'Politsei mäng sõpradega: mitmikmäng | EPD',
    description:
      'Mängi politsei dispetšerit koos sõpradega: võistlus samal vahetusel või ühine vahetus, kus üks võtab 112-kõned ja teine saadab patrulle. Tasuta, brauseris.',
    kicker: 'Mitmikmäng · kuni 4 mängijat',
    h1: 'Politsei mäng sõpradega',
    lead: 'EPD mitmikmängus saab ühte ruumi kuni neli mängijat. Loo ruum, saada sõbrale kuuemärgiline kood ja alustage vahetust.',
    body: `
<h2>Kolm viisi koos mängida</h2>
<div class="cards">
<div class="card"><h3>Võistlus</h3><p>Kõik mängivad täpselt sama vahetust: samad kõned samal ajal samades kohtades. Lõpus näete, kelle tulemus on parim.</p></div>
<div class="card"><h3>Rollid</h3><p>Üks ühine vahetus, tööd on jagatud. Üks võtab vastu 112-kõned, teine saadab patrulle, kolmas hoiab raadiot ja andmebaasi.</p></div>
<div class="card"><h3>Sektorid</h3><p>Igaüks juhib oma naabersektorit. Laenake üksteisele ekipaaže, aidake naabri väljakutsetel ja andke jälitus üle.</p></div>
</div>
<h2>Kuidas alustada</h2>
<ol>
<li>Loo tasuta konto ja logi sisse.</li>
<li>Vali menüüst mitmikmäng ja loo ruum. Vali režiim, prefektuur, raskus ja vahetuse pikkus.</li>
<li>Saada sõbrale ruumi kood. Ta sisestab selle ja liitub.</li>
<li>Kui kõik on valmis, alustab ruumi looja vahetust.</li>
</ol>
<h2>Kiire ja ühine</h2>
<p>Ühine vahetus jookseb mänguserveris, nii et kõik näevad sama seisu ja nupuvajutus jõuab kohale umbes kümnendiku sekundiga. Kui ühendus katkeb, saad tagasi tulla ja vahetus jätkub sealt, kus see parajasti on. Tühja laua või lahkunud mängija töö võtab üle tehisintellektiga kolleeg.</p>
<h2>Kogemuspunktid</h2>
<p>Ühise vahetuse kogemuspunktid lähevad iga mängija karjääri. Aruandes on meeskonna tabel, kus on näha, kes mida tegi.</p>
<p>Üksi mängimise kohta loe <a href="/juhend/">juhendist</a>.</p>
`,
  },
  {
    slug: 'en',
    lang: 'en',
    modified: MODIFIED,
    crumb: 'English',
    alternates: [
      ['et', 'politseimang'],
      ['en', 'en'],
      ['x-default', 'politseimang'],
    ],
    title: 'Police Dispatch Game: free dispatcher simulator | EPD',
    description:
      'A free police dispatch game in your browser: answer 112 emergency calls, send patrols and run checks on a real map of Estonia. Play alone or with friends.',
    kicker: 'Police game · free · in English and Estonian',
    h1: 'Police dispatch game on a real map of Estonia',
    lead: 'EPD (Estonian Police Dispatch) is a free police dispatcher simulator that runs in the browser. Answer 112 emergency calls, decide how urgent each one is, send the right patrol and check people and vehicles in the database, across real Estonian towns and roads.',
    body: `
${shot('game', 'EPD dispatch view: incident list, a map of Estonia with patrols, the radio and the units table', 'The dispatch centre: incidents, the map, the radio and the units.')}
<h2>What you do</h2>
<ul>
<li><strong>Answer 112 calls:</strong> ask where and what happened, spot hoaxes and set a priority from 1 to 4.</li>
<li><strong>Dispatch patrols:</strong> pick the nearest suitable crew, call for back-up, the ambulance or the rescue service.</li>
<li><strong>Run checks:</strong> search people and number plates, read licences, insurance and wanted notices, and answer the crews on the radio.</li>
<li><strong>Manage a shift:</strong> fatigue, breaks, pursuits, arrests and a graded report at the end.</li>
</ul>
<p>Over 400 kinds of incidents, four Estonian police prefectures, a career with sectors and story chapters, a daily challenge with a shared leaderboard, and multiplayer for up to four players (a race on the same shift, or one shared shift split by roles or sectors).</p>
<h2>Language</h2>
<p>The game is fully in English and Estonian; switch the language in the settings. The radio voice speaks Estonian.</p>
`,
    faq: [
      ['Is the game free?', 'Yes. EPD is completely free, with no ads, and nobody makes money from it.'],
      [
        'Do I need to install anything?',
        'No. It runs in the browser at <a href="/">politsei.eu</a>, on a computer, tablet or phone.',
      ],
      [
        'Is this an official police game?',
        'No. It is an unofficial fan game, not a product of the Estonian Police and Border Guard Board and not affiliated with it.',
      ],
      ['Can I play with friends?', 'Yes, up to four players per room, as a race or as one shared shift.'],
    ],
  },
];

export function renderAll() {
  return PAGES.map((p) => ({ path: join('public', p.slug, 'index.html'), html: frame(p) }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const { path, html } of renderAll()) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true });
    writeFileSync(join(ROOT, path), html);
    console.log(`wrote ${path}`);
  }
}
