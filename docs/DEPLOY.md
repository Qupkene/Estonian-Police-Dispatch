# EPD avaldamine: MainServer ja relee (politsei.eu)

politsei.eu jookseb Magnuse MainServeris. Avalik nägu on relee VPS: brauser räägib ainult releega,
relee saadab päringud WireGuardi kaudu koju. Uuendus käib ise: iga roheline CI `main` harul jõuab
saidile mõne minutiga. GitHub Pages on alles ainult valikulise eelvaatena (lõpus).

## Ülevaade

```
brauser
  |  https://politsei.eu   (DNS A 80.47.227.213, www.politsei.eu suunab politsei.eu peale)
  v
relee VPS (UpCloud, Helsingi): Caddy, Let's Encrypt, varuleht kui kodu ei vasta
  |  reverse_proxy 10.99.0.5:80, WireGuard wg0 (10.99.0.1 -> 10.99.0.5)
  v
MainServer: konteiner relee-politsei (linuxserver/wireguard, Dockeri võrk veeb, WG 10.99.0.5)
  |  sama võrguruum
  v
konteiner politsei (FrankenPHP, :80)
  +-- /         /opt/stack/politsei/www            ehitatud mäng (dist/), version.txt
  +-- /api/*    /opt/stack/politsei/repo/server    PHP API, andmebaas kaustas data/
  +-- /tiles/*  /opt/stack/politsei/tiles          estonia.pmtiles (tänavakaart)
```

| Kus | Mis |
| --- | --- |
| /opt/stack/politsei/compose.yml | relee-politsei + politsei (repo: deploy/mainserver/compose.yml) |
| /opt/stack/politsei/conf/Caddyfile | konteineri Caddyfile (repo: deploy/mainserver/Caddyfile) |
| /opt/stack/politsei/wg/ | wg0.conf, politsei.key (privaatvõti), politsei.pub |
| /opt/stack/politsei/data/ | epd.sqlite, sessions/, deploy-secret, control/uuenda.json |
| /opt/stack/politsei/www.prev/ | eelmine versioon (tagasivõtuks) |
| /opt/stack/politsei/olek/ | viimane.txt (viimane tulemus), vigased.txt (vahele jäetud commitid) |
| /opt/stack/politsei/juhised.txt | paigaldaja juhised (a, b, c) uuesti vaatamiseks |
| /usr/local/sbin/politsei-uuenda.sh | uuendusskript |
| politsei-uuenda.path, .timer, .service | systemd unitid |
| relee: /etc/caddy/Caddyfile, /etc/wireguard/wg0.conf | politsei.eu plokk ja peer 10.99.0.5 |
| relee: /srv/politsei/varu/index.html | "Server on hetkel kättesaamatu" |

Nftables releel ei muutu: 80 ja 443 on juba lahti, Caddy ühendus 10.99.0.5 poole on releelt endalt
väljuv liiklus wg0 kaudu. MainServeris kehtib veeb võrgu olemasolev DOCKER-USER isolatsioon (välja
ainult UDP 80.47.227.213:51820).

## Paigaldus

Tee sammud järjest. DNS-i (samm 3) võib teha ka kohe alguses, levimine võtab aega.

### 1. MainServer

MainServer PuTTY aken. Plokk 1 üksinda (küsib sudo parooli):

```
sudo -v
```

Plokk 2:

```
sudo mkdir -p /opt/stack/politsei
sudo git clone https://github.com/Qupkene/Estonian-Police-Dispatch.git /opt/stack/politsei/repo
sudo bash /opt/stack/politsei/repo/deploy/mainserver/paigalda.sh
```

Paigaldaja (umbes 5 kuni 15 minutit, kaart ja esimene ehitus võtavad kõige kauem):

1. kontrollib Debianit, Dockerit ja docker compose'i, paigaldab puuduvad paketid (git, curl, jq,
   rsync, openssl);
2. valib veeb võrgus vaba IP (alates .50) ja kontrollib, et 10.99.0.5 pole kellelgi teisel;
3. loob kaustad, kloonib või uuendab repo, loob WireGuardi võtmepaari ja webhooki saladuse;
4. kontrollib kõik enne käivitamist (docker compose config, frankenphp validate, php -l,
   wg-quick strip, bash -n);
