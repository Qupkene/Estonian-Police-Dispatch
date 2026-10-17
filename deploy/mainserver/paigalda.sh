#!/usr/bin/env bash
# paigalda.sh: EPD 2.0 (politsei.eu) paigaldus MainServerisse.
#
# Käivita repo kloonist:  sudo bash /opt/stack/politsei/repo/deploy/mainserver/paigalda.sh
# Uuesti käivitamine on ohutu: võtmed, webhooki saladus, kaart ja andmebaas jäävad alles.
#
# Võtmed:
#   --kaart   tõmba Eesti kaart (PMTiles) uuesti ka siis, kui see on juba olemas
#   --abi     see tekst
#
# Käik: eelkontroll, veeb võrgu vaba IP, WG aadressi kontroll, kaustad, repo, WireGuardi võtmed,
# webhooki saladus, konfid ajutisse kausta, Dockeri pildid, kontrollid (compose config,
# frankenphp validate, php -l, wg-quick strip, bash -n), kaart, varukoopia ja paigaldus,
# docker compose up, tervisekontroll, esimene ehitus, systemd unitid. Vea korral pärast
# paigalduse algust taastatakse eelmised failid ja konteinerid ise.

set -euo pipefail
umask 022
echo "== EPD 2.0 (politsei.eu) paigaldus MainServerisse =="

JUUR=/opt/stack/politsei
REPO_URL=https://github.com/Qupkene/Estonian-Police-Dispatch.git
GH_REPO=Qupkene/Estonian-Police-Dispatch
HARU=main
WG_IP=10.99.0.5
RELEE_VOTI='MWRo/jwrUB51UT+nvkAnzMh/0fkQngX7mUG/ZzKn6yM='
RELEE_IP=80.47.227.213
RELEE_PORT=51820
WG_PILT=lscr.io/linuxserver/wireguard:latest
PHP_PILT=dunglas/frankenphp:1-php8.4
NODE_PILT=node:22
KAART_BBOX=21.0,57.2,28.6,60.0
KAART_MAXZOOM=15
LUKUFAIL=/run/lock/politsei-uuenda.lock
AEG="$(date +%Y%m%d-%H%M%S)"
VOTME_RE='^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$'

SKRIPTI_KAUST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEE_SKRIPT="$(cd "$SKRIPTI_KAUST/../relee" 2>/dev/null && pwd)/lisa-politsei.sh"

KAART_UUESTI=0
for arg in "$@"; do
    case "$arg" in
        --kaart) KAART_UUESTI=1 ;;
        --abi|-h|--help) sed -n '2,16p' "$0"; exit 0 ;;
        *) echo "Tundmatu võti: $arg (vaata --abi)" >&2; exit 2 ;;
    esac
done

SAMM=0
SAMME=15
samm() {
    SAMM=$((SAMM + 1))
    echo
    echo "[$SAMM/$SAMME] $*"
}
info() { echo "    $*"; }
hoiata() { echo "    HOIATUS: $*"; }
die() {
    echo "VIGA: $*" >&2
    exit 1
}

PAIGALDUS_ALANUD=0
VALMIS=0
OLEMAS_ENNE=0
JOOKSIS_ENNE=0
VANA_WG_IMG=""
VANA_PHP_IMG=""
UUS_VOTI=0
VARU="$JUUR/varu/paigaldus-$AEG"
STAGE="$JUUR/varu/uus-$AEG"

# Failid, mida paigaldus asendab (varukoopia ja vea korral taastamine). Allikas: STAGE.
SIHID=(
    "$JUUR/compose.yml"
    "$JUUR/.env"
    "$JUUR/conf/Caddyfile"
    "$JUUR/wg/wg0.conf"
    /usr/local/sbin/politsei-uuenda.sh
    /etc/systemd/system/politsei-uuenda.service
    /etc/systemd/system/politsei-uuenda.path
    /etc/systemd/system/politsei-uuenda.timer
)
ALLIKAD=(
    "$STAGE/compose.yml"
    "$STAGE/.env"
    "$STAGE/conf/Caddyfile"
    "$STAGE/wg/wg0.conf"
    "$STAGE/politsei-uuenda.sh"
    "$STAGE/systemd/politsei-uuenda.service"
    "$STAGE/systemd/politsei-uuenda.path"
    "$STAGE/systemd/politsei-uuenda.timer"
)
OIGUSED=(0644 0644 0644 0600 0755 0644 0644 0644)
OLID=()

g() {
    git -c safe.directory="$JUUR/repo" -C "$JUUR/repo" "$@"
}

