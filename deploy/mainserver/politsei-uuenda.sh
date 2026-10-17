#!/usr/bin/env bash
# politsei-uuenda.sh: EPD 2.0 (politsei.eu) uuendus GitHubist MainServeris.
#
# Paigaldab deploy/mainserver/paigalda.sh kohta /usr/local/sbin/politsei-uuenda.sh.
# Käivitavad politsei-uuenda.path (webhooki pilet), politsei-uuenda.timer (iga 10 min)
# ja käsitsi: sudo politsei-uuenda.sh
#
# Võtmed:
#   --joud   ehita origin/main tipp ka siis, kui see on juba paigas, kui CI pole
#            roheline või kui see commit on varem ebaõnnestunud
#   --abi    see tekst
#
# Käik: pilet ära, lukk, võrguruumi kontroll, origin/main tipp (git ls-remote), võrdlus
# failiga www/version.txt, GitHubi check-runs, ehitus node:22 konteineris, dist ja php -l
# kontroll, www.prev koopia, rsync www/ sisse, repo checkout, tervisekontroll.
# Vea korral taastatakse www ja repo eelmisele versioonile. Logi: journalctl -t politsei-uuenda

set -euo pipefail
umask 022

echo "politsei-uuenda: algus $(date '+%F %T')"

# POLITSEI_* muutujad on ainult testimiseks, vaikimisi on MainServeri teed.
JUUR="${POLITSEI_JUUR:-/opt/stack/politsei}"
REPO="$JUUR/repo"
WWW="$JUUR/www"
WWW_PREV="$JUUR/www.prev"
CONF="$JUUR/conf"
KOMPOSE="$JUUR/compose.yml"
PILET="$JUUR/data/control/uuenda.json"
OLEK="$JUUR/olek"
EHITUS="$JUUR/ehitus"
LUKUFAIL="${POLITSEI_LUKK:-/run/lock/politsei-uuenda.lock}"
PIDU_ENV="${POLITSEI_PIDU_ENV:-/etc/pidu.env}"
GH_REPO=Qupkene/Estonian-Police-Dispatch
GH_URL="${POLITSEI_GIT_URL:-https://github.com/$GH_REPO.git}"
HARU=main
NODE_PILT=node:22
PHP_PILT=dunglas/frankenphp:1-php8.4
SIDECAR=relee-politsei
VEEB=politsei

JOUD=0
VAHETUS=0
KASITLETUD=0
SIHT_SHA=""
EELMINE_SHA=""
SERVER_INODE=""
CADDY_UUS=0
CADDY_VAHETATUD=0
TG_TOKEN=""
TG_CHAT=""

for arg in "$@"; do
    case "$arg" in
        --joud) JOUD=1 ;;
        --abi|-h|--help) sed -n '2,18p' "$0"; exit 0 ;;
        *) echo "Tundmatu võti: $arg (vaata --abi)" >&2; exit 2 ;;
    esac
done

if [ "$(id -u)" -ne 0 ]; then
    echo "Käivita root õigustes: sudo politsei-uuenda.sh" >&2
    exit 1
fi

# ---------------------------------------------------------------- abifunktsioonid

logi() {
    printf '%s\n' "$*"
    # systemd teenusena läheb väljund niikuinii journali, käsitsi saadame ise.
    if [ -z "${INVOCATION_ID:-}" ] && command -v logger >/dev/null 2>&1; then
        logger -t politsei-uuenda -- "$*" || true
    fi
}

g() {
    git -c safe.directory="$REPO" -C "$REPO" "$@"
}

lyhike() {
    printf '%s' "${1:0:7}"
}

