#!/usr/bin/env bash
# lisa-politsei.sh: lisab politsei.eu relee VPS-ile (80.47.227.213).
#
# MainServeri paigalda.sh prindib selle skripti koos uue avaliku võtmega ühe kleebitava plokina
# (relee PuTTY aken). Käsitsi: sudo bash lisa-politsei.sh 'RELEE-POLITSEI AVALIK VÕTI'
#
# Teeb: varukoopia (/etc/caddy/Caddyfile, /etc/wireguard/wg0.conf), WireGuardi peer 10.99.0.5
# jooksvalt (wg set, teised tunnelid ei katke) ja wg0.conf lõppu, varuleht
# /srv/politsei/varu/index.html, Caddy plokk politsei.eu + www.politsei.eu (ainult kui seda veel
# pole, vt I50), caddy validate, reload. Vea korral taastab mõlemad failid ja WireGuardi peeri ise.
# Uuesti käivitamine on ohutu.
#
# nftables muutust pole vaja: input lubab juba tcp 80 ja 443 (ning udp 443 ja 51820). Caddy
# ühendus 10.99.0.5:80 poole on releelt endalt väljuv liiklus wg0 kaudu (output policy accept,
# vastused established), forward ahelat ega DNAT-i see ei kasuta.

set -euo pipefail
umask 077
echo "== politsei.eu lisamine releele =="

VOTI="${1:-}"
WG_IF=wg0
# POLITSEI_* muutujad on ainult testimiseks, vaikimisi on relee teed.
WG_CONF="${POLITSEI_WG_CONF:-/etc/wireguard/wg0.conf}"
CADDYFILE="${POLITSEI_CADDYFILE:-/etc/caddy/Caddyfile}"
VARU_JUUR="${POLITSEI_VARU_JUUR:-/srv/politsei}"
VARU_KAUST="$VARU_JUUR/varu"
PEER_IP=10.99.0.5
MARK="# politsei.eu (EPD, MainServer relee-politsei)"
AEG="$(date +%Y%m%d-%H%M%S)"
CADDY_VARU="$CADDYFILE.varu-politsei-$AEG"
WG_VARU="$WG_CONF.varu-politsei-$AEG"

LISATUD_LIVE=0
VANA_VOTI=""
VALMIS=0

die() {
    echo "VIGA: $*" >&2
    exit 1
}

taasta() {
    set +e
    echo "!! Viga, taastan kõik"
    [ -f "$CADDY_VARU" ] && cp -a "$CADDY_VARU" "$CADDYFILE"
    [ -f "$WG_VARU" ] && cp -a "$WG_VARU" "$WG_CONF"
    if [ "$LISATUD_LIVE" = 1 ]; then
        wg set "$WG_IF" peer "$VOTI" remove
    fi
    if [ -n "$VANA_VOTI" ]; then
        wg set "$WG_IF" peer "$VANA_VOTI" allowed-ips "$PEER_IP/32"
    fi
    if caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
        systemctl reload caddy
    fi
    echo "!! Taastatud. Varukoopiad: $CADDY_VARU ja $WG_VARU"
}

lopp() {
    local rc=$?
    trap - EXIT
    if [ "$rc" -ne 0 ] && [ "$VALMIS" != 1 ]; then
        taasta
    fi
    exit "$rc"
}