5. tõmbab Eesti kaardi: viimane Protomaps v4 päevane build, ala 21.0,57.2,28.6,60.0, suum kuni 15;
6. teeb varukoopia, paigaldab failid, käivitab konteinerid, kontrollib `/api/health`;
7. ehitab mängu esimest korda (`politsei-uuenda.sh --joud`), käivitab systemd unitid;
8. prindib kolm plokki: (a) relee, (b) GitHubi webhook, (c) DNS. Need on ka failis
   `/opt/stack/politsei/juhised.txt` (`sudo cat /opt/stack/politsei/juhised.txt`).

Vea korral pärast paigalduse algust taastab paigaldaja eelmised failid ja konteinerid ise. Võtmed,
saladus, kaart ja andmebaas jäävad alles, uuesti käivitamine on ohutu. Uuesti käivitamine
(MainServer PuTTY, sama plokk 1 enne):

```
sudo bash /opt/stack/politsei/repo/deploy/mainserver/paigalda.sh
```

### 2. Relee

Relee PuTTY aken. Kleebi paigaldaja prinditud plokid (a): plokk 1 `sudo -v` üksinda, siis plokk 2
tervikuna. Plokis 2 on skript `deploy/relee/lisa-politsei.sh` ja uus avalik võti juba sees.

Skript teeb varukoopiad (`Caddyfile.varu-politsei-*`, `wg0.conf.varu-politsei-*`), lisab peeri
10.99.0.5 jooksvalt (`wg set`, teised tunnelid ei katke) ja wg0.conf lõppu, kirjutab varulehe,
lisab Caddy ploki ainult siis, kui seda veel pole, teeb `caddy validate` ja reloadi. Vea korral
taastab mõlemad failid ja peeri ise. Lõpus näitab WireGuardi kätlust ja `http://10.99.0.5/` vastust.

### 3. DNS

Domeeni registripidaja (või DNS-i haldus) politsei.eu jaoks:

| Tüüp | Nimi | Väärtus | Märkus |
| --- | --- | --- | --- |
| A | `@` (politsei.eu) | `80.47.227.213` | DNS only, ilma proksita |
| A | `www` | `80.47.227.213` | DNS only, ilma proksita |

Kustuta vanad GitHub Pagesi kirjed: A `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
`185.199.111.153`, kõik AAAA `2606:50c0:800x::153` ja CNAME `www` > `qupkene.github.io`. Kui mõni
AAAA jääb alles, lähevad IPv6 kasutajad endiselt GitHubi. TXT `_github-pages-challenge-qupkene`
võib alles jääda. CAA kirjeid pole vaja; kui neid on, peab üks lubama `letsencrypt.org`.

Kui DNS näitab releele, hangib relee Caddy sertifikaadi ise (mõne minutiga).

### 4. GitHubi webhook

GitHubi veebiliides: https://github.com/Qupkene/Estonian-Police-Dispatch/settings/hooks/new

| Väli | Väärtus |
| --- | --- |
| Payload URL | `https://politsei.eu/api/deploy-hook` |
| Content type | `application/json` |
| Secret | paigaldaja prinditud väärtus (`sudo cat /opt/stack/politsei/data/deploy-secret`) |
| SSL verification | Enable SSL verification |
| Which events | Let me select individual events: ainult **Workflow runs** (Pushes linnuke maha) |
| Active | linnuke peal |

Lisaks: **Settings > Pages > Custom domain** tühjaks ja Save, sest politsei.eu ei ole enam GitHub
Pagesis.

GitHub saadab kohe `ping` sündmuse. **Recent Deliveries** all peab see olema 200 ja vastus
`{"pong":true}` (kui DNS ja relee on valmis).

### 5. Kontroll

MainServer PuTTY aken:

```
curl -sI https://politsei.eu | head -n 5
curl -s https://politsei.eu/api/health
cat /opt/stack/politsei/www/version.txt
curl -sI https://www.politsei.eu | grep -i '^location'
```

