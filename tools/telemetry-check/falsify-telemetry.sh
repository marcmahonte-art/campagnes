#!/usr/bin/env bash
#
# Falsification de `check:telemetry` — `bash tools/telemetry-check/falsify-telemetry.sh`
#
# Porte sur la promesse du module : une photo ou une donnée personnelle ne peut
# pas sortir par la télémétrie. Chaque défaut réinjecté est une façon **plausible**
# de casser cette promesse — pas une façon absurde.
#
# Mêmes contraintes de bac à sable que `falsify-cutout.sh` : sauvegardes dans
# `build/` (déjà ignoré par git), écritures par Node, **aucun argument
# multi-ligne** (il tue le processus), signaux nommés, restauration vérifiée en
# fin de course.

set -u
cd "$(dirname "$0")/../.." || exit 3

TS=lib/telemetry.ts
BACKUP=tools/telemetry-check/build/falsify-backup
mkdir -p "$BACKUP"

restore() {
  node -e '
    const fs = require("fs");
    const p = "tools/telemetry-check/build/falsify-backup/telemetry.ts";
    /* Idempotent : la sauvegarde est consommée en fin de course réussie, mais le
     * trap EXIT se déclenche **après**. */
    if (!fs.existsSync(p)) process.exit(0);
    fs.writeFileSync("lib/telemetry.ts", fs.readFileSync(p));
  '
}

# `trap ... EXIT` ne se déclenche pas sur SIGTERM : la sauvegarde survit et sert
# de marqueur de reprise — sa présence au démarrage veut dire qu'un run
# précédent s'est arrêté avant la fin.
if [ -f "$BACKUP/telemetry.ts" ]; then
  echo "  reprise : une sauvegarde traîne — un run précédent a été interrompu."
  echo "  lib/telemetry.ts restauré depuis cette sauvegarde avant de recommencer."
  restore
  node -e 'require("fs").rmSync("tools/telemetry-check/build/falsify-backup/telemetry.ts", { force: true });'
  echo
fi

node -e '
  const fs = require("fs");
  fs.writeFileSync("tools/telemetry-check/build/falsify-backup/telemetry.ts", fs.readFileSync("lib/telemetry.ts"));
'

trap 'restore' EXIT INT TERM HUP

OUT="$BACKUP/out.txt"
DETECTED=0
MISSED=0
WRONG=0

patch() {
  node -e '
    const fs = require("fs");
    const [p, from, to] = process.argv.slice(1);
    const s = fs.readFileSync(p, "utf8");
    if (!s.includes(from)) { console.error("MOTIF INTROUVABLE : " + from); process.exit(3); }
    fs.writeFileSync(p, s.replace(from, to));
  ' "$1" "$2" "$3" || exit 3
}

expect_failure() {
  local label="$1" needle="$2"
  npm run --silent check:telemetry >"$OUT" 2>&1
  local code=$?

  if [ "$code" -eq 0 ]; then
    echo "  NON DÉTECTÉ     $label"
    MISSED=$((MISSED + 1))
    return
  fi

  # Le motif n'est cherché que dans les lignes **en échec** : un libellé présent
  # sur une ligne verte ne prouve pas que le harnais est tombé pour la bonne
  # raison.
  if grep '^  ECHEC' "$OUT" | grep -qF -- "$needle"; then
    echo "  détecté         $label"
    DETECTED=$((DETECTED + 1))
  else
    echo "  MAUVAISE RAISON $label  (attendu : « $needle »)"
    grep '^  ECHEC' "$OUT" | head -4 | sed 's/^/                   /'
    WRONG=$((WRONG + 1))
  fi
}

echo "Falsification de check:telemetry — rien de personnel ne sort"
echo

# --- 0. Témoin de départ ---------------------------------------------------
restore
npm run --silent check:telemetry >"$OUT" 2>&1
if [ $? -eq 0 ]; then
  echo "  vert au repos  (témoin de départ)"
else
  echo "  LE HARNAIS EST ROUGE AU REPOS — inutile de falsifier"
  grep '^  ECHEC' "$OUT" | head -5 | sed 's/^/                   /'
  exit 3
fi
echo

# --- A. la liste blanche des valeurs ne filtre plus -----------------------
# Le défaut le plus probable : garder le nom de clé et accepter n'importe quelle
# chaîne. C'est ce qui laisserait passer `{ reason: photo.src }`.
restore
patch "$TS" \
  "      if (typeof valeur !== 'string' || !admises.includes(valeur)) return null;" \
  "      if (typeof valeur !== 'string') return null;"
