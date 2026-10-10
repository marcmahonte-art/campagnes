#!/usr/bin/env bash
#
# Exécute le banc de détourage dans un navigateur sans interface.
#   bash tools/cutout-bench/run-headless.sh [chemin-image] [id-modele]
#
# C'est le point 9 de la phase 1 : le chemin MediaPipe n'a jamais tourné, et
# « conforme au contrat » n'est pas « ça marche ».
#
# Répartition des rôles, et elle est volontaire : **bash lance les processus**,
# Node ne fait que parler CDP. L'environnement bloque les processus imbriqués
# (`spawnSync` → EBUSY), donc le client Node ne doit rien avoir à lancer.
#
# Trois pièges rencontrés pour de bon, et chacun a coûté un essai :
#
#  1. **`--user-data-dir` doit être un chemin Windows.** Avec un chemin POSIX,
#     Edge ne crée pas de profil neuf et **s'attache à la session déjà ouverte** :
#     le processus rend la main aussitôt, aucun port n'écoute, et rien ne dit
#     pourquoi. On passe donc par `pwd -W`.
#  2. **Il y a un proxy HTTP dans cet environnement.** `curl` y route même
#     `127.0.0.1` et reçoit un **502** — or `curl -s -o /dev/null` sort en
#     succès sur un 502. La vérification de disponibilité validait donc un
#     échec. On exige maintenant un **200**, et on contourne le proxy.
#  3. **Le lanceur rend la main immédiatement** : `$!` ne désigne pas le
#     navigateur. Pour l'arrêter, on retrouve le PID qui **écoute sur le port
#     CDP** — ce qui, en prime, ne touche pas le navigateur de l'utilisateur.
#
# Le profil vit dans `build/`, déjà ignoré par git, et n'est **pas** supprimé :
# `rm -rf` sur un chemin temporaire déclenche le garde-fou `safe-delete`, qui
# tue le processus.

set -u
cd "$(dirname "$0")/../.." || exit 3

IMAGE="${1:-docs/participant/promo/5053774.jpg}"
MODEL_ID="${2:-}"
PORT="${PORT:-8788}"
CDP_PORT="${CDP_PORT:-9222}"

PROFILE="$(pwd -W)/tools/cutout-bench/build/edge-profile"
OUT=tools/cutout-bench/build/headless-report.json

EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
if [ ! -f "$EDGE" ]; then
  EDGE="/c/Program Files/Google/Chrome/Application/chrome.exe"
fi
if [ ! -f "$EDGE" ]; then
  echo "Aucun navigateur Chromium trouvé (Edge ou Chrome)." >&2
  exit 3
fi

if [ ! -f "$IMAGE" ]; then
  echo "Image introuvable : $IMAGE" >&2
  exit 3
fi

# Le proxy de l'environnement ne doit pas s'interposer sur la boucle locale.
http_code() {
  curl -s --noproxy '*' -o /dev/null -w '%{http_code}' "$1" 2>/dev/null
}

echo "=== Compilation du banc ==="
npm run --silent bench:cutout || exit 3
mkdir -p tools/cutout-bench/build "$PROFILE"

echo "=== Démarrage du serveur statique (port $PORT) ==="
PORT="$PORT" node tools/cutout-bench/serve.mjs >tools/cutout-bench/build/serve.log 2>&1 &
SERVER_PID=$!

stop_browser() {
  local pid
  pid=$(netstat -ano 2>/dev/null | grep LISTENING | grep ":$CDP_PORT " | awk '{print $NF}' | head -1)
  if [ -n "${pid:-}" ]; then
    taskkill //PID "$pid" //T //F >/dev/null 2>&1
  fi
}

cleanup() {
  kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
  stop_browser
  return 0
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  [ "$(http_code "http://127.0.0.1:$PORT/index.html")" = "200" ] && break
  sleep 0.25
done

if [ "$(http_code "http://127.0.0.1:$PORT/index.html")" != "200" ]; then
  echo "Le serveur n'a pas répondu 200." >&2
  cat tools/cutout-bench/build/serve.log >&2
  exit 3
fi
echo "  serveur prêt"

echo "=== Lancement du navigateur sans interface ==="
# `--enable-unsafe-swiftshader` donne un WebGL logiciel : le délégué GPU de
# MediaPipe a donc une chance réelle. S'il échoue malgré tout, le code retombe
# sur le CPU et la mesure le dit — c'est un résultat, pas une panne.
# `--remote-allow-origins=*` est indispensable : depuis Chromium 111, une
# connexion CDP dont l'origine n'est pas autorisée est refusée.
"$EDGE" \
  --headless=new \
  --remote-debugging-port="$CDP_PORT" \
  --remote-allow-origins='*' \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-extensions \
  --disable-sync \
  --enable-unsafe-swiftshader \
  --hide-scrollbars \
  --window-size=1280,900 \
  "http://127.0.0.1:$PORT/index.html" \
  >tools/cutout-bench/build/edge.log 2>&1 &

for _ in $(seq 1 80); do
  [ "$(http_code "http://127.0.0.1:$CDP_PORT/json/version")" = "200" ] && break
  sleep 0.25
done

if [ "$(http_code "http://127.0.0.1:$CDP_PORT/json/version")" != "200" ]; then
  echo "Le navigateur n'a pas exposé CDP sur $CDP_PORT." >&2
  echo "  (profil : $PROFILE)" >&2
  tail -20 tools/cutout-bench/build/edge.log >&2
  exit 3
fi
echo "  navigateur prêt"

echo "=== Exécution du détourage ==="
echo "  image  : $IMAGE"
echo "  modèle : ${MODEL_ID:-(défaut du banc)}"
echo

ARGS=(--image "$IMAGE" --url "http://127.0.0.1:$PORT/index.html" --cdp "http://127.0.0.1:$CDP_PORT")
if [ -n "$MODEL_ID" ]; then
  ARGS+=(--model "$MODEL_ID")
fi

node tools/cutout-bench/run-headless.mjs "${ARGS[@]}" | tee "$OUT"
STATUS=${PIPESTATUS[0]}

echo
echo "=== Rapport complet : $OUT ==="
exit "$STATUS"