taasta() {
    local i
    set +e
    echo
    echo "!! Viga paigalduse ajal, taastan eelmise seisu"
    for i in "${!SIHID[@]}"; do
        if [ "${OLID[$i]:-0}" = 1 ]; then
            cp -a --remove-destination "$VARU/$i" "${SIHID[$i]}"
        else
            rm -f "${SIHID[$i]}"
        fi
    done
    systemctl daemon-reload
    if [ "$OLEMAS_ENNE" = 1 ] && [ -f "$JUUR/compose.yml" ]; then
        if [ "$JOOKSIS_ENNE" = 1 ]; then
            # Uued pildid võisid olla vea põhjus: vanad sildid tagasi enne taaskäivitust.
            if [ -n "$VANA_WG_IMG" ]; then docker tag "$VANA_WG_IMG" "$WG_PILT"; fi
            if [ -n "$VANA_PHP_IMG" ]; then docker tag "$VANA_PHP_IMG" "$PHP_PILT"; fi
            docker compose -f "$JUUR/compose.yml" up -d --force-recreate
        else
            docker compose -f "$JUUR/compose.yml" stop
        fi
    else
        docker rm -f politsei relee-politsei >/dev/null 2>&1
    fi
    echo "!! Taastatud. Varukoopia: $VARU"
    echo "!! Võtmed, saladus, kaart ja andmed jäid alles. Paranda viga ja käivita paigaldus uuesti."
}

lopp() {
    local rc=$?
    trap - EXIT
    if [ "$rc" -ne 0 ] && [ "$PAIGALDUS_ALANUD" = 1 ] && [ "$VALMIS" != 1 ]; then
        taasta
    fi
    exit "$rc"
}
trap lopp EXIT

ip2int() {
    local a b c d
    IFS=. read -r a b c d <<<"$1"
    echo $(( (a << 24) | (b << 16) | (c << 8) | d ))
}

int2ip() {
    local n="$1"
    echo "$(( (n >> 24) & 255 )).$(( (n >> 16) & 255 )).$(( (n >> 8) & 255 )).$(( n & 255 ))"
}

konteineri_ip() {
    docker inspect -f '{{with index .NetworkSettings.Networks "veeb"}}{{.IPAddress}}{{end}}' \
        relee-politsei 2>/dev/null || true
}

# GET konteinerist: hostist IP peale, kui hosti tulemüür ei luba, siis konteineri seest.
http_get() {
    local tee="$1" ip rc=0
    ip="$(konteineri_ip)"
    if [ -n "$ip" ]; then
        if curl -fsS -m 5 "http://$ip$tee" 2>/dev/null; then
            return 0
        else
            rc=$?
        fi
        if [ "$rc" != 7 ] && [ "$rc" != 28 ]; then
            return "$rc"
        fi
    fi
    docker exec politsei curl -fsS -m 5 "http://127.0.0.1$tee" 2>/dev/null
}

wg_kask() {
    # wg hostist, kui olemas, muidu ajutises linuxserver/wireguard konteineris.
    if command -v wg >/dev/null 2>&1; then
        wg "$@"
    else
        docker run --rm -i --network none --entrypoint wg "$WG_PILT" "$@"
    fi
}

hangi_pmtiles() {
    local bin="$JUUR/bin/pmtiles" tmp url leitud
    if [ -x "$bin" ] && "$bin" version >/dev/null 2>&1; then
        return 0
    fi
    if [ "$(uname -m)" != x86_64 ]; then
        hoiata "pmtiles CLI tõmmatakse ainult x86_64 jaoks, see masin on $(uname -m)"
        return 1
    fi
    url="$(curl -fsSL -m 30 -H 'Accept: application/vnd.github+json' \
        https://api.github.com/repos/protomaps/go-pmtiles/releases/latest \
        | jq -r '[.assets[] | select(.name | test("_Linux_x86_64\\.tar\\.gz$")) | .browser_download_url] | first // empty' \
        || true)"
    if [ -z "$url" ]; then
        hoiata "go-pmtiles viimast versiooni ei leitud (GitHubi API)"
        return 1
    fi
    info "pmtiles CLI: $url"
    tmp="$(mktemp -d)"
    if ! curl -fsSL -m 300 -o "$tmp/pmtiles.tar.gz" "$url" || ! tar -xzf "$tmp/pmtiles.tar.gz" -C "$tmp"; then
        rm -rf "$tmp"
        hoiata "pmtiles CLI allalaadimine ebaõnnestus"
        return 1
    fi
    leitud="$(find "$tmp" -type f -name pmtiles -print -quit)"
    if [ -z "$leitud" ]; then
        rm -rf "$tmp"
        hoiata "pmtiles binaari arhiivist ei leitud"
        return 1
    fi
    install -m 0755 "$leitud" "$bin"
    rm -rf "$tmp"
    "$bin" version >/dev/null 2>&1 || { hoiata "pmtiles ei käivitu"; return 1; }
}