# Telegram: /etc/pidu.env muutujate nimed pole teada. Loeme faili ise (ei source'i),
# otsime TOKEN-laadse ja CHAT-laadse muutuja. Saladusi ei prindita kunagi.
loe_telegram() {
    local fail="$PIDU_ENV" rida nimi vaartus suur
    local re_rida='^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$'
    local re_dq='^"(.*)"$'
    local re_sq="^'(.*)'\$"
    local re_token='^[0-9]{5,}:[A-Za-z0-9_-]{20,}$'
    local re_chat='^(-?[0-9]{3,}|@[A-Za-z0-9_]{4,})$'
    local token_nimeta=""
    [ -f "$fail" ] && [ -r "$fail" ] || return 0
    while IFS= read -r rida || [ -n "$rida" ]; do
        rida="${rida%$'\r'}"
        [[ "$rida" =~ $re_rida ]] || continue
        nimi="${BASH_REMATCH[2]}"
        vaartus="${BASH_REMATCH[3]}"
        vaartus="${vaartus%"${vaartus##*[![:space:]]}"}"
        if [[ "$vaartus" =~ $re_dq ]] || [[ "$vaartus" =~ $re_sq ]]; then
            vaartus="${BASH_REMATCH[1]}"
        fi
        suur="${nimi^^}"
        if [ -z "$TG_TOKEN" ] && [[ "$suur" == *TOKEN* ]] && [[ "$vaartus" =~ $re_token ]]; then
            TG_TOKEN="$vaartus"
        elif [ -z "$token_nimeta" ] && [[ "$vaartus" =~ $re_token ]]; then
            token_nimeta="$vaartus"
        fi
        if [ -z "$TG_CHAT" ] && [[ "$suur" == *CHAT* ]] && [[ "$vaartus" =~ $re_chat ]]; then
            TG_CHAT="$vaartus"
        fi
    done < "$fail"
    if [ -z "$TG_TOKEN" ]; then
        TG_TOKEN="$token_nimeta"
    fi
    if [ -z "$TG_TOKEN" ] || [ -z "$TG_CHAT" ]; then
        TG_TOKEN=""
        TG_CHAT=""
        logi "Telegram: $fail failist ei leitud tokenit ja chat id-d, teavitus jääb ära"
    fi
}

teata() {
    [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ] || return 0
    # Token läheb curlile stdin-i kaudu (mitte käsureale, ps ei näe seda).
    if ! printf 'url = "https://api.telegram.org/bot%s/sendMessage"\ndata-urlencode = "chat_id=%s"\n' \
            "$TG_TOKEN" "$TG_CHAT" \
        | curl -sS -m 15 -o /dev/null -K - \
            --data-urlencode "text=$1" -d disable_web_page_preview=true 2>/dev/null; then
        logi "Telegram: saatmine ebaõnnestus"
    fi
}

margi_vigaseks() {
    local sha="$1" fail="$OLEK/vigased.txt"
    [ -n "$sha" ] || return 0
    mkdir -p "$OLEK"
    if ! grep -qx "$sha" "$fail" 2>/dev/null; then
        printf '%s\n' "$sha" >> "$fail"
        tail -n 50 "$fail" > "$fail.uus" && mv -f "$fail.uus" "$fail"
    fi
}

kirjuta_olek() {
    mkdir -p "$OLEK"
    printf '%s %s\n' "$(date '+%F %T')" "$*" > "$OLEK/viimane.txt"
}

konteineri_ip() {
    docker inspect -f '{{with index .NetworkSettings.Networks "veeb"}}{{.IPAddress}}{{end}}' \
        "$SIDECAR" 2>/dev/null || true
}

# GET konteinerist. Esmalt hostist konteineri IP peale, kui hosti tulemüür seda ei luba,
# siis konteineri seest (frankenphp pildis on curl olemas).
HTTP_VIIS="host"
http_get() {
    local tee="$1" ip rc=0
    ip="$(konteineri_ip)"
    if [ "$HTTP_VIIS" = host ] && [ -n "$ip" ]; then
        if curl -fsS -m 8 "http://$ip$tee" 2>/dev/null; then
            return 0
        else
            rc=$?
        fi
        # 7 = ühendus keelatud, 28 = aegumine. Muu (nt 22 = HTTP viga) on päris vastus.
        if [ "$rc" != 7 ] && [ "$rc" != 28 ]; then
            return "$rc"
        fi
        if [ "$rc" = 28 ]; then
            HTTP_VIIS="exec"
        fi
    fi
    docker exec "$VEEB" curl -fsS -m 8 "http://127.0.0.1$tee" 2>/dev/null
}

tervis() {
    local sha="$1" ver="" keha api apiver
    for _ in $(seq 1 15); do
        ver="$(http_get /version.txt | tr -d '[:space:]' || true)"
        [ "$ver" = "$sha" ] && break
        sleep 2
    done
    if [ "$ver" != "$sha" ]; then
        logi "Tervis: /version.txt annab '${ver:-tühi}', ootasin $(lyhike "$sha")"
        return 1
    fi
    keha="$(http_get / || true)"
    if [[ "$keha" != *'id="root"'* ]]; then
        logi "Tervis: avaleht ei vasta õigesti"
        return 1
    fi
    if [ -f "$REPO/server/api/index.php" ]; then
        api="$(http_get /api/health || true)"
        if [ "$(printf '%s' "$api" | jq -r '.ok // false' 2>/dev/null || true)" != true ]; then
            logi "Tervis: /api/health ei anna ok:true"
            return 1
        fi
        apiver="$(printf '%s' "$api" | jq -r '.version // empty' 2>/dev/null || true)"
        if [ -n "$apiver" ] && [ "$apiver" != "$sha" ]; then
            logi "Hoiatus: /api/health version on '$apiver'"
        fi
    fi
    return 0
}

# relee-politsei taaskäivitus või uus konteiner jätab politsei vana võrguruumi külge.
kontrolli_vorguruumi() {
    local s_id s_pid v_mode v_pid s_ns v_ns vaja=0
    s_id="$(docker inspect -f '{{.Id}}' "$SIDECAR" 2>/dev/null)" || return 0
    v_mode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$VEEB" 2>/dev/null)" || return 0
    s_pid="$(docker inspect -f '{{.State.Pid}}' "$SIDECAR" 2>/dev/null || echo 0)"
    v_pid="$(docker inspect -f '{{.State.Pid}}' "$VEEB" 2>/dev/null || echo 0)"
    [ "$s_pid" -gt 0 ] || return 0
    if [ "$v_mode" != "container:$s_id" ]; then
        vaja=1
    elif [ "$v_pid" -gt 0 ]; then
        s_ns="$(readlink "/proc/$s_pid/ns/net" 2>/dev/null || true)"
        v_ns="$(readlink "/proc/$v_pid/ns/net" 2>/dev/null || true)"
        if [ -n "$s_ns" ] && [ -n "$v_ns" ] && [ "$s_ns" != "$v_ns" ]; then
            vaja=1
        fi
    fi
    if [ "$vaja" = 1 ]; then
        logi "politsei on relee-politsei vana võrguruumi küljes, loon konteineri uuesti"
        if docker compose -f "$KOMPOSE" up -d --force-recreate "$VEEB"; then
            teata "politsei.eu: relee-politsei oli taaskäivitunud, politsei konteiner loodi uuesti"
        else
            logi "VIGA: politsei uuesti loomine ebaõnnestus"
        fi
    fi
}

# Vastus: ok, ok:<märkus>, ootel:<põhjus> või viga:<põhjus>
gh_api() {
    curl -fsS -m 20 -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' \
        -H 'User-Agent: politsei-uuenda' "https://api.github.com/repos/$GH_REPO/$1"
}

ci_seis() {
    local sha="$1" runs total pooleli halvad wf rohelised alles
    if ! runs="$(gh_api "commits/$sha/check-runs?per_page=100")"; then
        echo "ootel:GitHubi API ei vasta (võrk või päringulimiit)"
        return 0
    fi
    total="$(jq -r '.total_count // 0' <<<"$runs")"
    if [ "$total" -eq 0 ]; then
        echo "ootel:check-runs puuduvad, CI pole veel alanud"
        return 0
    fi
    pooleli="$(jq -r '[.check_runs[] | select(.status != "completed")] | length' <<<"$runs")"
    if [ "$pooleli" -ne 0 ]; then
        echo "ootel:$pooleli kontrolli veel käib"
        return 0
    fi
    halvad="$(jq -c '[.check_runs[] | select((.conclusion // "") | IN("success","neutral","skipped") | not)
        | {name, conclusion, suite: .check_suite.id}]' <<<"$runs")"
    if [ "$(jq 'length' <<<"$halvad")" -eq 0 ]; then
        echo "ok"
        return 0
    fi
    # Töö kukkus, aga GitHub loeb töövoo roheliseks (continue-on-error, nt e2e). Seda usume.
    if ! wf="$(gh_api "actions/runs?head_sha=$sha&per_page=50")"; then
        echo "ootel:töövoogude päring ebaõnnestus"
        return 0
    fi
    rohelised="$(jq -c '[.workflow_runs[] | select(.conclusion == "success") | .check_suite_id]' <<<"$wf")"
    alles="$(jq -r --argjson ok "$rohelised" \
        '[.[] | select(.suite | IN($ok[]) | not) | "\(.name)=\(.conclusion)"] | join(", ")' <<<"$halvad")"
    if [ -z "$alles" ]; then
        echo "ok:$(jq -r '[.[].name] | join(", ")' <<<"$halvad") kukkus, aga töövoog on roheline (continue-on-error)"
        return 0
    fi
    echo "viga:$alles"
}

