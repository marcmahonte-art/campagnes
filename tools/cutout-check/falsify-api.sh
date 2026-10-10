#!/usr/bin/env bash
#
# Falsification de la garde de contrat — `bash tools/cutout-check/falsify-api.sh`
#
# Une garde qui n'a jamais échoué n'a rien prouvé. Ce pilote réinjecte des
# défauts **réels** — un `segment()` qui devient asynchrone, un `close()` qui
# disparaît, une version épinglée qui dérive — et exige que la garde tombe, et
# tombe **pour la bonne raison**.
#
# Pourquoi un pilote en bash, et pas en Node : l'environnement bloque les
# processus imbriqués (`spawnSync` → EBUSY). Node ne sert donc ici qu'à lire et
# écrire des fichiers ; c'est bash qui enchaîne.
#
# Les défauts qui touchent le relevé (`api/vision.d.ts`) exigent de recalculer
# l'empreinte du manifeste, sinon **toutes** les vérifications tomberaient et on
# ne saurait pas laquelle a réellement détecté le défaut. `rehash` isole le
# contrôle de contrat du contrôle d'intégrité.

set -u
cd "$(dirname "$0")/../.." || exit 3

SNAP=tools/cutout-check/api/vision.d.ts
MAN=tools/cutout-check/api/manifest.json
TS=lib/cutout.ts

# Le bac à sable refuse `rm -rf` sur un chemin temporaire (« embedded drive
# prefix is not allowed »). On garde donc les sauvegardes dans `build/`, déjà
# ignoré par git, et on nettoie fichier par fichier plutôt que récursivement.
BACKUP=tools/cutout-check/build/falsify-backup
mkdir -p "$BACKUP"

# On écrit avec Node, pas avec `cp` : sur ce chemin, `cp` a déjà répondu
# « Permission denied » de façon intermittente — et une restauration qui échoue
# en silence laisse le relevé altéré, ce qui est pire que pas de restauration.
node -e '
  const fs = require("fs");
  const pairs = [
    ["tools/cutout-check/api/vision.d.ts", "tools/cutout-check/build/falsify-backup/vision.d.ts"],
    ["tools/cutout-check/api/manifest.json", "tools/cutout-check/build/falsify-backup/manifest.json"],
    ["lib/cutout.ts", "tools/cutout-check/build/falsify-backup/cutout.ts"],
  ];
  for (const [a, b] of pairs) fs.writeFileSync(b, fs.readFileSync(a));
'

restore() {
  node -e '
    const fs = require("fs");
    const pairs = [
      ["tools/cutout-check/build/falsify-backup/vision.d.ts", "tools/cutout-check/api/vision.d.ts"],
      ["tools/cutout-check/build/falsify-backup/manifest.json", "tools/cutout-check/api/manifest.json"],
      ["tools/cutout-check/build/falsify-backup/cutout.ts", "lib/cutout.ts"],
    ];
    for (const [a, b] of pairs) fs.writeFileSync(b, fs.readFileSync(a));
  '
}
trap 'restore' EXIT

OUT="$BACKUP/out.txt"
DETECTED=0
MISSED=0
WRONG=0

# Remplace $2 par $3 dans le fichier $1 ; refuse si le motif est absent.
patch() {
  node -e '
    const fs = require("fs");
    const [p, from, to] = process.argv.slice(1);
    const s = fs.readFileSync(p, "utf8");
    if (!s.includes(from)) { console.error("MOTIF INTROUVABLE : " + from); process.exit(3); }
    fs.writeFileSync(p, s.replace(from, to));
  ' "$1" "$2" "$3" || exit 3
}

# Recalcule l'empreinte consignée, pour que le contrôle d'intégrité ne masque
# pas le contrôle de contrat qu'on veut éprouver.
rehash() {
  node -e '
    const fs = require("fs"), crypto = require("crypto");
    const b = fs.readFileSync("tools/cutout-check/api/vision.d.ts");
    const m = JSON.parse(fs.readFileSync("tools/cutout-check/api/manifest.json", "utf8"));
    m.fileSha256 = crypto.createHash("sha256").update(b).digest("hex");
    m.fileBytes = b.length;
    fs.writeFileSync("tools/cutout-check/api/manifest.json", JSON.stringify(m, null, 2) + "\n");
  '
}