viimane_protomaps() {
    local key d kuup
    key="$(curl -fsSL -m 30 https://build-metadata.protomaps.dev/builds.json 2>/dev/null \
        | jq -r '[.. | strings | select(test("^[0-9]{8}\\.pmtiles$"))] | sort | last // empty' 2>/dev/null || true)"
    if [ -n "$key" ]; then
        echo "$key"
        return 0
    fi
    # Varuvariant: proovi viimase 10 päeva faile otse.
    for d in 0 1 2 3 4 5 6 7 8 9 10; do
        kuup="$(date -d "-$d day" +%Y%m%d)"
        if curl -fsSI -m 15 "https://build.protomaps.com/$kuup.pmtiles" >/dev/null 2>&1; then
            echo "$kuup.pmtiles"
            return 0
        fi
    done
    return 1
}

# Kaart pole kohustuslik: viga annab hoiatuse, olemasolev fail jääb alles.
kaart() {
    local siht="$JUUR/tiles/estonia.pmtiles" uus="$JUUR/tiles/estonia.pmtiles.uus"
    local bin="$JUUR/bin/pmtiles" key suurus vaba
    if [ -s "$siht" ] && [ "$KAART_UUESTI" != 1 ]; then
        if [ -x "$bin" ] && "$bin" show "$siht" >/dev/null 2>&1; then
            info "kaart on olemas ($(du -h "$siht" | cut -f1)), jääb alles (uuesti: --kaart)"
            return 0
        fi
        if [ ! -x "$bin" ]; then
            info "kaart on olemas ($(du -h "$siht" | cut -f1)), jääb alles"
            return 0
        fi
        hoiata "olemasolev kaart ei läbi kontrolli (pmtiles show), tõmban uue"
    fi
    vaba="$(df -Pm "$JUUR/tiles" | awk 'NR == 2 { print $4 }')"
    if [ "${vaba:-0}" -lt 3000 ]; then
        hoiata "kettal on vaba alla 3 GB ($vaba MB), kaart jääb tõmbamata"
        return 1
    fi
    hangi_pmtiles || return 1
    if ! key="$(viimane_protomaps)"; then
        hoiata "Protomaps viimast päevast versiooni ei leitud"
        return 1
    fi
    info "allikas: https://build.protomaps.com/$key"
    info "ala $KAART_BBOX, suum kuni $KAART_MAXZOOM (võtab mõne minuti)"
    rm -f "$uus"
    if ! "$bin" extract "https://build.protomaps.com/$key" "$uus" \
            --bbox="$KAART_BBOX" --maxzoom="$KAART_MAXZOOM" --download-threads=4; then
        rm -f "$uus"
        hoiata "kaardi väljavõte ebaõnnestus"
        return 1
    fi
    suurus="$(stat -c %s "$uus" 2>/dev/null || echo 0)"
    if [ "$suurus" -lt 5000000 ]; then
        rm -f "$uus"
        hoiata "kaardi fail on kahtlaselt väike ($suurus baiti)"
        return 1
    fi
    if ! "$bin" show "$uus" >/dev/null 2>&1; then
        rm -f "$uus"
        hoiata "uus kaart ei läbi kontrolli (pmtiles show)"
        return 1
    fi
    chmod 0644 "$uus"
    mv -f "$uus" "$siht"
    info "kaart valmis: $(du -h "$siht" | cut -f1)"
}

# ================================================================ 1. eelkontroll
samm "Eelkontroll"
[ "$(id -u)" -eq 0 ] || die "käivita root õigustes: sudo bash $0"
if [ -r /etc/os-release ] && grep -qE '^ID=("?)debian("?)$' /etc/os-release; then
    info "Debian: $(sed -n 's/^PRETTY_NAME="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' /etc/os-release)"
else
    die "see paigaldus on tehtud Debianile (MainServer, Debian 13)"
fi
for f in Caddyfile compose.yml politsei-uuenda.sh systemd/politsei-uuenda.service \
         systemd/politsei-uuenda.path systemd/politsei-uuenda.timer; do
    [ -f "$SKRIPTI_KAUST/$f" ] || die "repo fail puudub: $SKRIPTI_KAUST/$f"
