#!/usr/bin/env bash
#
# Falsification de `check:cutout` — `bash tools/cutout-check/falsify-cutout.sh`
#
# Porte sur les assertions ajoutées le 2026-10-10 : les trois arbitrages tranchés
# (seuil d'abandon, budget mobile, aucun transfert serveur automatique), la
# correction du coût de transfert issue du banc (brotli : 3,77 Mo et non 12,4 Mo),
# et les décisions que lit le parcours participant (connexion facturée, issue d'un
# détourage) — phase 2.
#
# Le pilote réinjecte des défauts **réels** dans `lib/cutout.ts`, relance le
# harnais, et exige qu'il tombe **pour la bonne raison**. Une assertion qu'aucun
# défaut ne fait tomber ne protège rien.
#
# Mêmes contraintes de bac à sable que `falsify-api.sh` : sauvegardes dans
# `build/` (déjà ignoré par git), écritures par Node, aucun argument multi-ligne,
# et vérification de la restauration en fin de course.

set -u
cd "$(dirname "$0")/../.." || exit 3

TS=lib/cutout.ts
BACKUP=tools/cutout-check/build/falsify-cutout-backup
mkdir -p "$BACKUP"

restore() {
  node -e '
    const fs = require("fs");
    const p = "tools/cutout-check/build/falsify-cutout-backup/cutout.ts";
    /*
     * Idempotent, et c\u2019est nécessaire : la sauvegarde est consommée à la fin
     * d\u2019une course réussie, mais le trap EXIT se déclenche **après** — sans cette
     * garde, chaque course propre se terminait sur une trace ENOENT.
     */
    if (!fs.existsSync(p)) process.exit(0);
    fs.writeFileSync("lib/cutout.ts", fs.readFileSync(p));
  '
}

# --- Reprise après interruption -------------------------------------------
# `trap ... EXIT` ne se déclenche **pas** sur SIGTERM : un pilote tué en cours de
# route laisse `lib/cutout.ts` patché, avec le défaut réinjecté dedans. C'est
# arrivé deux fois ici, et la seconde fois le run suivant a **écrasé la sauvegarde
# propre par le fichier corrompu** — la corruption devenait alors la référence.
#
# La sauvegarde, elle, survit au SIGTERM. Sa présence au démarrage est donc un
# signal fiable : un run précédent s'est arrêté avant la fin, et elle contient
# l'état propre d'avant. On restaure, on la consomme, on repart.
if [ -f "$BACKUP/cutout.ts" ]; then
  echo "  reprise : une sauvegarde traîne — un run précédent a été interrompu."
  echo "  lib/cutout.ts restauré depuis cette sauvegarde avant de recommencer."
  restore
  node -e 'require("fs").rmSync("tools/cutout-check/build/falsify-cutout-backup/cutout.ts", { force: true });'
  echo
fi

node -e '
  const fs = require("fs");
  fs.writeFileSync("tools/cutout-check/build/falsify-cutout-backup/cutout.ts", fs.readFileSync("lib/cutout.ts"));
'

# EXIT seul ne suffit pas : sur SIGTERM, bash n'exécute pas le trap EXIT. Il faut
# donc nommer les signaux — sinon la sauvegarde existe mais ne sert jamais.
trap 'restore' EXIT INT TERM HUP

OUT="$BACKUP/out.txt"
DETECTED=0
MISSED=0
WRONG=0

# Remplace $2 par $3 dans $1 ; refuse si le motif est absent.
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
  npm run --silent check:cutout >"$OUT" 2>&1
  local code=$?

  if [ "$code" -eq 0 ]; then
    echo "  NON DÉTECTÉ     $label"
    MISSED=$((MISSED + 1))
    return
  fi

  # Le motif n'est cherché que dans les lignes **en échec**. Le chercher dans
  # toute la sortie laissait passer un faux positif : un libellé qui apparaît
  # aussi sur une ligne verte (deux assertions voisines, même formulation)
  # suffisait à faire croire que le harnais était tombé pour la bonne raison.
  if grep '^  FAIL' "$OUT" | grep -qF -- "$needle"; then
    echo "  détecté         $label"
    DETECTED=$((DETECTED + 1))
  else
    echo "  MAUVAISE RAISON $label  (attendu : « $needle »)"
    grep '^  FAIL' "$OUT" | head -4 | sed 's/^/                   /'
    WRONG=$((WRONG + 1))
  fi
}

echo "Falsification de check:cutout — section « les trois arbitrages »"
echo

# --- 0. Témoin de départ ---------------------------------------------------
restore
npm run --silent check:cutout >"$OUT" 2>&1
if [ $? -eq 0 ]; then
  echo "  vert au repos  (témoin de départ)"
else
  echo "  LE HARNAIS EST ROUGE AU REPOS — inutile de falsifier"
  grep '^  FAIL' "$OUT" | head -5 | sed 's/^/                   /'
  exit 3
fi
echo