# Selles funktsioonis set -e ei kehti (kutsutakse || kaudu), seega iga samm || return 1.
ehita() {
    local sha="$1" src="$EHITUS/src"
    rm -rf -- "${EHITUS:?}/src" || return 1
    mkdir -p "$src" || return 1
    g archive --format=tar "$sha" | tar -x -C "$src" || return 1
    docker rm -f politsei-ehitus >/dev/null 2>&1 || true
    logi "Ehitan $(lyhike "$sha") (node:22, 2 CPU, nice 10)"
    timeout --signal=TERM 1800 docker run --rm --init --name politsei-ehitus \
        --cpus 2 --cpu-shares 256 --memory 3g --memory-swap 3g \
        -e BASE_PATH=/ -e CI=true -e NODE_OPTIONS=--max-old-space-size=2560 \
        -e npm_config_update_notifier=false -e npm_config_fund=false -e npm_config_audit=false \
        -v "$src:/src" \
        -v politsei-node-modules:/src/node_modules \
        -v politsei-npm-cache:/root/.npm \
        -w /src "$NODE_PILT" \
        sh -c 'nice -n 10 npm ci --prefer-offline --no-progress && nice -n 10 npm run build' \
        || { docker rm -f politsei-ehitus >/dev/null 2>&1 || true; return 1; }
}