Ootus: `HTTP/2 200` ja `cache-control: no-cache`; `{"ok":true,"version":"<sha>","accounts":true}`,
kus sha on sama mis version.txt; www suunab `https://politsei.eu/` peale.

## Kuidas automaatne uuendus töötab

1. Push `main` harusse, GitHub Actions jooksutab töövoogu `CI`.
2. Kui CI lõpeb, saadab GitHub webhooki (`workflow_run`) aadressile `https://politsei.eu/api/deploy-hook`.
3. API kontrollib allkirja (saladus failis `data/deploy-secret`) ja et see on roheline `CI` `main`
   harult, siis kirjutab pileti `data/control/uuenda.json`.
4. `politsei-uuenda.path` märkab piletit ja käivitab `politsei-uuenda.sh`:
   - kustutab pileti, võtab luku (üks uuendus korraga);
   - loeb `origin/main` tipu (`git ls-remote`), kui see on juba `www/version.txt`-is, lõpetab;
   - küsib GitHubi API-st selle commiti check-runs: pooleli = ootab (taimer proovib uuesti),
     punane = jätab selle commiti vahele ja teatab; e2e töö võib kukkuda, kui töövoog ise on
     roheline (`continue-on-error`);
   - ehitab `node:22` konteineris (`npm ci && npm run build`, `BASE_PATH=/`, 2 CPU, nice 10);
   - kontrollib dist-i (index.html, assets/, sw.js), `php -l` ja uue Caddyfile'i;
   - teeb `www.prev` koopia, kopeerib uue versiooni `www/` sisse (`rsync --delete`, kausta sisu,
     mitte kausta), kirjutab `version.txt`, viib repo samale commitile;
   - kontrollib `/version.txt`, avalehte ja `/api/health`;
   - mis tahes vea korral taastab `www` ja repo eelmisele versioonile.
5. `politsei-uuenda.timer` jooksutab sama skripti 5 min pärast boot'i ja siis iga 10 min järel.
   Kui webhook jäi tulemata, tuleb uuendus sealt.
6. Konteinereid ei taaskäivitata, kui pole vaja. PHP muutused jõuavad kohe kohale, uus Caddyfile
   läheb reloadiga. Kui `relee-politsei` on vahepeal taaskäivitunud, loob skript `politsei`
   konteineri uuesti (sama parandus mis mc-veebil).
7. Kui `/etc/pidu.env` sisaldab Telegrami tokenit ja chat id-d, tuleb tulemus Telegrami.

Kui uuendus muudab paigaldusfaile (compose.yml, uuendusskript, systemd unitid), ütleb skript seda
logis ja Telegramis. Siis käivita paigaldaja uuesti (vt samm 1).

## Käsitsi uuendamine

MainServer PuTTY:

```
sudo politsei-uuenda.sh
```

`--joud` ehitab tipu ka siis, kui see on juba paigas, CI pole roheline või commit on varem
ebaõnnestunud:

```
sudo politsei-uuenda.sh --joud
```

## Logid

MainServer PuTTY aken. Plokk 1 üksinda (küsib sudo parooli):

```
sudo -v
```

Plokk 2:

```
sudo journalctl -u politsei-uuenda -n 50 --no-pager
sudo journalctl -t politsei-uuenda -n 50 --no-pager
sudo cat /opt/stack/politsei/olek/viimane.txt
systemctl list-timers politsei-uuenda.timer --no-pager
docker logs politsei --tail 30
docker logs relee-politsei --tail 30
```

`-u` näitab teenuse käivitusi (webhook ja taimer), `-t` ka käsitsi käivitusi.

## Tagasivõtt

Ebaõnnestunud uuendus võetakse tagasi automaatselt. Kui uus versioon töötab tehniliselt, aga on
mängus katki, on õige tee GitHubis `git revert` ja push: see läheb läbi CI ja jõuab saidile ise.

Kiire käsitsi tagasivõtt eelmisele versioonile. Esimene rida paneb praeguse tipu vahelejäetute
nimekirja, et taimer seda kohe tagasi ei paneks; järgmine uus commit läheb jälle automaatselt.