# Kas wg0.conf-is on selle skripti märgisega plokk, milles on antud võti?
meie_plokk() {
    awk -v m="$MARK" -v k="$1" '
        $0 == m { sees = 1; peer = 0; next }
        sees && /^[[:space:]]*\[/ { if (peer) { sees = 0 } else { peer = 1; next } }
        sees && /^[[:space:]]*$/ { sees = 0 }
        sees { rida = $0; gsub(/[[:space:]]/, "", rida); if (rida == "PublicKey=" k) { leitud = 1 } }
        END { exit leitud ? 0 : 1 }
    ' "$WG_CONF"
}

# Eemaldab wg0.conf-ist selle skripti märgisega ploki (vana võtmega politsei peer).
eemalda_meie_plokk() {
    awk -v m="$MARK" '
        $0 == m { sees = 1; peer = 0; next }
        sees && /^[[:space:]]*\[/ { if (peer) { sees = 0 } else { peer = 1; next } }
        sees && /^[[:space:]]*$/ { sees = 0 }
        !sees { print }
    ' "$WG_CONF" > "$WG_CONF.uus"
    cat "$WG_CONF.uus" > "$WG_CONF"
    rm -f "$WG_CONF.uus"
}

[ "$(id -u)" -eq 0 ] || die "käivita root õigustes: sudo bash $0 'VÕTI'"
[[ "$VOTI" =~ ^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$ ]] || die "WireGuardi avalik võti puudub või on vigane"
for kask in wg wg-quick caddy systemctl awk; do
    command -v "$kask" >/dev/null 2>&1 || die "käsk $kask puudub"
done
[ -f "$WG_CONF" ] || die "$WG_CONF puudub"
[ -f "$CADDYFILE" ] || die "$CADDYFILE puudub"
wg show "$WG_IF" >/dev/null 2>&1 || die "WireGuardi liides $WG_IF ei tööta"

echo "1/6 Varukoopiad"
cp -a "$CADDYFILE" "$CADDY_VARU"
cp -a "$WG_CONF" "$WG_VARU"
echo "    $CADDY_VARU"
echo "    $WG_VARU"
trap lopp EXIT

echo "2/6 WireGuardi peer $PEER_IP (jooksvalt)"
kellel_ip=""
while read -r voti ipd; do
    case " ${ipd//,/ } " in
        *" $PEER_IP/32 "*) kellel_ip="$voti" ;;
    esac
done < <(wg show "$WG_IF" allowed-ips)

if [ "$kellel_ip" = "$VOTI" ]; then
    echo "    peer on juba olemas"
else
    if wg show "$WG_IF" peers | grep -qxF -- "$VOTI"; then
        die "see võti on releel juba teise aadressiga peer, kontrolli: sudo wg show"
    fi
    if [ -n "$kellel_ip" ]; then
        meie_plokk "$kellel_ip" \
            || die "$PEER_IP on juba peeril, mida see skript pole lisanud. Kontrolli: sudo wg show"
        echo "    vana politsei peer (teine võti) asendatakse"
        wg set "$WG_IF" peer "$kellel_ip" remove
        VANA_VOTI="$kellel_ip"
    fi
    wg set "$WG_IF" peer "$VOTI" allowed-ips "$PEER_IP/32"
    LISATUD_LIVE=1
    echo "    lisatud"
fi

echo "3/6 $WG_CONF"
if tr -d ' \t' < "$WG_CONF" | grep -qxF -- "PublicKey=$VOTI"; then
    echo "    peer on failis juba olemas"
else
    if [ -n "$VANA_VOTI" ]; then
        eemalda_meie_plokk
    fi
    printf '\n%s\n[Peer]\nPublicKey = %s\nAllowedIPs = %s/32\n' "$MARK" "$VOTI" "$PEER_IP" >> "$WG_CONF"
    echo "    lisatud faili lõppu"
fi
wg-quick strip "$WG_IF" >/dev/null || die "wg0.conf ei läbi kontrolli (wg-quick strip)"

echo "4/6 Varuleht $VARU_KAUST/index.html"
install -d -m 0755 "$VARU_JUUR" "$VARU_KAUST"
cat > "$VARU_KAUST/index.html.uus" <<'VARULEHT'
<!doctype html>
<html lang="et">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="60" />
    <meta name="theme-color" content="#06090d" />
    <title>Server on hetkel kättesaamatu · EPD</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; }
      body {
        display: grid;
        place-items: center;
        padding: 24px 16px;
        background: radial-gradient(60rem 30rem at 50% -10%, rgba(61, 139, 255, 0.12), transparent 70%), #06090d;
        color: #c0ccd9;
        font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      main {
        width: 100%;
        max-width: 560px;
        padding: 32px 28px;
        border: 1px solid #1e2a38;
        border-radius: 12px;
        background: #111a24;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
      }
      .riba { display: flex; height: 4px; margin: -32px -28px 28px; border-radius: 12px 12px 0 0; overflow: hidden; }
      .riba span { flex: 1; background: #4da3ff; }
      .riba span:nth-child(even) { background: #ff3b4e; }
      .kood { margin: 0 0 4px; color: #8595a8; font: 600 13px/1.4 ui-monospace, Menlo, monospace; letter-spacing: 0.08em; text-transform: uppercase; }
      h1 { margin: 0 0 8px; color: #eaf1f8; font-size: 26px; line-height: 1.25; }
      p { margin: 0 0 12px; }
      a.nupp { display: inline-block; margin-top: 12px; padding: 10px 18px; border-radius: 8px; background: #3d8bff; color: #fff; font-weight: 600; text-decoration: none; }
      hr { margin: 24px 0 16px; border: 0; border-top: 1px solid #1e2a38; }
      small { display: block; color: #8595a8; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <div class="riba" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <p class="kood">EPD · politsei.eu</p>
      <h1>Server on hetkel kättesaamatu</h1>
      <p>Mängu server ei vasta praegu. Tõenäoliselt käib uuendus või hooldus. Proovi mõne minuti pärast uuesti, leht värskendab end ise iga minuti järel.</p>
      <p lang="en">The game server is not responding right now. Please try again in a few minutes.</p>
      <a class="nupp" href="/">Proovi uuesti</a>
      <hr />
      <small>EPD · Eesti Politsei Dispetšer on mitteametlik ja tasuta fännimäng, mis ei teeni tulu. See ei ole Politsei- ja Piirivalveameti (PPA) ametlik toode ega ametiga seotud. Hädaolukorras helista <strong>112</strong>. Kontakt: info@politsei.eu</small>
    </main>
  </body>
</html>
VARULEHT
chmod 644 "$VARU_KAUST/index.html.uus"
mv -f "$VARU_KAUST/index.html.uus" "$VARU_KAUST/index.html"
echo "    kirjutatud"

echo "5/6 Caddy plokk"
if grep -qE '^[[:space:]]*(https?://)?politsei\.eu(:[0-9]+)?([[:space:]]*,|[[:space:]]*\{|[[:space:]]*$)' "$CADDYFILE"; then
    echo "    politsei.eu plokk on juba olemas, teist ei lisata (I50)"
else
    cat >> "$CADDYFILE" <<'CADDYPLOKK'

# politsei.eu (EPD): MainServer relee-politsei 10.99.0.5 üle WireGuardi. Lisas lisa-politsei.sh.
politsei.eu {
    reverse_proxy 10.99.0.5:80 {
        transport http {
            dial_timeout 3s
        }
    }
    handle_errors {
        @api path /api/*
        handle @api {
            header Content-Type "application/json; charset=utf-8"
            header Cache-Control "no-store"
            respond "{\"error\":\"offline\",\"message\":\"Server on hetkel kättesaamatu.\"}" 503
        }
        handle {
            root * /srv/politsei/varu
            rewrite * /index.html
            header Cache-Control "no-store"
            file_server
        }
    }
}

www.politsei.eu {
    redir https://politsei.eu{uri} permanent
}
CADDYPLOKK
    echo "    lisatud faili lõppu"
fi
VALIDATE_LOG="$(mktemp)"
if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >"$VALIDATE_LOG" 2>&1; then
    tail -n 5 "$VALIDATE_LOG"
    die "caddy validate ebaõnnestus"
fi
rm -f "$VALIDATE_LOG"
echo "    caddy validate: korras"

echo "6/6 Caddy reload"
systemctl reload caddy
VALMIS=1
echo "    tehtud"

echo
echo "== Kontroll =="
sleep 3
hs="$(wg show "$WG_IF" latest-handshakes | awk -v k="$VOTI" '$1 == k { print $2 }')"
if [ -n "$hs" ] && [ "$hs" != 0 ]; then
    echo "WireGuard: viimane kätlus $(( $(date +%s) - hs )) s tagasi"
else
    echo "WireGuard: kätlust veel pole. MainServer saadab keepalive'i iga 25 s järel, kontrolli hiljem: sudo wg show"
fi
if command -v curl >/dev/null 2>&1; then
    kood="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://$PEER_IP/" || true)"
    echo "MainServer http://$PEER_IP/ vastus: ${kood:-000} (200 = korras)"
fi
if nft list chain inet filter input 2>/dev/null | grep -qE 'tcp dport \{ 80, 443 \} accept'; then
    echo "nftables: tcp 80 ja 443 on lahti, muudatust pole vaja"
else
    echo "HOIATUS: nftables input ahelas ei leitud reeglit tcp 80/443, kontrolli: sudo nft list ruleset"
fi
echo
echo "Valmis. Kui DNS (A politsei.eu ja www.politsei.eu -> 80.47.227.213) on paigas, hangib Caddy"
echo "sertifikaadi ise. Kontroll: curl -I https://politsei.eu"
