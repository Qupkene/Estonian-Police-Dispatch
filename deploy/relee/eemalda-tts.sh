#!/usr/bin/env bash
# eemalda-tts.sh: eemaldab relee VPS-i Caddy'st eestikeelse kõne vahendaja (vastupidine lisa-tts.sh-le).
#
# Kleebitav plokk on failis docs/DEPLOY.md, "Raadio eestikeelne kõne" (relee PuTTY aken).
# Eemaldab ainult selle, mille lisa-tts.sh lisas: märgisega kommentaarist kuni ploki
# http://10.99.0.1 lõpuni. Teeb varukoopia, kontrollib (caddy validate) ja taastab vea korral
# faili ise. Mäng jääb tööle, eestikeelne raadio on siis jälle vait (või brauseri häälega).

set -euo pipefail
umask 077
echo "== TTS vahendaja eemaldamine releelt =="

# TTS_CADDYFILE on ainult testimiseks, vaikimisi on relee tee.
CADDYFILE="${TTS_CADDYFILE:-/etc/caddy/Caddyfile}"
MARK="# EPD TTS (TartuNLP Neurokõne) releel, lisas lisa-tts.sh"
AEG="$(date +%Y%m%d-%H%M%S)"
CADDY_VARU="$CADDYFILE.varu-tts-eemaldus-$AEG"
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
for kask in caddy systemctl awk grep; do
    command -v "$kask" >/dev/null 2>&1 || die "käsk $kask puudub"
done
[ -f "$CADDYFILE" ] || die "$CADDYFILE puudub"
if ! grep -qxF -- "$MARK" "$CADDYFILE"; then
    echo "TTS plokki pole, midagi ei muudetud."
    exit 0
fi

cp -a "$CADDYFILE" "$CADDY_VARU"
echo "Varukoopia: $CADDY_VARU"
trap lopp EXIT

# Märgisest kuni ploki "http://10.99.0.1 {" sulgeva "}" reani (koos eelneva tühja reaga).
# Kood 3: plokk ei lõpe, kood 4: liiga palju ridu. Siis faili ei muudeta.
awk -v m="$MARK" '
    !sees && $0 == m { sees = 1; tyhi = 0; next }
    sees {
        eemaldatud++
        if (eemaldatud > 60) { exit 4 }
        if (!plokk && $0 ~ /^http:\/\/10\.99\.0\.1[[:space:]]*\{/) { plokk = 1; next }
        if (plokk && $0 ~ /^\}/) { sees = 0; plokk = 0 }
        next
    }
    $0 == "" { tyhi++; next }
    { while (tyhi > 0) { print ""; tyhi-- } print }
    END {
        if (sees) { exit 3 }
        while (tyhi > 0) { print ""; tyhi-- }
    }
' "$CADDYFILE" > "$CADDYFILE.uus" || { rm -f "$CADDYFILE.uus"; die "TTS plokki ei leitud tervikuna, faili ei muudetud"; }
cat "$CADDYFILE.uus" > "$CADDYFILE"
rm -f "$CADDYFILE.uus"
if grep -qxF -- "$MARK" "$CADDYFILE"; then
    die "märgis on ikka failis"
fi

caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1 || die "caddy validate ebaõnnestus"
systemctl reload caddy
VALMIS=1
echo "Valmis: TTS plokk eemaldatud."