MainServer PuTTY aken. Plokk 1 üksinda (küsib sudo parooli):

```
sudo -v
```

Plokk 2:

```
git ls-remote https://github.com/Qupkene/Estonian-Police-Dispatch.git refs/heads/main | cut -f1 | sudo tee -a /opt/stack/politsei/olek/vigased.txt
sudo rsync -a --delete /opt/stack/politsei/www.prev/ /opt/stack/politsei/www/
sudo git -c safe.directory=/opt/stack/politsei/repo -C /opt/stack/politsei/repo checkout -q -f -B main "$(cat /opt/stack/politsei/www/version.txt)"
cd /opt/stack/politsei && sudo docker compose up -d --force-recreate politsei
curl -s -m 5 "http://$(sed -n 's/^POLITSEI_IP=//p' /opt/stack/politsei/.env)/api/health"
```

`www.prev` hoiab ainult ühte eelmist versiooni.

## Kõige eemaldamine

MainServer PuTTY aken. Plokk 1 üksinda (küsib sudo parooli):

```
sudo -v
```

Plokk 2 (konteinerid, unitid, skript, ehituse vahemälu; andmed jäävad alles):

```
sudo systemctl disable --now politsei-uuenda.path politsei-uuenda.timer
cd /opt/stack/politsei && sudo docker compose down
sudo rm -f /etc/systemd/system/politsei-uuenda.service /etc/systemd/system/politsei-uuenda.path /etc/systemd/system/politsei-uuenda.timer /usr/local/sbin/politsei-uuenda.sh
sudo systemctl daemon-reload
sudo docker volume rm politsei-node-modules politsei-npm-cache
```

Plokk 3 kustutab ka kontod, salvestused, võtmed ja kaardi. Ära käivita, kui andmeid on veel vaja:

```
sudo rm -rf /opt/stack/politsei
```

Relee PuTTY aken. Plokk 1 üksinda:

```
sudo -v
```

Plokk 2 (sama mis `deploy/relee/eemalda-politsei.sh`; varukoopia, kontroll ja taastamine on sees):