expect_failure "la liste blanche des valeurs ne filtre plus" "une URI de données dans « reason » est refusée"

# --- B. une clé inconnue est ignorée en silence ---------------------------
# Le défaut du « on ignore ce qu'on ne connaît pas » : l'événement part, amputé
# de la clé fautive — donc sans que personne ne sache qu'une clé a été tentée.
restore
patch "$TS" \
  "  for (const [cle, valeur] of Object.entries(fields)) {" \
  "  for (const [cle, valeur] of Object.entries(fields).filter(([c]) => c in VALEURS || c in NOMBRES)) {"
expect_failure "une clé inconnue est ignorée en silence" "« src » est refusée"

# --- C. les nombres ne sont plus bornés -----------------------------------
restore
patch "$TS" \
  "      if (valeur < 0 || valeur > borne) return null;" \
  "      if (valeur < 0) return null;"
expect_failure "la borne haute des nombres disparaît" "une durée démesurée est refusée"

# --- D. le contrôle de marqueurs ne filtre plus ---------------------------
# La seconde serrure. Elle ne se déclenche jamais sur une charge utile normale,
# donc rien ne prouverait qu'elle est encore là — sauf l'assertion forgée.
restore
patch "$TS" \
  "    if (texte.includes(marqueur)) return null;" \
  "    if (texte.includes('marqueur-impossible-a-rencontrer')) return null;"
expect_failure "le contrôle de marqueurs ne filtre plus" "une forme sérialisée porteuse d’un marqueur est refusée"

# --- E. le puits n'est plus protégé ---------------------------------------
# Un destinataire en panne ferait alors échouer l'appel — donc, un jour, le
# parcours du participant.
restore
patch "$TS" \
  "  } catch {" \
  "  } catch (erreur) { throw erreur; } {"
expect_failure "un destinataire en panne casse l’appel" "un destinataire en panne ne fait pas échouer l’appel"

# --- F. `emit` court-circuite la garde ------------------------------------
# Le défaut qui annulerait tout le module : émettre les champs bruts. Deux
# lignes, parce qu'il faut aussi franchir la sérialisation — sinon la seconde
# serrure rattraperait la charge utile et le défaut serait invisible.
restore
patch "$TS" \
  "  const event = buildEvent(name, fields);" \
  "  const event = { name, ...fields } as TelemetryEvent;"
patch "$TS" \
  "  const texte = serializeEvent(event);" \
  "  const texte = JSON.stringify(event);"
expect_failure "emit court-circuite la garde" "une charge utile refusée n’est pas transmise"

restore

# --- Vérification finale -------------------------------------------------
node -e '
  const fs = require("fs");
  const a = fs.readFileSync("lib/telemetry.ts");
  const b = fs.readFileSync("tools/telemetry-check/build/falsify-backup/telemetry.ts");
  if (!a.equals(b)) { console.error("RESTAURATION INCOMPLÈTE — lib/telemetry.ts diffère de la sauvegarde"); process.exit(3); }
  console.log("lib/telemetry.ts restauré à l\x27octet près");
  fs.rmSync("tools/telemetry-check/build/falsify-backup/telemetry.ts", { force: true });
' || exit 3

echo
echo "--- total ---"
echo "détectés : $DETECTED"
echo "manqués  : $MISSED"
echo "mauvaise raison : $WRONG"
echo
# Heredoc **quoté** : le texte contient des accents graves (qui déclencheraient
# une substitution de commande dans une chaîne à guillemets doubles) et des
# apostrophes (qui interdiraient les guillemets simples). Le délimiteur quoté
# neutralise les deux.
cat <<'FIN'
Non éprouvé, et assumé : la couverture des types (`_RuntimeCouvert`,
`_RaisonCouverte`) est une garde de **compilation**, pas d'exécution. La faire
tomber demanderait d'élargir `CutoutRuntime` — donc de patcher `lib/cutout.ts`
et sa sauvegarde, dans un pilote qui en a déjà une. La garde est vérifiée par
le fait que `npm run typecheck` passe ; sa falsification reste à faire, et je
ne la revendique pas.
FIN

if [ "$MISSED" -eq 0 ] && [ "$WRONG" -eq 0 ]; then
  echo "FALSIFICATION COMPLÈTE — les $DETECTED défauts sont détectés, chacun pour la bonne raison."
  exit 0
fi

echo "FALSIFICATION INCOMPLÈTE"
exit 1
