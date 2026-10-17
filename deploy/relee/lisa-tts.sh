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