kontrolli_dist() {
    local d="$EHITUS/src/dist"
    [ -s "$d/index.html" ] || { logi "dist: index.html puudub"; return 1; }
    [ -d "$d/assets" ] || { logi "dist: assets/ puudub"; return 1; }
    [ -n "$(find "$d/assets" -maxdepth 1 -name '*.js' -print -quit)" ] || { logi "dist: assets/ sees pole JS-i"; return 1; }
    [ -s "$d/sw.js" ] || { logi "dist: sw.js puudub"; return 1; }
    grep -q 'id="root"' "$d/index.html" || { logi "dist: index.html ilma #root elemendita"; return 1; }
    grep -q 'src="/assets/' "$d/index.html" || { logi "dist: index.html ei viita /assets/ peale (BASE_PATH?)"; return 1; }
}

kontrolli_php() {
    local s="$EHITUS/src/server"
    if [ ! -d "$s" ]; then
        logi "server/ puudub selles commitis, php -l jääb vahele"
        return 0
    fi
    docker run --rm --network none -v "$s:/s:ro" "$PHP_PILT" \
        sh -c 'find /s -name "*.php" -exec sh -c '\''for f; do out=$(php -l "$f" 2>&1) || { echo "$out"; exit 1; }; done'\'' sh {} +' \
        || { logi "php -l leidis vea"; return 1; }
}