done
[ -f "$RELEE_SKRIPT" ] || die "repo fail puudub: deploy/relee/lisa-politsei.sh"

puudu=()
command -v git >/dev/null 2>&1 || puudu+=(git)
command -v curl >/dev/null 2>&1 || puudu+=(curl)
command -v jq >/dev/null 2>&1 || puudu+=(jq)
command -v rsync >/dev/null 2>&1 || puudu+=(rsync)
command -v openssl >/dev/null 2>&1 || puudu+=(openssl)
command -v flock >/dev/null 2>&1 || puudu+=(util-linux)
[ -f /etc/ssl/certs/ca-certificates.crt ] || puudu+=(ca-certificates)
if [ "${#puudu[@]}" -gt 0 ]; then
    info "paigaldan paketid: ${puudu[*]}"
    apt-get update -q
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${puudu[@]}"
else
    info "paketid olemas (git, curl, jq, rsync, openssl, flock)"
fi
command -v docker >/dev/null 2>&1 || die "docker puudub"
docker info >/dev/null 2>&1 || die "Dockeri teenus ei vasta (systemctl status docker)"
docker compose version >/dev/null 2>&1 || die "docker compose puudub"
info "$(docker --version), $(docker compose version --short 2>/dev/null || echo compose)"
vaba_mb="$(df -Pm /opt | awk 'NR == 2 { print $4 }')"
if [ "${vaba_mb:-0}" -lt 4000 ]; then
    hoiata "/opt all on vaba ainult $vaba_mb MB (ehitus ja kaart vajavad umbes 3 GB)"
fi

# ================================================================ 2. veeb võrk ja IP
samm "Dockeri võrk veeb ja konteineri aadress"
docker network inspect veeb >/dev/null 2>&1 || die "Dockeri võrku veeb pole (mc-veeb kasutab seda, vaata handoff 9.6)"
alamvork="$(docker network inspect veeb -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' | tr ' ' '\n' \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$' | head -n 1 || true)"
lyys="$(docker network inspect veeb -f '{{range .IPAM.Config}}{{.Gateway}} {{end}}' | tr ' ' '\n' \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 || true)"
[ -n "$alamvork" ] || die "veeb võrgu IPv4 alamvõrku ei leitud"
read -r -a kasutusel <<<"$(docker network inspect veeb -f '{{range .Containers}}{{.Name}}={{.IPv4Address}} {{end}}')"
prefiks="${alamvork#*/}"
[ "$prefiks" -ge 16 ] && [ "$prefiks" -le 28 ] || die "veeb võrgu prefiks /$prefiks on ootamatu"
suurus=$(( 1 << (32 - prefiks) ))
baas=$(( $(ip2int "${alamvork%/*}") & ~(suurus - 1) & 0xFFFFFFFF ))

ip_omanik() {
    local kirje
    for kirje in "${kasutusel[@]}"; do
        case "$kirje" in
            *"=$1/"*) echo "${kirje%%=*}"; return 0 ;;
        esac
    done
    return 0
}

POLITSEI_IP=""
vana_ip=""
if [ -f "$JUUR/.env" ]; then
    vana_ip="$(sed -n 's/^POLITSEI_IP=\([0-9.]*\)$/\1/p' "$JUUR/.env" | head -n 1)"
fi
if [ -n "$vana_ip" ]; then
    n="$(ip2int "$vana_ip")"
    omanik="$(ip_omanik "$vana_ip")"
    if [ "$n" -gt "$baas" ] && [ "$n" -lt $(( baas + suurus - 1 )) ] && [ "$vana_ip" != "$lyys" ] \
        && { [ -z "$omanik" ] || [ "$omanik" = relee-politsei ]; }; then
        POLITSEI_IP="$vana_ip"
        info "jääb varasem aadress $POLITSEI_IP"
    else
        hoiata "varasem aadress $vana_ip pole enam sobiv (omanik: ${omanik:-alamvõrgust väljas}), valin uue"
    fi
fi
if [ -z "$POLITSEI_IP" ]; then
    algus=50
    [ "$suurus" -le 64 ] && algus=2
    for (( i = algus; i < suurus - 1; i++ )); do
        kandidaat="$(int2ip $(( baas + i )))"
        [ "$kandidaat" = "$lyys" ] && continue
        if [ -z "$(ip_omanik "$kandidaat")" ]; then
            POLITSEI_IP="$kandidaat"
            break
        fi
    done
    [ -n "$POLITSEI_IP" ] || die "veeb võrgus ($alamvork) pole vaba aadressi"
    info "valitud vaba aadress $POLITSEI_IP (võrk $alamvork)"