```
cat > ~/eemalda-politsei.sh <<'POLITSEI_EEMALDUS_LOPP'
#!/usr/bin/env bash
# eemalda-politsei.sh: eemaldab politsei.eu relee VPS-ilt (vastupidine lisa-politsei.sh-le).
#
# Kleebitav plokk on failis docs/DEPLOY.md (relee PuTTY aken). Eemaldab ainult selle, mille
# lisa-politsei.sh lisas: märgisega WireGuardi peeri, Caddy ploki politsei.eu + www.politsei.eu
# ja varulehe. Teeb varukoopiad, kontrollib (caddy validate) ja taastab vea korral kõik ise.

set -euo pipefail
umask 077
echo "== politsei.eu eemaldamine releelt =="

WG_IF=wg0
# POLITSEI_* muutujad on ainult testimiseks, vaikimisi on relee teed.
WG_CONF="${POLITSEI_WG_CONF:-/etc/wireguard/wg0.conf}"
CADDYFILE="${POLITSEI_CADDYFILE:-/etc/caddy/Caddyfile}"
VARU_JUUR="${POLITSEI_VARU_JUUR:-/srv/politsei}"
MARK="# politsei.eu (EPD, MainServer relee-politsei)"
AEG="$(date +%Y%m%d-%H%M%S)"
CADDY_VARU="$CADDYFILE.varu-eemaldus-$AEG"
WG_VARU="$WG_CONF.varu-eemaldus-$AEG"
VOTI=""
EEMALDATUD_LIVE=0
VALMIS=0

[ "$(id -u)" -eq 0 ] || { echo "VIGA: käivita sudo-ga" >&2; exit 1; }
cp -a "$CADDYFILE" "$CADDY_VARU"
cp -a "$WG_CONF" "$WG_VARU"
echo "Varukoopiad: $CADDY_VARU ja $WG_VARU"

taasta() {
    set +e
    echo "!! Viga, taastan kõik"
    cp -a "$CADDY_VARU" "$CADDYFILE"
    cp -a "$WG_VARU" "$WG_CONF"
    if [ "$EEMALDATUD_LIVE" = 1 ]; then
        wg set "$WG_IF" peer "$VOTI" allowed-ips 10.99.0.5/32
    fi
    systemctl reload caddy
    echo "!! Taastatud"
}

lopp() {
    local rc=$?
    trap - EXIT
    if [ "$rc" -ne 0 ] && [ "$VALMIS" != 1 ]; then
        taasta
    fi
    exit "$rc"
}
trap lopp EXIT

VOTI="$(awk -v m="$MARK" '
    $0 == m { sees = 1; next }
    sees && /PublicKey/ { gsub(/[[:space:]]/, ""); sub(/^PublicKey=/, ""); print; exit }
' "$WG_CONF")"

# Caddy: märkuse reast "# politsei.eu (EPD): ..." kuni www.politsei.eu ploki lõpuni.
awk '
    /^# politsei\.eu \(EPD\): MainServer/ { sees = 1 }
    sees && /^www\.politsei\.eu \{/ { www = 1 }
    !sees { print }
    sees && www && /^\}/ { sees = 0; www = 0 }
' "$CADDYFILE" > "$CADDYFILE.uus"
cat "$CADDYFILE.uus" > "$CADDYFILE"
rm -f "$CADDYFILE.uus"

awk -v m="$MARK" '
    $0 == m { sees = 1; peer = 0; next }
    sees && /^[[:space:]]*\[/ { if (peer) { sees = 0 } else { peer = 1; next } }
    sees && /^[[:space:]]*$/ { sees = 0 }
    !sees { print }
' "$WG_CONF" > "$WG_CONF.uus"
cat "$WG_CONF.uus" > "$WG_CONF"
rm -f "$WG_CONF.uus"

caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1 \
    || { echo "VIGA: caddy validate ebaõnnestus" >&2; exit 1; }
if [ -n "$VOTI" ]; then
    wg set "$WG_IF" peer "$VOTI" remove
    EEMALDATUD_LIVE=1
fi
systemctl reload caddy
VALMIS=1
rm -rf -- "${VARU_JUUR:?}"
echo "Valmis: politsei.eu eemaldatud (peer ${VOTI:-puudus}, Caddy plokk, varuleht)."
POLITSEI_EEMALDUS_LOPP
sudo bash ~/eemalda-politsei.sh
```

Lõpuks DNS-is politsei.eu ja www A-kirjed ära (või uude kohta) ning GitHubis webhook ära
(Settings > Webhooks > Delete).

## Veaotsing

| Sümptom | Põhjus ja lahendus |
| --- | --- |
| Leht "Server on hetkel kättesaamatu" või API 503 `offline` | Relee ei saa koju. Releel `sudo wg show`: peeri 10.99.0.5 `latest handshake` peab olema alla 2 min. MainServeris `docker ps`, `docker exec relee-politsei wg show`, `docker logs relee-politsei --tail 30`. Kui relee-politsei taaskäivitus eraldi: `cd /opt/stack/politsei && docker compose up -d --force-recreate politsei` (taimer teeb sama 10 min jooksul). |
| Kätlus puudub üldse | Võtmed ei klapi: `sudo cat /opt/stack/politsei/wg/politsei.pub` peab olema releel `sudo wg show` all. Vajadusel käivita relee plokk (`sudo cat /opt/stack/politsei/juhised.txt`) uuesti. |
| Brauser: sertifikaadi viga | DNS pole veel releel: `dig +short politsei.eu` peab andma ainult `80.47.227.213`. Releel `sudo journalctl -u caddy -n 50 --no-pager \| grep -i politsei`. |
| Webhook: 401 `bad_signature` | Saladus ei klapi. `sudo cat /opt/stack/politsei/data/deploy-secret`, kleebi GitHubi webhooki Secret väljale, siis Recent Deliveries > Redeliver. |
| Webhook: 503 `not_configured` | `data/deploy-secret` puudub: käivita paigaldaja uuesti. |
| Webhook: 200 `{"ignored": ...}` | Normaalne: teine haru, punane CI või muu töövoog. Põhjus on vastuses. |
| Uuendus ei tule | `sudo journalctl -u politsei-uuenda -n 50 --no-pager`. "Ootan CI-d" = CI käib; "varem ebaõnnestunud" = paranda ja tee uus commit või `sudo politsei-uuenda.sh --joud`; "GitHubi API ei vasta" = võrk või päringulimiit (60 tunnis), taimer proovib uuesti. |
| Kaart näitab ainult taktikalist vaadet, teade "Tänavakaardi faili ei leitud" | `ls -lh /opt/stack/politsei/tiles/`. Tõmba uuesti: `sudo bash /opt/stack/politsei/repo/deploy/mainserver/paigalda.sh --kaart` |
| `/api/health` annab 500 | `docker logs politsei --tail 50`. Tavaliselt andmekaust: `sudo ls -la /opt/stack/politsei/data`. |
| Telefon näitab vana versiooni | index.html ja sw.js on `no-cache`, uus versioon tuleb järgmisel avamisel. Kiiresti: sulge kõik vahelehed või kustuta saidi andmed. |
| Ehitus kukub mälu tõttu | Ehitus saab 3 GB ja 2 CPU-d. Vaata logi; kui Minecraft võtab kogu mälu, proovi hiljem `sudo politsei-uuenda.sh --joud`. |

