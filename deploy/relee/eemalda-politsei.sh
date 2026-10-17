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