fi

# ================================================================ 3. WG aadress
samm "WireGuardi aadress $WG_IP"
konflikt=""
while IFS= read -r fail; do
    case "$fail" in
        "$JUUR"/*) ;;
        *) konflikt="$konflikt $fail" ;;
    esac
done < <(find /opt/stack -maxdepth 5 \( -path /opt/stack/frigate/media -o -name backups -o -name node_modules \) -prune \
    -o -type f -name '*.conf' -print0 2>/dev/null \
    | xargs -0 -r grep -lsE "^[[:space:]]*Address[[:space:]]*=[[:space:]]*${WG_IP//./\\.}(/|[[:space:]]|,|$)" 2>/dev/null || true)
while IFS=' ' read -r nimi pilt; do
    [ -n "$nimi" ] || continue
    [ "$nimi" = relee-politsei ] && continue
    case "$pilt" in
        *wireguard*)
            if docker exec "$nimi" ip -4 -o addr show 2>/dev/null | grep -qF " $WG_IP/"; then
                konflikt="$konflikt konteiner:$nimi"
            fi
            ;;
    esac
done < <(docker ps --format '{{.Names}} {{.Image}}')
if ip -4 -o addr show 2>/dev/null | grep -qF " $WG_IP/"; then
    konflikt="$konflikt host"
fi
[ -z "$konflikt" ] || die "$WG_IP on juba kasutusel:$konflikt"
info "vaba"

if docker inspect relee-politsei >/dev/null 2>&1; then
    OLEMAS_ENNE=1
fi
if [ "$(docker inspect -f '{{.State.Running}}' politsei 2>/dev/null || echo false)" = true ]; then
    JOOKSIS_ENNE=1
fi
# Töötavate konteinerite pildid enne docker pulli, et taastamine saaks neile tagasi minna.
VANA_WG_IMG="$(docker inspect -f '{{.Image}}' relee-politsei 2>/dev/null || true)"
VANA_PHP_IMG="$(docker inspect -f '{{.Image}}' politsei 2>/dev/null || true)"

# Uuendusskript ei tohi paigalduse ajal joosta.
mkdir -p /run/lock
exec 9>"$LUKUFAIL"
flock -w 900 9 || die "politsei-uuenda.sh jookseb juba üle 15 minuti"

# ================================================================ 4. kaustad
samm "Kaustad $JUUR"
install -d -m 0755 "$JUUR" "$JUUR/www" "$JUUR/www.prev" "$JUUR/tiles" "$JUUR/conf" \
    "$JUUR/bin" "$JUUR/ehitus"
install -d -m 0750 "$JUUR/data" "$JUUR/data/control" "$JUUR/olek" "$JUUR/varu"
install -d -m 0700 "$JUUR/wg"
[ -d "$JUUR/repo" ] || install -d -m 0755 "$JUUR/repo"
info "repo www www.prev data data/control tiles wg conf olek ehitus bin varu"

# ================================================================ 5. repo
samm "Repo $REPO_URL ($HARU)"
if [ -d "$JUUR/repo/.git" ]; then
    url="$(g config --get remote.origin.url 2>/dev/null || true)"
    url_v="$(printf '%s' "$url" | tr '[:upper:]' '[:lower:]')"
    case "$url_v" in
        *github.com/qupkene/estonian-police-dispatch|*github.com/qupkene/estonian-police-dispatch.git) ;;
        *) die "$JUUR/repo on teise repo kloon ($url)" ;;
    esac
    g fetch -q origin "+refs/heads/$HARU:refs/remotes/origin/$HARU"
    info "olemas, fetch tehtud (praegu $(g rev-parse --short HEAD), origin/$HARU $(g rev-parse --short "origin/$HARU"))"
elif [ -z "$(ls -A "$JUUR/repo")" ]; then
    git clone -q --branch "$HARU" "$REPO_URL" "$JUUR/repo"
    info "kloonitud ($(g rev-parse --short HEAD))"
else
    die "$JUUR/repo pole tühi ega git repo"
fi

# ================================================================ 6. Dockeri pildid
samm "Dockeri pildid"
for pilt in "$WG_PILT" "$PHP_PILT" "$NODE_PILT"; do
    if docker pull -q "$pilt" >/dev/null; then
        info "$pilt"
    elif docker image inspect "$pilt" >/dev/null 2>&1; then
        hoiata "$pilt tõmbamine ebaõnnestus, kasutan olemasolevat"
    else
        die "$pilt tõmbamine ebaõnnestus"
    fi
done

# ================================================================ 7. WireGuardi võtmed
samm "WireGuardi võtmepaar"
VOTMEFAIL="$JUUR/wg/politsei.key"
if [ -s "$VOTMEFAIL" ] && [[ "$(tr -d '[:space:]' < "$VOTMEFAIL")" =~ $VOTME_RE ]]; then
    info "olemas, jääb alles"
else
    priv="$(wg_kask genkey | tr -d '[:space:]')"
    [[ "$priv" =~ $VOTME_RE ]] || die "wg genkey ebaõnnestus"
    ( umask 077; printf '%s\n' "$priv" > "$VOTMEFAIL" )
    unset priv
    UUS_VOTI=1
    info "uus võti loodud"
fi
chmod 0600 "$VOTMEFAIL"
AVALIK="$(tr -d '[:space:]' < "$VOTMEFAIL" | wg_kask pubkey | tr -d '[:space:]')"
[[ "$AVALIK" =~ $VOTME_RE ]] || die "wg pubkey ebaõnnestus"
printf '%s\n' "$AVALIK" > "$JUUR/wg/politsei.pub"
chmod 0644 "$JUUR/wg/politsei.pub"
info "avalik võti: $AVALIK"

# ================================================================ 8. webhooki saladus
samm "Webhooki saladus $JUUR/data/deploy-secret"
SALADUS_FAIL="$JUUR/data/deploy-secret"
if [ -s "$SALADUS_FAIL" ] && [ "$(tr -d '[:space:]' < "$SALADUS_FAIL" | wc -c)" -ge 32 ]; then
    info "olemas, jääb alles"
else
    ( umask 077; openssl rand -hex 32 > "$SALADUS_FAIL" )
    info "uus saladus loodud"
fi
chown root:root "$SALADUS_FAIL"
chmod 0600 "$SALADUS_FAIL"
SALADUS="$(tr -d '[:space:]' < "$SALADUS_FAIL")"

# ================================================================ 9. konfid ja kontrollid
samm "Konfid ajutisse kausta ja kontrollid"
install -d -m 0700 "$STAGE" "$STAGE/conf" "$STAGE/wg" "$STAGE/systemd"
cp "$SKRIPTI_KAUST/compose.yml" "$STAGE/compose.yml"
printf 'POLITSEI_IP=%s\n' "$POLITSEI_IP" > "$STAGE/.env"
cp "$SKRIPTI_KAUST/Caddyfile" "$STAGE/conf/Caddyfile"
cp "$SKRIPTI_KAUST/politsei-uuenda.sh" "$STAGE/politsei-uuenda.sh"
cp "$SKRIPTI_KAUST/systemd/politsei-uuenda.service" "$SKRIPTI_KAUST/systemd/politsei-uuenda.path" \
    "$SKRIPTI_KAUST/systemd/politsei-uuenda.timer" "$STAGE/systemd/"
cat > "$STAGE/wg/wg0.conf" <<EOF
# EPD politsei.eu: relee-politsei WireGuard (kirjutas paigalda.sh)
[Interface]
Address = $WG_IP/32
PostUp = wg set %i private-key /config/wg_confs/politsei.key

[Peer]
# relee VPS
PublicKey = $RELEE_VOTI
Endpoint = $RELEE_IP:$RELEE_PORT
AllowedIPs = 10.99.0.1/32
PersistentKeepalive = 25
EOF

bash -n "$STAGE/politsei-uuenda.sh" || die "politsei-uuenda.sh: bash -n"
info "bash -n politsei-uuenda.sh: korras"
docker compose -f "$STAGE/compose.yml" --env-file "$STAGE/.env" config -q || die "docker compose config"
info "docker compose config: korras"
if ! docker run --rm --network none -v "$STAGE/conf:/etc/epd:ro" \
        -e XDG_CONFIG_HOME=/tmp/c -e XDG_DATA_HOME=/tmp/d "$PHP_PILT" \
        frankenphp validate --config /etc/epd/Caddyfile --adapter caddyfile >"$STAGE/validate.log" 2>&1; then
    tail -n 5 "$STAGE/validate.log"
    die "frankenphp validate (Caddyfile)"
fi
info "frankenphp validate Caddyfile: korras"
if [ -d "$JUUR/repo/server" ]; then
    docker run --rm --network none -v "$JUUR/repo/server:/s:ro" "$PHP_PILT" \
        sh -c 'find /s -name "*.php" -exec sh -c '\''for f; do out=$(php -l "$f" 2>&1) || { echo "$out"; exit 1; }; done'\'' sh {} +' \
        || die "php -l leidis vea (repo/server)"
    info "php -l server/*.php: korras"
else
    hoiata "repo/server puudub, API tuleb hiljem koos koodiga"
fi
if docker run --rm --network none -v "$STAGE/wg:/w:ro" --entrypoint wg-quick "$WG_PILT" \
        strip /w/wg0.conf >/dev/null 2>"$STAGE/wg.log"; then
    info "wg-quick strip wg0.conf: korras"
else
    hoiata "wg-quick strip ei õnnestunud: $(tail -n 1 "$STAGE/wg.log")"
fi
if command -v systemd-analyze >/dev/null 2>&1; then
    systemd-analyze verify "$STAGE/systemd/politsei-uuenda.timer" "$STAGE/systemd/politsei-uuenda.path" \
        >/dev/null 2>"$STAGE/systemd.log" || hoiata "systemd-analyze: $(head -n 1 "$STAGE/systemd.log")"
fi

# ================================================================ 10. kaart
samm "Eesti kaart (Protomaps PMTiles)"
kaart || hoiata "kaart jäi tegemata, mäng töötab ka ilma. Hiljem: sudo bash $0 --kaart"

# ================================================================ 11. paigaldus
samm "Varukoopia ja paigaldus"
install -d -m 0700 "$VARU"
MUUTUS_WG=0
MUUTUS_CADDY=0
for i in "${!SIHID[@]}"; do
    if [ -e "${SIHID[$i]}" ]; then
        cp -a "${SIHID[$i]}" "$VARU/$i"
        OLID[i]=1
    else
        OLID[i]=0
    fi
done
cmp -s "$STAGE/wg/wg0.conf" "$JUUR/wg/wg0.conf" || MUUTUS_WG=1
cmp -s "$STAGE/conf/Caddyfile" "$JUUR/conf/Caddyfile" || MUUTUS_CADDY=1
# Uus privaatvõti jõuab külgkonteinerisse ainult PostUp kaudu, seega konteiner tuleb uuesti luua.
if [ "$UUS_VOTI" = 1 ]; then MUUTUS_WG=1; fi
PAIGALDUS_ALANUD=1
for i in "${!SIHID[@]}"; do
    install -m "${OIGUSED[$i]}" "${ALLIKAD[$i]}" "${SIHID[$i]}"
done
info "varukoopia: $VARU"
info "paigaldatud: compose.yml .env conf/Caddyfile wg/wg0.conf politsei-uuenda.sh systemd unitid"
if [ ! -e "$JUUR/www/index.html" ]; then
    cat > "$JUUR/www/index.html" <<'EOF'
<!doctype html>
<html lang="et"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="refresh" content="30" /><title>EPD paigaldus käib</title></head>
<body style="font-family: system-ui, sans-serif; background: #06090d; color: #c0ccd9; padding: 2rem;">
<div id="root"><h1 style="color: #eaf1f8;">EPD paigaldus käib</h1><p>Mäng ehitatakse, leht värskendab end ise.</p></div>
</body></html>
EOF
    info "ajutine avaleht www/index.html (asendub esimese ehitusega)"
fi
systemctl daemon-reload

# ================================================================ 12. konteinerid
samm "Konteinerid relee-politsei ja politsei"
if [ "$MUUTUS_WG" = 1 ] || [ "$MUUTUS_CADDY" = 1 ]; then
    docker compose -f "$JUUR/compose.yml" up -d --force-recreate
else
    docker compose -f "$JUUR/compose.yml" up -d
fi
ok=0
for _ in $(seq 1 30); do
    if http_get / >/dev/null; then
        ok=1
        break
    fi
    sleep 2
done
[ "$ok" = 1 ] || die "politsei konteiner ei vasta aadressil http://$POLITSEI_IP/ (docker logs politsei)"
info "http://$POLITSEI_IP/ vastab"
if [ -f "$JUUR/repo/server/api/index.php" ]; then
    api="$(http_get /api/health || true)"
    [ "$(printf '%s' "$api" | jq -r '.ok // false' 2>/dev/null || true)" = true ] \
        || die "/api/health ei anna ok:true (docker logs politsei): ${api:0:200}"
    info "/api/health: $api"
fi
# linuxserver/wireguard tõstab wg0 alles oma init-ahela lõpus, seega oota kuni 60 s.
ok=0
for _ in $(seq 1 30); do
    if docker exec relee-politsei wg show wg0 >/dev/null 2>&1; then
        ok=1
        break
    fi
    sleep 2
done
[ "$ok" = 1 ] || die "relee-politsei konteineris pole wg0 liidest (docker logs relee-politsei)"
info "WireGuard wg0 töötab konteineris (kätlus tekib pärast relee plokki)"

# ================================================================ 13. esimene ehitus
samm "Esimene ehitus (politsei-uuenda.sh)"
flock -u 9
if [ -s "$JUUR/www/version.txt" ]; then
    info "sait on juba ehitatud ($(cut -c1-7 "$JUUR/www/version.txt")), uuendused tulevad automaatselt"
elif /usr/local/sbin/politsei-uuenda.sh --joud; then
    info "ehitus valmis"
else
    hoiata "esimene ehitus ebaõnnestus, sait näitab ajutist lehte. Vaata logi ülal, siis: sudo politsei-uuenda.sh --joud"
fi

# ================================================================ 14. systemd
samm "systemd: politsei-uuenda.path ja politsei-uuenda.timer"
systemctl enable --now politsei-uuenda.path politsei-uuenda.timer >/dev/null 2>&1 \
    || die "systemd unitite käivitamine ebaõnnestus"
info "$(systemctl is-active politsei-uuenda.path) / $(systemctl is-active politsei-uuenda.timer)"
VALMIS=1

# ================================================================ 15. juhised
samm "Valmis. Järgmised sammud"
JUHISED="$JUUR/juhised.txt"
{
    echo "=================================================================="
    echo "(a) RELEE PuTTY aken: kaks plokki"
    echo "=================================================================="
    echo
    echo "Plokk 1 (üksinda, küsib sudo parooli):"
    echo
    echo "sudo -v"
    echo
    echo "Plokk 2 (kleebi tervikuna):"
    echo
    echo "cat > ~/lisa-politsei.sh <<'POLITSEI_SKRIPT_LOPP'"
    cat "$RELEE_SKRIPT"
    echo "POLITSEI_SKRIPT_LOPP"
    echo "sudo bash ~/lisa-politsei.sh '$AVALIK'"
    echo
    echo "=================================================================="
    echo "(b) GitHubi veebiliides: webhook"
    echo "=================================================================="
    echo
    echo "Ava: https://github.com/$GH_REPO/settings/hooks/new"
    echo "  Payload URL:       https://politsei.eu/api/deploy-hook"
    echo "  Content type:      application/json"
    echo "  Secret:            $SALADUS"
    echo "  SSL verification:  Enable SSL verification"
    echo "  Which events:      Let me select individual events, ainult \"Workflow runs\" (Pushes maha)"
    echo "  Active:            linnuke peal, siis Add webhook"
    echo "Saladus uuesti: sudo cat $SALADUS_FAIL"
    echo "Lisaks: Settings > Pages > Custom domain tühjaks (politsei.eu ei ole enam GitHub Pagesis)."
    echo
    echo "=================================================================="
    echo "(c) Domeeni registripidaja: DNS kirjed (politsei.eu)"
    echo "=================================================================="
    echo
    echo "  A   politsei.eu       $RELEE_IP   (DNS only, ilma proksita)"
    echo "  A   www.politsei.eu   $RELEE_IP   (DNS only, ilma proksita)"
    echo "Kustuta vanad GitHub Pagesi kirjed: A 185.199.108.153, 185.199.109.153, 185.199.110.153,"
    echo "185.199.111.153, kõik AAAA 2606:50c0:800x::153 ja CNAME www > qupkene.github.io."
    echo "TXT _github-pages-challenge-qupkene võib alles jääda."
    echo
    echo "=================================================================="
    echo "Kontroll pärast DNS-i (MainServer PuTTY):"
    echo "  curl -sI https://politsei.eu | head -n 5"
    echo "  curl -s https://politsei.eu/api/health"
    echo "  cat $JUUR/www/version.txt"
    echo "Logi: sudo journalctl -u politsei-uuenda -n 50 --no-pager"
    echo "Need juhised uuesti: sudo cat $JUHISED"
    echo "=================================================================="
} > "$JUHISED.uus"
chmod 0600 "$JUHISED.uus"
mv -f "$JUHISED.uus" "$JUHISED"
rm -rf -- "${STAGE:?}"
cat "$JUHISED"