# Uus Caddyfile reposse: kontrolli frankenphp-ga, rakenda pärast vahetust reloadiga.
kontrolli_caddy() {
    local uus="$EHITUS/src/deploy/mainserver/Caddyfile"
    CADDY_UUS=0
    [ -f "$uus" ] || return 0
    cmp -s "$uus" "$CONF/Caddyfile" && return 0
    rm -rf -- "${EHITUS:?}/caddy" || return 1
    mkdir -p "$EHITUS/caddy" || return 1
    cp "$uus" "$EHITUS/caddy/Caddyfile" || return 1
    if ! docker run --rm --network none -v "$EHITUS/caddy:/etc/epd:ro" \
            -e XDG_CONFIG_HOME=/tmp/c -e XDG_DATA_HOME=/tmp/d "$PHP_PILT" \
            frankenphp validate --config /etc/epd/Caddyfile --adapter caddyfile \
            >"$EHITUS/caddy/validate.log" 2>&1; then
        logi "Uus Caddyfile ei läbinud kontrolli:"
        tail -n 5 "$EHITUS/caddy/validate.log"
        return 1
    fi
    logi "Caddyfile muutus, kontroll läbitud"
    CADDY_UUS=1
}

rakenda_caddy() {
    cp -p "$CONF/Caddyfile" "$EHITUS/caddy/Caddyfile.vana" || return 1
    install -m 0644 "$EHITUS/caddy/Caddyfile" "$CONF/Caddyfile.uus" || return 1
    mv -f "$CONF/Caddyfile.uus" "$CONF/Caddyfile" || return 1
    CADDY_VAHETATUD=1
    docker exec "$VEEB" frankenphp reload --config /etc/epd/Caddyfile --adapter caddyfile \
        || { logi "Caddy reload ebaõnnestus"; return 1; }
}

# repo/server on bind mount: kui git kaotas kausta ja tegi uue, näeb konteiner vana inode'i.
serveri_kaust() {
    local enne="$1" nyyd
    nyyd="$(stat -c %i "$REPO/server" 2>/dev/null || echo puudub)"
    if [ "$nyyd" != "$enne" ]; then
        logi "server/ kaust vahetus, loon politsei konteineri uuesti"
        docker compose -f "$KOMPOSE" up -d --force-recreate "$VEEB" || return 1
    fi
}

paigaldusfailide_teade() {
    local src="$EHITUS/src/deploy/mainserver" muutus=""
    [ -d "$src" ] || return 0
    cmp -s "$src/compose.yml" "$KOMPOSE" || muutus="$muutus compose.yml"
    cmp -s "$src/politsei-uuenda.sh" /usr/local/sbin/politsei-uuenda.sh || muutus="$muutus politsei-uuenda.sh"
    local u
    for u in politsei-uuenda.service politsei-uuenda.path politsei-uuenda.timer; do
        cmp -s "$src/systemd/$u" "/etc/systemd/system/$u" || muutus="$muutus $u"
    done
    if [ -n "$muutus" ]; then
        logi "NB: paigaldusfailid muutusid ($muutus ). Rakenda: sudo bash $REPO/deploy/mainserver/paigalda.sh"
        teata "politsei.eu: paigaldusfailid muutusid ($muutus ). MainServeris: sudo bash $REPO/deploy/mainserver/paigalda.sh"
    fi
}

vaheta() {
    local sha="$1" d="$EHITUS/src/dist"
    EELMINE_SHA="$(g rev-parse -q --verify HEAD 2>/dev/null || true)"
    SERVER_INODE="$(stat -c %i "$REPO/server" 2>/dev/null || echo puudub)"
    printf '%s\n' "$sha" > "$d/version.txt" || return 1
    mkdir -p "$WWW_PREV" || return 1
    rsync -a --delete "$WWW/" "$WWW_PREV/" || return 1
    VAHETUS=1
    # Kausta sisu, mitte kausta (bind mount osutab inode'ile). Uued räsiga failid enne
    # index.html-i, vanad kustuvad alles lõpus.
    rsync -a "$d/assets/" "$WWW/assets/" || return 1
    rsync -a --delete-after --delay-updates "$d/" "$WWW/" || return 1
    g checkout -q -f -B "$HARU" "$sha" || return 1
    serveri_kaust "$SERVER_INODE" || return 1
    if [ "$CADDY_UUS" = 1 ]; then
        rakenda_caddy || return 1
    fi
}