# $1 = libellé, $2 = fragment de la ligne FAIL attendue
expect_failure() {
  local label="$1" needle="$2"
  node tools/cutout-check/check-api.mjs >"$OUT" 2>&1
  local code=$?

  if [ "$code" -eq 0 ]; then
    echo "  NON DÉTECTÉ   $label"
    MISSED=$((MISSED + 1))
    return
  fi

  if grep -qF -- "$needle" "$OUT"; then
    echo "  détecté       $label"
    DETECTED=$((DETECTED + 1))
  else
    echo "  MAUVAISE RAISON  $label  (attendu : « $needle »)"
    grep '^  FAIL' "$OUT" | head -4 | sed 's/^/                 /'
    WRONG=$((WRONG + 1))
  fi
}

echo "Falsification de check:cutout:api"
echo

# --- 0. Témoin : sans défaut, la garde passe -------------------------------
restore
node tools/cutout-check/check-api.mjs >"$OUT" 2>&1
if [ $? -eq 0 ]; then
  echo "  vert au repos  (témoin de départ)"
else
  echo "  LA GARDE EST ROUGE AU REPOS — inutile de falsifier"
  grep '^  FAIL' "$OUT" | head -5 | sed 's/^/                 /'
  exit 3
fi
echo

# --- A. segment() devient asynchrone ---------------------------------------
restore
patch "$SNAP" 'segment(image: ImageSource): ImageSegmenterResult;' \
              'segment(image: ImageSource): Promise<ImageSegmenterResult>;'
rehash
expect_failure "segment() devient asynchrone" "est SYNCHRONE"

# --- B. close() disparaît du résultat --------------------------------------
restore
node -e '
  const fs = require("fs");
  const p = "tools/cutout-check/api/vision.d.ts";
  const s = fs.readFileSync(p, "utf8");
  const at = s.indexOf("export declare class ImageSegmenterResult {");
  const end = s.indexOf("\n}", at);
  fs.writeFileSync(p, s.slice(0, at) + "export declare class ImageSegmenterResult {\n    readonly confidenceMasks?: MPMask[] | undefined;\n    readonly categoryMask?: MPMask | undefined;\n}" + s.slice(end + 2));
'
rehash
expect_failure "close() disparaît d'ImageSegmenterResult" "ImageSegmenterResult.close() existe"

# --- C. confidenceMasks devient obligatoire --------------------------------
restore
patch "$SNAP" 'readonly confidenceMasks?: MPMask[]' 'readonly confidenceMasks: MPMask[]'
rehash
expect_failure "confidenceMasks devient obligatoire" "confidenceMasks, optionnel"

# --- D. delegate n'accepte plus que CPU ------------------------------------
restore
patch "$SNAP" 'delegate?: "CPU" | "GPU" | undefined;' 'delegate?: "CPU" | "NPU" | undefined;'
rehash
expect_failure "delegate n'accepte plus GPU" 'accepte delegate'

# --- E. le canal personne change de forme ----------------------------------
restore
patch "$SNAP" 'declare type ImageSource = TexImageSource;' 'declare type ImageSource = HTMLCanvasElement;'
rehash
expect_failure "ImageSource cesse d'être un TexImageSource" "ImageSource est TexImageSource"

# --- F. notre code cesse de fermer le résultat -----------------------------
restore
patch "$TS" 'result?.close?.();' '/* plus de fermeture */'
expect_failure "lib/cutout.ts ne ferme plus le résultat" "le RÉSULTAT est fermé"

# --- G. notre code cesse de fournir le canvas GPU --------------------------
restore
patch "$TS" 'canvas: gpuCanvas,' '/* canvas retiré */'
expect_failure "lib/cutout.ts ne fournit plus de canvas" "un canvas est fourni"