# --- A. le seuil d'abandon dérive -----------------------------------------
restore
patch "$TS" 'export const ABANDON_AFTER_MS = 5_000;' 'export const ABANDON_AFTER_MS = 4_000;'
expect_failure "le seuil passe de 5 s à 4 s" "le seuil d’abandon est de 5 secondes"

# --- B. le seuil devient exclusif -----------------------------------------
restore
patch "$TS" 'return Number.isFinite(elapsedMs) && elapsedMs >= ABANDON_AFTER_MS;' \
            'return Number.isFinite(elapsedMs) && elapsedMs > ABANDON_AFTER_MS;'
expect_failure "le seuil devient strictement supérieur" "à 5,000 s, on propose"

# --- C. une durée non mesurée déclenche la proposition --------------------
restore
patch "$TS" 'return Number.isFinite(elapsedMs) && elapsedMs >= ABANDON_AFTER_MS;' \
            'return elapsedMs >= ABANDON_AFTER_MS;'
expect_failure "la garde sur les durées non mesurées disparaît" "une durée infinie ne déclenche rien"

# --- D. le budget passe en Mio --------------------------------------------
restore
patch "$TS" 'export const MOBILE_TRANSFER_BUDGET_BYTES = 10_000_000;' \
            'export const MOBILE_TRANSFER_BUDGET_BYTES = 10_485_760;'
expect_failure "le budget est compté en Mio au lieu de Mo" "le budget mobile est de 10 Mo"

# --- E. l'accord n'est plus conditionné à la connexion facturée -----------
restore
patch "$TS" 'return metered === true && exceedsMobileBudget(model);' \
            'return exceedsMobileBudget(model);'
expect_failure "l'accord est demandé même hors forfait" "sur connexion non facturée, on ne demande rien"

# --- F. le budget se relit sur la taille décompressée --------------------
# **C'est le défaut d'origine**, celui que le banc a corrigé le 2026-10-10 :
# comparer 12,4 Mo décompressés à un forfait de 10 Mo. Le réinjecter doit faire
# tomber le verdict — sinon la correction n'est protégée par rien.
restore
patch "$TS" 'return firstLoadTransferBytes(model, worstCase) > MOBILE_TRANSFER_BUDGET_BYTES;' \
            'return firstLoadBytes(model, worstCase) > MOBILE_TRANSFER_BUDGET_BYTES;'
expect_failure "le budget se relit sur la taille décompressée" "le moteur retenu entre dans le budget"

# --- F2. exceedsMobileBudget répond toujours non ------------------------
restore
patch "$TS" 'return firstLoadTransferBytes(model, worstCase) > MOBILE_TRANSFER_BUDGET_BYTES;' \
            'return false;'
expect_failure "exceedsMobileBudget répond toujours non" "MODNet, lui, en sort"

# --- H. le WASM transféré reprend la taille décompressée ----------------
# Confondre les deux colonnes est l'erreur que la mesure a mise au jour ; si
# elle revenait, les chiffres publiés (3,77 Mo) deviendraient faux en silence.
restore
patch "$TS" 'minWasmTransferBytes: 3_398_378,' 'minWasmTransferBytes: 12_168_316,'
expect_failure "le WASM transféré reprend la taille décompressée" "MediaPipe transfère 3,77 Mo"

# --- I. formatBytes repasse en binaire -----------------------------------
# L'affichage doit compter en décimal comme le budget ; sinon « 10 Mo » s'affiche
# « 9,5 Mo », c'est-à-dire faux dans le sens qui fait croire qu'on est sous le seuil.
restore
patch "$TS" 'if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} Ko`;' \
            'if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;'
patch "$TS" 'return `${(bytes / (1000 * 1000)).toFixed(1)} Mo`;' \
            'return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;'
expect_failure "formatBytes redécoupe en binaire" "les méga-octets"

# --- J. la facturation est déduite du débit ------------------------------
# `effectiveType` décrit une vitesse, pas une facturation. L'ajouter au type
# **et** à la règle doit faire tomber le témoin négatif, qui cherche le champ
# dans le code — pas seulement dans un commentaire.
restore
patch "$TS" '  type?: string;' '  type?: string; effectiveType?: string;'
patch "$TS" "  return connection.type === 'cellular';" "  return connection.type === 'cellular' || connection.effectiveType === '3g';"
expect_failure "la facturation est déduite du débit" "le débit n’est jamais lu"

# --- K. une connexion inconnue est dite facturée -------------------------
# Le défaut le plus coûteux en confiance : faire apparaître une demande d'accord
# sur le wifi d'un participant qui n'a rien demandé.
restore
patch "$TS" "  return connection.type === 'cellular';" "  return connection.type !== 'wifi';"
expect_failure "une connexion inconnue est dite facturée" "une connexion inconnue n’est pas dite facturée"