taasta() {
    local enne parast vana
    logi "Taastan eelmise versiooni ($(lyhike "${EELMINE_SHA:-?}"))"
    if [ -d "$WWW_PREV" ]; then
        rsync -a --delete "$WWW_PREV/" "$WWW/" || logi "VIGA: www taastamine ebaõnnestus"
    fi
    if [ -n "$EELMINE_SHA" ]; then
        enne="$(stat -c %i "$REPO/server" 2>/dev/null || echo puudub)"
        g checkout -q -f -B "$HARU" "$EELMINE_SHA" || logi "VIGA: repo taastamine ebaõnnestus"
        parast="$(stat -c %i "$REPO/server" 2>/dev/null || echo puudub)"
        if [ "$enne" != "$parast" ]; then
            docker compose -f "$KOMPOSE" up -d --force-recreate "$VEEB" || logi "VIGA: politsei uuesti loomine ebaõnnestus"
        fi
    fi
    if [ "$CADDY_VAHETATUD" = 1 ] && [ -f "$EHITUS/caddy/Caddyfile.vana" ]; then
        if install -m 0644 "$EHITUS/caddy/Caddyfile.vana" "$CONF/Caddyfile.uus" \
            && mv -f "$CONF/Caddyfile.uus" "$CONF/Caddyfile" \
            && docker exec "$VEEB" frankenphp reload --config /etc/epd/Caddyfile --adapter caddyfile; then
            logi "Vana Caddyfile taastatud"
        else
            logi "VIGA: vana Caddyfile taastamine ebaõnnestus"
        fi
    fi
    vana="$(tr -d '[:space:]' 2>/dev/null < "$WWW/version.txt" || true)"
    if [ -n "$vana" ]; then
        if tervis "$vana"; then
            logi "Eelmine versioon $(lyhike "$vana") töötab"
        else
            logi "HOIATUS: ka eelmine versioon ei läbi tervisekontrolli"
        fi
    fi
}

ebaonnestus() {
    local pohjus="$1"
    KASITLETUD=1
    set +e
    logi "VIGA: $pohjus"
    if [ "$VAHETUS" = 1 ]; then
        taasta
    fi
    margi_vigaseks "$SIHT_SHA"
    kirjuta_olek "viga $SIHT_SHA $pohjus"
    teata "politsei.eu: uuendus $(lyhike "$SIHT_SHA") ebaõnnestus ($pohjus). Jääb $(lyhike "${EELMINE_SHA:-${paigas:-eelmine}}"). Logi: journalctl -t politsei-uuenda"
    exit 1
}

# shellcheck disable=SC2329 # käivitab trap EXIT
lopp() {
    local rc=$?
    trap - EXIT
    set +e
    if [ "$rc" -ne 0 ] && [ "$KASITLETUD" != 1 ]; then
        logi "Ootamatu viga (kood $rc)"
        if [ "$VAHETUS" = 1 ]; then
            taasta
        fi
        if [ -n "$SIHT_SHA" ]; then
            margi_vigaseks "$SIHT_SHA"
            kirjuta_olek "viga $SIHT_SHA ootamatu viga"
            teata "politsei.eu: uuendus $(lyhike "$SIHT_SHA") katkes ootamatult. Logi: journalctl -t politsei-uuenda"
        fi
    fi
    exit "$rc"
}

# ---------------------------------------------------------------- põhivoog

trap lopp EXIT

# 1. Pilet ära kohe alguses, muidu käivitab politsei-uuenda.path teenust ringiratast.
if [ -L "$PILET" ] || { [ -e "$PILET" ] && [ ! -f "$PILET" ]; }; then
    logi "Hoiatus: $PILET pole tavaline fail, kustutan"
    rm -f "$PILET"
elif [ -f "$PILET" ]; then
    pilet_sha="$(head -c 4096 "$PILET" | jq -r '.sha // empty' 2>/dev/null || true)"
    [[ "$pilet_sha" =~ ^[0-9a-f]{40}$ ]] || pilet_sha="?"
    rm -f "$PILET"
    logi "Webhooki pilet (sha $(lyhike "$pilet_sha")), kontrollin origin/main tippu"
fi

# 2. Üks uuendus korraga.
mkdir -p "$(dirname "$LUKUFAIL")" "$OLEK" "$EHITUS"
exec 9>"$LUKUFAIL"
if ! flock -w 1800 9; then
    logi "Teine uuendus käib juba üle 30 minuti, loobun"
    exit 0
fi