# --- H. la version épinglée dérive ----------------------------------------
restore
patch "$TS" '@mediapipe/tasks-vision@1.1.0' '@mediapipe/tasks-vision@1.2.0'
expect_failure "la version épinglée dérive sans re-relevé" "décrit exactement la version épinglée"

# --- I. le relevé est altéré sans recalcul d'empreinte ---------------------
restore
patch "$SNAP" 'export declare class MPMask {' 'export declare class MPMaskX {'
expect_failure "le relevé est altéré (empreinte)" "intact (ancre dans le code)"

# --- J. un nom exporté disparaît du manifeste -----------------------------
restore
node -e '
  const fs = require("fs");
  const p = "tools/cutout-check/api/manifest.json";
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  m.namedExports = m.namedExports.filter((n) => n !== "MPMask");
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
'
expect_failure "le bundle n'exporte plus MPMask" "le bundle exporte MPMask"

# --- K. notre déclaration perd le close() du résultat ---------------------
restore
# Pas d'argument multi-ligne ici : c'est précisément ce qui faisait tuer le
# pilote par le bac à sable. Le motif est donc résolu par position, dans le
# script Node lui-même.
node -e '
  const fs = require("fs");
  const p = "lib/cutout.ts";
  const s = fs.readFileSync(p, "utf8");
  const token = "close?: () => void;";
  const anchor = s.indexOf("export interface MediapipeSegmenter");
  const at = s.indexOf(token, anchor);
  if (anchor < 0 || at < 0) { console.error("MOTIF INTROUVABLE"); process.exit(3); }
  fs.writeFileSync(p, s.slice(0, at) + s.slice(at + token.length));
'
expect_failure "la déclaration du résultat perd close()" "le RÉSULTAT déclaré porte close()"

# --- L. le relevé est altéré ET le manifeste recalculé pour suivre ---------
#
# Le défaut qui a réellement eu lieu le 2026-10-10 : un pilote tué en cours de
# route laisse le relevé modifié, et `rehash` a mis le manifeste d'accord avec
# lui. Comparer le relevé au manifeste disait alors « intact » sur un fichier
# modifié. C'est cette falsification qui justifie l'ancre dans le code.
restore
patch "$SNAP" 'readonly confidenceMasks?: MPMask[]' 'readonly confidenceMasks: MPMask[]'
rehash
expect_failure "le relevé est altéré et le manifeste recalculé pour suivre" "intact (ancre dans le code)"

restore
# La restauration est vérifiée contre **l'ancre du code**, et non contre le
# manifeste : le manifeste peut avoir été recalculé par `rehash` pendant la
# falsification, et se comparer à lui reviendrait à se comparer à soi-même.
node -e '
  const fs = require("fs"), crypto = require("crypto");
  const guard = fs.readFileSync("tools/cutout-check/check-api.mjs", "utf8");
  const anchor = /EXPECTED_SNAPSHOT_SHA256 = .([0-9a-f]{64})./.exec(guard);
  if (!anchor) { console.error("ANCRE INTROUVABLE dans check-api.mjs"); process.exit(3); }
  const h = crypto.createHash("sha256").update(fs.readFileSync("tools/cutout-check/api/vision.d.ts")).digest("hex");
  if (h !== anchor[1]) { console.error("RESTAURATION INCOMPLÈTE — le relevé ne porte pas l\x27empreinte de l\x27ancre"); process.exit(3); }
  console.log("relevé restauré, sha256 conforme à l\x27ancre du code");
' || exit 3

echo
echo "--- total ---"
echo "détectés : $DETECTED"
echo "manqués  : $MISSED"
echo "mauvaise raison : $WRONG"

if [ "$MISSED" -eq 0 ] && [ "$WRONG" -eq 0 ]; then
  echo "FALSIFICATION COMPLÈTE — les $DETECTED défauts sont détectés, chacun pour la bonne raison."
  exit 0
fi

echo "FALSIFICATION INCOMPLÈTE"
exit 1
