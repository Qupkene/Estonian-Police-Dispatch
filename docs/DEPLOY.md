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
  +-- /tiles/*  /opt/stack/politsei/tiles          estonia.pmtiles (tänavakaart), roads-v1.bin ja
                                                   buildings-v1.bin (teed ja hooned, vt "Kaardiandmed")
```

| Kus | Mis |
| --- | --- |
| /opt/stack/politsei/compose.yml | relee-politsei + politsei (repo: deploy/mainserver/compose.yml) |
| /opt/stack/politsei/conf/Caddyfile | konteineri Caddyfile (repo: deploy/mainserver/Caddyfile) |
| /opt/stack/politsei/wg/ | wg0.conf, politsei.key (privaatvõti), politsei.pub |
| /opt/stack/politsei/data/ | epd.sqlite, sessions/, deploy-secret, control/uuenda.json, varu/ (andmebaasi varukoopiad), tts/ (raadio kõne vahemälu) |
| /opt/stack/politsei/www.prev/ | eelmine versioon (tagasivõtuks) |
| /opt/stack/politsei/olek/ | viimane.txt (viimane tulemus), vigased.txt (vahele jäetud commitid), kaardiandmed.txt (millest kaardiandmed viimati ehitati) |
| /opt/stack/politsei/juhised.txt | paigaldaja juhised (a, b, c) uuesti vaatamiseks |
| /usr/local/sbin/politsei-uuenda.sh | uuendusskript |
| politsei-uuenda.path, .timer, .service | systemd unitid |
| relee: /etc/caddy/Caddyfile, /etc/wireguard/wg0.conf | politsei.eu plokk ja peer 10.99.0.5 |
| relee: /etc/caddy/Caddyfile | `http://10.99.0.1` plokk: TartuNLP vahendaja (vt "Raadio eestikeelne kõne") |
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
5. tõmbab Eesti kaardi: viimane Protomaps v4 päevane build, ala 21.0,57.2,28.6,60.0, suum kuni 15,
   ja ehitab sellest kaardiandmed (teed ja hooned, vt "Kaardiandmed"; esimesel paigaldusel teeb
   selle esimene ehitus);
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
   - teeb andmebaasist varukoopia `data/varu/` kausta (vt "Andmed ja varukoopiad"); kui see ei
     õnnestu, jääb sait vana versiooni peale;
   - teeb `www.prev` koopia, kopeerib uue versiooni `www/` sisse (`rsync --delete`, kausta sisu,
     mitte kausta), kirjutab `version.txt`, viib repo samale commitile;
   - kontrollib `/version.txt`, avalehte ja `/api/health`;
   - mis tahes vea korral taastab `www` ja repo eelmisele versioonile;
   - lõpuks ehitab kaardiandmed (vt "Kaardiandmed"), kui need puuduvad, on kaardist vanemad või
     ehitusskript muutus. Selle viga ainult logitakse ja teatatakse, uus versioon jääb paigale.
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

Ainult kaardiandmed (paigas oleva versiooni skriptiga; ehitab, kui need puuduvad või on
vananenud, koos `--joud` alati):

```
sudo politsei-uuenda.sh --kaardiandmed
sudo politsei-uuenda.sh --kaardiandmed --joud
```

## Kaardiandmed (teed ja hooned)

Et autod sõidaksid teid mööda ja väljakutsed oleksid majade ja kaubanduskeskuste juures, kasutab
kaart kahte faili, mis tehakse tänavakaardist `estonia.pmtiles` (väliseid teenuseid pole):

| Fail | Sisu |
| --- | --- |
| `tiles/roads-v1.bin` | autoteede graaf (ristmikud, teelõigud kujuga, kiirusklass, ühesuunalisus) |
| `tiles/buildings-v1.bin` | hoonete keskpunktid (alates 40 m2) suurusega, võrestikuga otsinguks |
| `*.bin.gz` | samad gzip-ina, Caddy saadab need `Content-Encoding: gzip` päisega |

Need ehitab `scripts/build-mapdata.mjs` (`node:22` konteineris, ilma võrguta, kaart ainult
lugemiseks): loeb kõik suumi 15 plaadid ükshaaval, lõikab jooned täpselt plaadi piiril, ühendab
need üle piiride, kirjutab failid ajutise nimega ja nimetab siis ümber (bind mount näeb uut faili).
Eesti jaoks võtab see eeldatavasti mõne minuti ja alla 1 GB mälu; failid on kokku umbes 10 kuni
15 MB (gzip 5 kuni 8 MB), brauser hoiab neid ööpäeva vahemälus.
Uuendus ehitab need siis, kui need puuduvad, on `estonia.pmtiles`-ist vanemad või skript muutus;
paigaldaja teeb sama pärast kaardi tõmbamist (ka `--kaart`). Viga ei katkesta ega tühista midagi:
vanad failid jäävad alles.

Mäng loeb failid taustal (töölõimes) ühe korra lehe kohta. Kui neid pole (404), sõidavad autod
sirgjooni pidi nagu varem ja väljakutsed on oma algsetes punktides.

## Raadio eestikeelne kõne (TartuNLP Neurokõne)

Eesti keeles loeb raadiosõnumeid ette Tartu Ülikooli Neurokõne (TartuNLP). Brauser räägib ainult
politsei.eu-ga: `POST /api/tts` teeb kõne serveris ja hoiab helifaili vahemälus
`data/tts/` (kuni 300 MB, vanimad kustuvad ise). Konteineril pole internetti, seega küsib PHP
releelt (`EPD_TTS_UPSTREAM=http://10.99.0.1/text-to-speech/v2`) ja relee Caddy saadab päringu edasi
`https://api.tartunlp.ai`. Relee vastab sellele ainult WireGuardi aadressidelt (10.99.0.0/24), teised
saavad 403. Kuni relee plokki pole, on eestikeelne raadio vait (või brauseri häälega), mäng töötab.

Relee PuTTY aken. Plokk 1 üksinda (küsib sudo parooli):

```
sudo -v
```

Plokk 2 (sama mis `deploy/relee/lisa-tts.sh`; varukoopia, kontroll ja taastamine on sees, uuesti
käivitamine on ohutu):

```
cat > ~/lisa-tts.sh <<'TTS_LISAMINE_LOPP'
#!/usr/bin/env bash
# lisa-tts.sh: lisab relee VPS-i Caddy'sse eestikeelse kõne vahendaja (EPD raadio, TartuNLP Neurokõne).
#
# Kleebitav plokk on failis docs/DEPLOY.md, "Raadio eestikeelne kõne" (relee PuTTY aken).
# Käsitsi: sudo bash lisa-tts.sh
#
# MainServeri politsei konteineril pole internetti, ainult WireGuard releele. PHP küsib
# http://10.99.0.1/text-to-speech/v2, relee Caddy saadab päringu edasi https://api.tartunlp.ai.
# Plokk vastab ainult WireGuardi aadressidele 10.99.0.0/24 ja ainult teele /text-to-speech/*
# (keha kuni 64 kB). Kõik teised saavad 403, ka võltsitud Host päisega: see pole avalik proksi.
#
# Teeb: varukoopia (/etc/caddy/Caddyfile), Caddy plokk (ainult kui seda veel pole), caddy validate,
# reload. Vea korral taastab faili ise. Uuesti käivitamine on ohutu.
#
# nftables muutust pole vaja: input lubab tcp 80 igal liidesel (ka wg0), ühendus api.tartunlp.ai
# poole on releelt endalt väljuv liiklus (output policy accept).

set -euo pipefail
umask 077
echo "== TTS vahendaja (TartuNLP) lisamine releele =="

# TTS_CADDYFILE on ainult testimiseks, vaikimisi on relee tee.
CADDYFILE="${TTS_CADDYFILE:-/etc/caddy/Caddyfile}"
AVALIK_IP=80.47.227.213
MARK="# EPD TTS (TartuNLP Neurokõne) releel, lisas lisa-tts.sh"
AEG="$(date +%Y%m%d-%H%M%S)"
CADDY_VARU="$CADDYFILE.varu-tts-$AEG"
VALMIS=0

die() {
    echo "VIGA: $*" >&2
    exit 1
}

taasta() {
    set +e
    echo "!! Viga, taastan Caddyfile'i"
    [ -f "$CADDY_VARU" ] && cp -a "$CADDY_VARU" "$CADDYFILE"
    if caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
        systemctl reload caddy
    fi
    echo "!! Taastatud. Varukoopia: $CADDY_VARU"
}

lopp() {
    local rc=$?
    trap - EXIT
    if [ "$rc" -ne 0 ] && [ "$VALMIS" != 1 ]; then
        taasta
    fi
    exit "$rc"
}

[ "$(id -u)" -eq 0 ] || die "käivita root õigustes: sudo bash $0"
for kask in caddy systemctl grep mktemp; do
    command -v "$kask" >/dev/null 2>&1 || die "käsk $kask puudub"
done
[ -f "$CADDYFILE" ] || die "$CADDYFILE puudub"

echo "1/4 Varukoopia"
cp -a "$CADDYFILE" "$CADDY_VARU"
echo "    $CADDY_VARU"
trap lopp EXIT

echo "2/4 Caddy plokk"
if grep -qxF -- "$MARK" "$CADDYFILE"; then
    echo "    plokk on juba olemas, teist ei lisata"
elif grep -qE '^[[:space:]]*(https?://)?10\.99\.0\.1(:80)?([[:space:]]*,|[[:space:]]*\{|[[:space:]]*$)' "$CADDYFILE"; then
    die "Caddyfile'is on juba teine 10.99.0.1 plokk, seda skript ei muuda. Vaata: sudo grep -n 10.99.0.1 $CADDYFILE"
else
    cat >> "$CADDYFILE" <<'CADDYPLOKK'

# EPD TTS (TartuNLP Neurokõne) releel, lisas lisa-tts.sh
# MainServeri politsei konteiner (10.99.0.5) küsib siit eestikeelset kõnet. Ainult WireGuardi
# aadressid 10.99.0.0/24 ja ainult /text-to-speech/*, kõik muu saab 403 (pole avalik proksi).
http://10.99.0.1 {
	@wg remote_ip 10.99.0.0/24
	handle @wg {
		handle /text-to-speech/* {
			request_body {
				max_size 64KB
			}
			reverse_proxy https://api.tartunlp.ai {
				header_up Host api.tartunlp.ai
				header_up -X-Forwarded-Host
				transport http {
					tls_server_name api.tartunlp.ai
					dial_timeout 5s
					response_header_timeout 20s
				}
			}
		}
		handle {
			respond "Not found" 404
		}
	}
	handle {
		respond "Forbidden" 403
	}
}
CADDYPLOKK
    echo "    lisatud faili lõppu"
fi
VALIDATE_LOG="$(mktemp)"
if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >"$VALIDATE_LOG" 2>&1; then
    tail -n 5 "$VALIDATE_LOG"
    rm -f "$VALIDATE_LOG"
    die "caddy validate ebaõnnestus"
fi
rm -f "$VALIDATE_LOG"
echo "    caddy validate: korras"

echo "3/4 Caddy reload"
systemctl reload caddy
VALMIS=1
echo "    tehtud"

echo "4/4 Kontroll"
if command -v curl >/dev/null 2>&1; then
    sleep 2
    WAV="$(mktemp)"
    kood="$(curl -s -o "$WAV" -m 30 -w '%{http_code}' -H 'Content-Type: application/json' \
        --data '{"text":"Tere, siin juhtimiskeskus.","speaker":"mari","speed":1}' \
        http://10.99.0.1/text-to-speech/v2 || true)"
    if [ "$kood" = 200 ] && [ "$(head -c 4 "$WAV")" = RIFF ]; then
        echo "TartuNLP releelt: korras, $(wc -c < "$WAV") baiti WAV"
    else
        echo "HOIATUS: TartuNLP vastas ${kood:-000} (ootus 200 ja WAV). Plokk on paigas, proovi hiljem:"
        echo "  curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' --data '{\"text\":\"Tere.\",\"speaker\":\"mari\"}' http://10.99.0.1/text-to-speech/v2; echo"
    fi
    rm -f "$WAV"
    avalik="$(curl -s -o /dev/null -m 5 -w '%{http_code}' -H 'Host: 10.99.0.1' "http://$AVALIK_IP/text-to-speech/v2" || true)"
    echo "Avalik aadress võltsitud Host päisega: ${avalik:-000} (403 = korras, pole avalik proksi)"
else
    echo "curl puudub, kontrolli MainServerist (docs/DEPLOY.md)"
fi
echo
echo "Valmis. MainServeris küsib politsei konteiner http://10.99.0.1/text-to-speech/v2 (EPD_TTS_UPSTREAM)."
TTS_LISAMINE_LOPP
sudo bash ~/lisa-tts.sh
```

Ootus: `TartuNLP releelt: korras, ... baiti WAV` ja võltsitud Host päisega `403`.

Kontroll MainServeris (MainServer PuTTY aken, sama plokk 1 enne). Esimene rida küsib releelt otse
konteinerist, teine läbi mängu API:

```
sudo docker exec politsei php -r '$c = stream_context_create(["http" => ["method" => "POST", "header" => "Content-Type: application/json\r\n", "content" => json_encode(["text" => "Tere, siin juhtimiskeskus.", "speaker" => "mari"]), "timeout" => 15, "ignore_errors" => true]]); $w = @file_get_contents(getenv("EPD_TTS_UPSTREAM") ?: "http://10.99.0.1/text-to-speech/v2", false, $c); echo $http_response_header[0] ?? "vastust pole", ", ", strlen((string) $w), " baiti, ", substr((string) $w, 0, 4) === "RIFF" ? "WAV korras" : "pole WAV", "\n";'
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' -X POST -H 'X-EPD: 1' -H 'Content-Type: application/json' --data '{"text":"Tere, siin juhtimiskeskus.","voice":"mari"}' "http://$(sed -n 's/^POLITSEI_IP=//p' /opt/stack/politsei/.env)/api/tts"
```

Ootus: `HTTP/1.1 200 OK, ... baiti, WAV korras` ja `200 audio/wav`. API vastus 503 `tts_unavailable`
tähendab, et relee või TartuNLP ei vastanud; server proovib siis uuesti alles minuti pärast.

`EPD_TTS_UPSTREAM` on `compose.yml`-is, aga sama väärtus on ka koodis vaikimisi, nii et kõne töötab
kohe pärast uuendust. Uuendus teatab muutunud `compose.yml`-ist; paigaldaja võib uuesti käivitada
millal sobib. Eemaldamine: `deploy/relee/eemalda-tts.sh` releel samamoodi (heredoc ja
`sudo bash`).

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

`www.prev` hoiab ainult ühte eelmist versiooni. Tagasivõtt ei puuduta andmebaasi ega sessioone:
kontod, salvestused ja sisselogimised jäävad alles. Andmebaasi taastamine varukoopiast on allpool.

## Andmed ja varukoopiad

Mängijate andmed on kahes kohas. Külaliste mäng on ainult nende brauseris (localStorage), server ei
näe ega muuda seda. Kontoga mängijate kontod, pilvesalvestused (career, settings, autosave) ja
edetabel on andmebaasis `/opt/stack/politsei/data/epd.sqlite`, sisselogimised kaustas
`data/sessions/`. Kaust `data/` on konteineris `/data` (bind mount `./data:/data`), seega konteineri
uuesti loomine, uus pilt või `docker compose down` ei puuduta seda.

### Mida uuendus puudutab

| Tee | Uuendus (`politsei-uuenda.sh`) | Paigaldaja uuesti (`paigalda.sh`) |
| --- | --- | --- |
| `www/` | uus mäng (rsync), tagasivõtul vana | ainult ajutine `index.html`, kui seda pole |
| `www.prev/` | eelmise versiooni koopia | ei muuda |
| `repo/` | `git checkout` uuele commitile (ka `server/`) | `git fetch` |
| `conf/` | `Caddyfile`, kui see repos muutus (enne kontroll) | `Caddyfile` |
| `ehitus/`, `olek/` | ehitus ja olek (`olek/kaardiandmed.txt`) | `olek/kaardiandmed.txt` |
| `compose.yml`, `.env`, `wg/wg0.conf`, systemd unitid, `/usr/local/sbin/politsei-uuenda.sh` | ei muuda | paigaldab (vanad failid `varu/paigaldus-*`) |
| `data/epd.sqlite` | **ei muuda** (loeb ainult varukoopia jaoks) | **ei muuda** (loeb ainult varukoopia jaoks) |
| `data/sessions/` | **ei muuda** | **ei muuda** |
| `data/deploy-secret` | **ei muuda** | loob ainult siis, kui seda pole või see on tühi |
| `data/control/uuenda.json` | kustutab (uuenduse pilet) | ei muuda |
| `data/varu/` | uus varukoopia, vanad koristab | uus varukoopia, vanad koristab |
| `tiles/estonia.pmtiles` | **ei muuda** (kaardiandmete konteiner näeb seda ainult lugemiseks) | ainult siis, kui see puudub, ei läbi kontrolli või anti `--kaart`; uus fail kontrollitakse enne asendamist |
| `tiles/*-v1.bin`, `tiles/*-v1.bin.gz` | kaardiandmed uuesti, kui need puuduvad või on vananenud | sama |

Konteiner `politsei` luuakse uuesti ainult siis, kui `server/` kaust vahetus või `relee-politsei`
taaskäivitus. Andmed on hostis, need jäävad alles.

Andmebaasi skeem muutub ainult lisades (uued tabelid, veerud ja indeksid, kõik ühes tehingus). Kui
muudatus ebaõnnestub, jääb andmebaas täpselt selliseks, nagu ta oli, tervisekontroll kukub ja
uuendus võetakse tagasi. Ka pärast õnnestunud muudatust töötab eelmine versioon samal andmebaasil.
Reeglid on failis `server/lib/db.php`, testid (`tests/server.test.ts`) kontrollivad neid iga
serverisse jõudnud versiooni andmebaasiga (`tests/fixtures/db/`).

Sisselogimised jäävad uuendusest puutumata: sessioonifailid on kaustas `data/sessions/`, küpsis on
alati `EPDSESS` (`Path=/`, `HttpOnly`, `SameSite=Lax`, 30 päeva). Testid kontrollivad, et versiooni
92ed7f5 sessioonid ja küpsis kehtivad ka uues versioonis.

### Varukoopiad

- **Millal**: iga uuenduse ajal enne vahetust, iga kord kui paigaldaja käivitatakse (kui andmebaas
  on olemas) ja käsitsi (`sudo politsei-uuenda.sh --varunda`).
- **Kuidas**: `VACUUM INTO` konteineris `politsei` (kui see ei tööta, siis ajutises konteineris).
  Sait töötab edasi, koopia on ühe hetke seis koos WAL-i muudatustega. Koopia läbib
  `integrity_check`-i ja saab lõpliku nime alles pärast seda.
- **Kus**: `/opt/stack/politsei/data/varu/`, nimi näiteks `epd-20261017T193016Z-92ed7f5.sqlite`:
  koopia tegemise aeg (UTC) ja versioon, mis siis töötas.
- **Kui kaua**: alles jäävad 14 uusimat ja lisaks iga viimase 7 päeva (UTC) uusim koopia, kokku
  kuni 21 faili. Muid faile kaustas ei puudutata.
- **Kui varukoopia ei õnnestu** (nt kettal on vähem kui kaks andmebaasi suurust pluss 100 MB vaba):
  vahetust ei tule, sait jääb vana versiooni peale ja tuleb Telegrami teade. Taimer proovib 10
  minuti pärast uuesti. Kui sama commit kukub teist korda, jääb see vahele, kuni parandad vea ja
  käivitad `sudo politsei-uuenda.sh --joud`. Paigaldaja lõpetab samal juhul enne, kui midagi muudab.

Uuendusskripti uue versiooni paigaldab ainult paigaldaja. Uuendus, mis varukoopiad toob, jõuab
saidile veel vana skriptiga ehk ilma varukoopiata. Seepärast tee selle uuenduse eel üks varukoopia
käsitsi (töötab ka vana skriptiga) ja pärast uuendust käivita paigaldaja uuesti (vt samm 1,
uuendus ütleb seda ka ise Telegramis).

MainServer PuTTY aken. Plokk 1 üksinda (küsib sudo parooli):

```
sudo -v
```

Plokk 2:

```
sudo docker exec politsei php -r '@mkdir("/data/varu", 0700); $d = new PDO("sqlite:/data/epd.sqlite", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]); $d->exec("VACUUM INTO " . $d->quote("/data/varu/epd-" . gmdate("Ymd\THis\Z") . "-" . substr(trim(file_get_contents("/app/www/version.txt")), 0, 7) . ".sqlite"));'
sudo ls -lh /opt/stack/politsei/data/varu
```

Kui paigaldaja on pärast seda korra käivitatud, piisab käsitsi varukoopiaks reast
`sudo politsei-uuenda.sh --varunda`.

### Taastamine varukoopiast

Taastamine asendab andmebaasi koopiaga. Kõik, mis tehti pärast koopia aega (uued kontod,
pilvesalvestused, edetabeli read), kaob serverist. Praegune andmebaas jääb enne alles kausta, mille
nimi algab `enne-taastamist-` ja lõpeb kellaajaga (UTC), nii et taastamise saab tagasi pöörata.
Sait on mõne sekundi maas, uuendused on selle aja peatatud.

MainServer PuTTY aken. Plokk 1 üksinda (küsib sudo parooli):

```
sudo -v
```

Plokk 2 näitab varukoopiaid, uusim on viimane:

```
sudo ls -lh /opt/stack/politsei/data/varu
```

Plokk 3 taastab uusima koopia, failinime pole vaja valida. Kui tahad mõnda vanemat, muuda enne
kleepimist esimene rida selliseks: `UUS=epd-20261017T193016Z-92ed7f5.sqlite` (õige nimi plokist 2).
Kui koopiaid pole, ei kustutata ega asendata midagi ja sait käivitub sama andmebaasiga uuesti.

```
UUS="$(sudo find /opt/stack/politsei/data/varu -maxdepth 1 -name 'epd-*.sqlite' -printf '%f\n' | sort | tail -n 1)"; echo "Taastan: ${UUS:-VARUKOOPIAT POLE}"
sudo systemctl stop politsei-uuenda.timer politsei-uuenda.path && sudo flock -w 1800 /run/lock/politsei-uuenda.lock true
cd /opt/stack/politsei && sudo docker compose stop politsei
VANA="/opt/stack/politsei/data/enne-taastamist-$(date -u +%Y%m%dT%H%M%SZ)"; sudo install -d -m 0700 "$VANA" && sudo find /opt/stack/politsei/data -maxdepth 1 -name 'epd.sqlite*' -exec cp -a -t "$VANA" {} + && [ -n "$UUS" ] && sudo rm -f /opt/stack/politsei/data/epd.sqlite-wal /opt/stack/politsei/data/epd.sqlite-shm && sudo cp -p "/opt/stack/politsei/data/varu/$UUS" /opt/stack/politsei/data/epd.sqlite && echo "Taastatud: $UUS (vana andmebaas: $VANA)"
cd /opt/stack/politsei && sudo docker compose start politsei
sudo systemctl start politsei-uuenda.path politsei-uuenda.timer
sleep 3; curl -s -m 5 "http://$(sed -n 's/^POLITSEI_IP=//p' /opt/stack/politsei/.env)/api/health"; echo
sudo docker exec politsei php -r 'echo (new PDO("sqlite:/data/epd.sqlite"))->query("SELECT COUNT(*) FROM users")->fetchColumn(), " kontot\n";'
```

Ootus: `{"ok":true,...}` ja kontode arv.

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

Plokk 3 kustutab ka kontod, salvestused, andmebaasi varukoopiad, võtmed ja kaardi. Ära käivita, kui
andmeid on veel vaja:

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
| Autod sõidavad sirgjooni pidi, väljakutsed pole majade juures | Kaardiandmed puuduvad. `ls -lh /opt/stack/politsei/tiles/` peab näitama `roads-v1.bin` ja `buildings-v1.bin`. Logi: `sudo journalctl -t politsei-uuenda -n 50 --no-pager \| grep -i kaardiandmed`. Uuesti: `sudo politsei-uuenda.sh --kaardiandmed --joud` |
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

Kaardiandmed (teed ja hooned) samast failist, repo kaustas:

```
node scripts/build-mapdata.mjs public/tiles/estonia.pmtiles public/tiles/
```

Ilma nendeta sõidavad autod sirgjooni pidi. Kaardi arendusvaade (`src/map/__dev__/harness.html`)
näitab `?roads=1` korral teedevõrku ja hooneid kaardi peal.

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