## Kohalik arendus tänavakaardiga

`npm run dev` serveerib faili `public/tiles/estonia.pmtiles` Range päringutega (kaust on
.gitignore'is). Lihtsaim on kopeerida fail MainServerist. Qupkenepro PowerShell, repo kaustas:

```
mkdir public\tiles
scp magnus@10.10.20.10:/opt/stack/politsei/tiles/estonia.pmtiles public/tiles/
```

Ilma failita näitab mäng taktikalist kaarti.

## Valikuline: eelvaade github.io-s

`.github/workflows/deploy.yml` avaldab mängu aadressil `https://qupkene.github.io/Estonian-Police-Dispatch/`
ainult käsitsi käivitades. Seal pole API-t (ainult külalisrežiim) ega tänavakaarti (taktikaline
kaart).

GitHubi veebiliides:

1. **Settings > Pages > Build and deployment > Source**: GitHub Actions. Custom domain jääb tühjaks.
2. **Actions > Deploy to GitHub Pages (preview) > Run workflow**.
3. Kui deploy töö annab "not allowed to deploy to github-pages due to environment protection rules",
   luba haru: **Settings > Environments > github-pages > Deployment branches and tags**.

## Service worker

`public/sw.js` hoiab mängu võrguta mängitavana. Lehed laetakse võrgust enne vahemälu. Kui võrku
pole või server vastab 5xx (relee varuleht, kui koduserver on maas), avaneb vahemälus olev mäng.
Räsiga `assets/*` ja `glyphs/*` tulevad vahemälust, `/api/` ja `/tiles/` lähevad alati otse
serverisse.

`VERSION` ja `PRECACHE` kirjutab ehitus ise (`vite.config.ts`, plugin `epd-sw-manifest`). Versioon
on paketi versioon pluss kogu ehituse räsi. Nimekirjas on kõik JS-tükid ja stiilifailid (ka
vahetuse ekraani eraldi tükk), MapLibre'i worker, ladina kirja fondid, kaardi kirjamärgid
(`glyphs/`) ja algsed versioonid (`legacy/`). Iga muudatusega deploy paigaldab seega uue service
workeri, mis laeb uue ehituse vahemällu ja kustutab vanad vahemälud. Eelmise ehituse staatiline
vahemälu jääb alles, et veel avatud vaheleht saaks oma ülejäänud tükid kätte. Käsitsi pole vaja
midagi tõsta.

## .eu domeen

- `.eu` domeeni võib hoida EL-i või EMP kodanik, elanik või seal asutatud ettevõte. Hoia
  registripidaja andmed õiged.
- Lülita automaatne pikendus sisse. Aegunud domeen, mis on ühe tähe kaugusel politsei.ee-st, võib
  minna kellelegi, kes jäljendab politseid.
- Hoia mängus nähtaval, et EPD on mitteametlik fännimäng ega ole seotud PPA-ga.