[ -d "$REPO/.git" ] || { logi "VIGA: $REPO puudub, käivita paigalda.sh"; KASITLETUD=1; exit 1; }
[ -f "$KOMPOSE" ] || { logi "VIGA: $KOMPOSE puudub, käivita paigalda.sh"; KASITLETUD=1; exit 1; }

loe_telegram

# 3. Võrguruumi kontroll iga kord (odav, parandab relee-politsei taaskäivituse ise).
kontrolli_vorguruumi

# 4. origin/main tipp ja paigas olev versioon.
if ! tipp_rida="$(timeout 60 git ls-remote "$GH_URL" "refs/heads/$HARU")"; then
    logi "GitHub ei vasta (git ls-remote), proovin järgmisel korral"
    exit 0
fi
tipp="$(printf '%s\n' "$tipp_rida" | awk 'NR == 1 {print $1}')"
if [[ ! "$tipp" =~ ^[0-9a-f]{40}$ ]]; then
    logi "git ls-remote ei andnud $HARU tippu, proovin järgmisel korral"
    exit 0
fi
paigas="$(tr -d '[:space:]' 2>/dev/null < "$WWW/version.txt" || true)"

if [ "$tipp" = "$paigas" ] && [ "$JOUD" != 1 ]; then
    logi "Ajakohane: $(lyhike "$tipp")"
    exit 0
fi
if [ "$JOUD" != 1 ] && grep -qx "$tipp" "$OLEK/vigased.txt" 2>/dev/null; then
    logi "$(lyhike "$tipp") on varem ebaõnnestunud, ootan uut committi (või --joud)"
    exit 0
fi

# 5. CI peab olema roheline.
if [ "$JOUD" = 1 ]; then
    logi "--joud: CI kontroll jääb vahele"
else
    seis="$(ci_seis "$tipp")"
    case "$seis" in
        ok) logi "CI roheline: $(lyhike "$tipp")" ;;
        ok:*) logi "CI: ${seis#ok:}" ;;
        ootel:*) logi "Ootan CI-d ($(lyhike "$tipp")): ${seis#ootel:}"; exit 0 ;;
        *)
            logi "CI kukkus ($(lyhike "$tipp")): ${seis#viga:}. Jätan selle commiti vahele."
            margi_vigaseks "$tipp"
            kirjuta_olek "vahele $tipp CI ${seis#viga:}"
            teata "politsei.eu: $(lyhike "$tipp") CI kukkus (${seis#viga:}), uuendust ei tehtud"
            exit 0
            ;;
    esac
fi

SIHT_SHA="$tipp"
logi "Uuendan: $(lyhike "${paigas:-tühi}") -> $(lyhike "$tipp")"

# 6. Too commit ära. Aadress on kindel, repo origin seadistusest ei sõltuta.
timeout 300 git -c safe.directory="$REPO" -C "$REPO" fetch -q "$GH_URL" "+refs/heads/$HARU:refs/remotes/origin/$HARU" \
    || ebaonnestus "git fetch ebaõnnestus"
g cat-file -e "$tipp^{commit}" 2>/dev/null || ebaonnestus "commit $tipp puudub pärast fetchi"
teema="$(g log -1 --format=%s "$tipp" | cut -c1-120)"

# 7. Ehitus ja kontrollid (töötav sait jääb puutumata).
ehita "$tipp" || ebaonnestus "ehitus ebaõnnestus (npm ci või npm run build)"
kontrolli_dist || ebaonnestus "dist kontroll"
kontrolli_php || ebaonnestus "php -l"
kontrolli_caddy || ebaonnestus "Caddyfile kontroll"
paigaldusfailide_teade

# 8. Vahetus: www.prev, rsync, checkout, vajadusel Caddy reload.
vaheta "$tipp" || ebaonnestus "vahetus ebaõnnestus"

# 9. Tervisekontroll.
tervis "$tipp" || ebaonnestus "tervisekontroll ebaõnnestus"

VAHETUS=0
kirjuta_olek "ok $tipp $teema"
logi "Valmis: politsei.eu jookseb nüüd $(lyhike "$tipp") ($teema)"
teata "politsei.eu uuendatud: $(lyhike "$tipp") $teema"
exit 0