# --- L. tout ce qui n'est pas « ok » est déclaré inutilisable -------------
# Forme du défaut, et pourquoi pas la plus évidente : écrire
# `if (quality.verdict !== 'ok') return 'unusable';` **ne teste rien**. Après ce
# retour, TypeScript rétrécit `quality.verdict` à `'ok'` ; la ligne suivante
# (`=== 'plein' || === 'faible'`) devient sans recouvrement, `tsc` émet TS2367,
# et `check:cutout` sort en **2 avant la première assertion**. Le défaut était
# compté « détecté » alors qu'aucun contrôle n'avait tourné — exactement le faux
# positif que ce pilote existe pour empêcher.
#
# On déclare donc les deux verdicts d'avertissement inutilisables **en gardant le
# code atteignable** : le type de retour reste l'union, aucune branche ne
# disparaît, et c'est bien l'assertion « un seul verdict rend le résultat
# inutilisable » (`inutilisables.length === 1`) qui doit tomber — avec trois
# verdicts au lieu d'un.
restore
patch "$TS" "  if (quality.verdict === 'plein' || quality.verdict === 'faible') return 'warn';" \
            "  if (quality.verdict === 'plein' || quality.verdict === 'faible') return 'unusable';"
expect_failure "un avertissement est traité comme un échec" "un seul verdict rend le résultat inutilisable"

# --- M. le cas « plein » redevient silencieux ----------------------------
# Le plus trompeur des quatre : l'image paraît normale, le fond n'a pas été
# retiré, et le participant n'en saurait rien.
restore
patch "$TS" "  if (quality.verdict === 'plein' || quality.verdict === 'faible') return 'warn';" "  if (quality.verdict === 'faible') return 'warn';"
expect_failure "le cas « plein » redevient silencieux" "l’issue « warn »"

# --- G. un chemin d'envoi apparaît dans le module ------------------------
restore
# Pas d'argument multi-ligne : c'est ce qui fait tuer le pilote par le bac à
# sable. Le saut de ligne est donc fabriqué dans le script Node lui-même.
node -e '
  const fs = require("fs");
  const p = "lib/cutout.ts";
  const s = fs.readFileSync(p, "utf8");
  const anchor = "export const ABANDON_AFTER_MS = 5_000;";
  if (!s.includes(anchor)) { console.error("MOTIF INTROUVABLE"); process.exit(3); }
  const injected = anchor + String.fromCharCode(10) + "const _envoi = () => new XMLHttpRequest();";
  fs.writeFileSync(p, s.replace(anchor, injected));
'
expect_failure "un XMLHttpRequest apparaît dans le module" "aucun chemin d’envoi"

# --- N. le classement des pannes perd son ordre ---------------------------
# Le défaut réaliste : on réordonne les motifs, mais le `return` reste sur
# l'ancienne branche. « out of memory » cesse alors d'être de la mémoire, et
# « Failed to fetch » en devient — deux pannes opposées échangées, donc deux
# gestes faux envoyés au participant.
#
# C'est le contrôle qui vise la **raison machine**, pas le message : sans lui,
# un tel échange resterait invisible tant que les deux textes restent distincts.
restore
patch "$TS" \
  '  if (/out of memory|\boom\b|allocation failed|memory limit|array buffer/.test(message)) {' \
  '  if (/offline|network|fetch|failed to load|load failed|econn|import\(/.test(message)) {'
expect_failure "le motif « mémoire » teste en réalité le réseau" "est classé « memory »"

restore

# --- Vérification finale -------------------------------------------------
node -e '
  const fs = require("fs");
  const a = fs.readFileSync("lib/cutout.ts");
  const b = fs.readFileSync("tools/cutout-check/build/falsify-cutout-backup/cutout.ts");
  if (!a.equals(b)) { console.error("RESTAURATION INCOMPLÈTE — lib/cutout.ts diffère de la sauvegarde"); process.exit(3); }
  console.log("lib/cutout.ts restauré à l\x27octet près");
  /*
   * La sauvegarde est **consommée** : elle n\u2019a de sens que pendant la course.
   * La laisser derrière elle rendrait ambigu le signal de reprise ci-dessus — un
   * run terminé et un run interrompu se ressembleraient.
   */
  fs.rmSync("tools/cutout-check/build/falsify-cutout-backup/cutout.ts", { force: true });
' || exit 3

echo
echo "--- total ---"
echo "détectés : $DETECTED"
echo "manqués  : $MISSED"
echo "mauvaise raison : $WRONG"
echo
echo "Non éprouvé, et assumé : le passage de « > » à « >= » dans exceedsMobileBudget"
echo "n'a **aucun** effet observable avec les valeurs actuelles — les transferts"
echo "mesurés sont 3 774 735 o (MediaPipe) et 10 962 617 o (MODNet), aucun ne tombe"
echo "exactement sur 10 000 000 o. La borne est donc réelle mais invérifiable en"
echo "l'état ; l'annoncer comme détectée serait un faux positif."

if [ "$MISSED" -eq 0 ] && [ "$WRONG" -eq 0 ]; then
  echo "FALSIFICATION COMPLÈTE — les $DETECTED défauts sont détectés, chacun pour la bonne raison."
  exit 0
fi

echo "FALSIFICATION INCOMPLÈTE"
exit 1
