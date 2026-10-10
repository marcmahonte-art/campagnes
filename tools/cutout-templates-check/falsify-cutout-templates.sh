#!/usr/bin/env bash
#
# Falsification de `check:templates:cutout` — `bash tools/cutout-templates-check/falsify-cutout-templates.sh`
#
# Porte sur les invariants de la phase 3 : les trois décors détourés, la garde de
# type qui empêche `subject: 'cutout'` de fuir sur un cadre photo, la composition
# en trois plans, la stabilité à l'enregistrement, et l'impossibilité structurelle
# pour un modèle de porter une photo de participant.
#
# Le pilote réinjecte des défauts **réels** dans `lib/templates.ts`, relance le
# harnais, et exige qu'il tombe **pour la bonne raison**. Une assertion qu'aucun
# défaut ne fait tomber ne protège rien.
#
# Mêmes contraintes de bac à sable que `falsify-cutout.sh` : sauvegardes dans
# `build/` (déjà ignoré par git), écritures par Node, aucun argument multi-ligne,
# signaux nommés, et vérification de la restauration en fin de course.

set -u
cd "$(dirname "$0")/../.." || exit 3

TS=lib/templates.ts
BACKUP=tools/cutout-templates-check/build/falsify-backup
mkdir -p "$BACKUP"

restore() {
  node -e '
    const fs = require("fs");
    const p = "tools/cutout-templates-check/build/falsify-backup/templates.ts";
    /*
     * Idempotent, et c\u2019est nécessaire : la sauvegarde est consommée à la fin
     * d\u2019une course réussie, mais le trap EXIT se déclenche **après** — sans cette
     * garde, chaque course propre se terminerait sur une trace ENOENT.
     */
    if (!fs.existsSync(p)) process.exit(0);
    fs.writeFileSync("lib/templates.ts", fs.readFileSync(p));
  '
}

# --- Reprise après interruption -------------------------------------------
# `trap ... EXIT` ne se déclenche **pas** sur SIGTERM : un pilote tué en cours de
# route laisse `lib/templates.ts` patché, avec le défaut réinjecté dedans. La
# sauvegarde, elle, survit au SIGTERM — sa présence au démarrage est donc un
# signal fiable : un run précédent s'est arrêté avant la fin, et elle contient
# l'état propre d'avant.
if [ -f "$BACKUP/templates.ts" ]; then
  echo "  reprise : une sauvegarde traîne — un run précédent a été interrompu."
  echo "  lib/templates.ts restauré depuis cette sauvegarde avant de recommencer."
  restore
  node -e 'require("fs").rmSync("tools/cutout-templates-check/build/falsify-backup/templates.ts", { force: true });'
  echo
fi

node -e '
  const fs = require("fs");
  fs.writeFileSync("tools/cutout-templates-check/build/falsify-backup/templates.ts", fs.readFileSync("lib/templates.ts"));
'

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

# Supprime la ligne qui **précède** la première ligne contenant $2, après avoir
# vérifié que cette ligne contient bien $3. Nécessaire parce que `subject:
# 'cutout',` apparaît trois fois : on ne peut pas viser la troisième par un
# remplacement de chaîne, qui prend toujours la première.
patch_ligne_avant() {
  node -e '
    const fs = require("fs");
    const nl = String.fromCharCode(10);
    const [p, cible, attendu] = process.argv.slice(1);
    const lignes = fs.readFileSync(p, "utf8").split(nl);
    const i = lignes.findIndex((l) => l.includes(cible));
    if (i === -1) { console.error("CIBLE INTROUVABLE : " + cible); process.exit(3); }
    if (i === 0 || !lignes[i - 1].includes(attendu)) {
      console.error("LIGNE PRECEDENTE INATTENDUE : " + String(lignes[i - 1]));
      process.exit(3);
    }
    lignes.splice(i - 1, 1);
    fs.writeFileSync(p, lignes.join(nl));
  ' "$1" "$2" "$3" || exit 3
}

# Remplace, **après** la première ligne contenant $2, la première ligne dont le
# contenu (rogné) vaut $3 par $4. Même raison : `h: 1080,` apparaît sept fois.
patch_ligne_apres() {
  node -e '
    const fs = require("fs");
    const nl = String.fromCharCode(10);
    const [p, cible, ancienne, nouvelle] = process.argv.slice(1);
    const lignes = fs.readFileSync(p, "utf8").split(nl);
    const i = lignes.findIndex((l) => l.includes(cible));
    if (i === -1) { console.error("CIBLE INTROUVABLE : " + cible); process.exit(3); }
    const j = lignes.findIndex((l, k) => k > i && l.trim() === ancienne);
    if (j === -1) { console.error("LIGNE SUIVANTE INTROUVABLE : " + ancienne); process.exit(3); }
    lignes[j] = lignes[j].replace(ancienne, nouvelle);
    fs.writeFileSync(p, lignes.join(nl));
  ' "$1" "$2" "$3" "$4" || exit 3
}

expect_failure() {
  local label="$1" needle="$2"
  npm run --silent check:templates:cutout >"$OUT" 2>&1
  local code=$?

  if [ "$code" -eq 0 ]; then
    echo "  NON DÉTECTÉ     $label"
    MISSED=$((MISSED + 1))
    return
  fi

  # Le motif n'est cherché que dans les lignes **en échec**. Le chercher dans
  # toute la sortie laisserait passer un faux positif : un libellé qui apparaît
  # aussi sur une ligne verte suffirait à faire croire que le harnais est tombé
  # pour la bonne raison.
  if grep '^  ECHEC' "$OUT" | grep -qF -- "$needle"; then
    echo "  détecté         $label"
    DETECTED=$((DETECTED + 1))
  else
    echo "  MAUVAISE RAISON $label  (attendu : « $needle »)"
    grep '^  ECHEC' "$OUT" | head -4 | sed 's/^/                   /'
    WRONG=$((WRONG + 1))
  fi
}

echo "Falsification de check:templates:cutout — phase 3, modèles détourés"
echo

# --- 0. Témoin de départ ---------------------------------------------------
restore
npm run --silent check:templates:cutout >"$OUT" 2>&1
if [ $? -eq 0 ]; then
  echo "  vert au repos  (témoin de départ)"
else
  echo "  LE HARNAIS EST ROUGE AU REPOS — inutile de falsifier"
  grep '^  ECHEC' "$OUT" | head -5 | sed 's/^/                   /'
  exit 3
fi
echo

# --- A. la garde de type disparaît ----------------------------------------
# Le défaut d'origine : le mode du modèle suit l'appelant sans condition, donc un
# cadre photo peut recevoir `subject: 'cutout'` — et `photoFit()` le traite.
restore
patch "$TS" \
  "    subject: kind === 'background_frame' ? clone.subject : undefined," \
  "    subject: clone.subject,"
expect_failure "la garde de type disparaît" "cadre photo + kind → aucun mode posé"

# --- B. la garde ferme tout ------------------------------------------------
# L'excès inverse, et il est plus insidieux que le précédent : le harnais reste
# vert sur les trois contrôles de fuite, et les modèles détourés ne servent plus
# à rien. Sans le témoin « le bon type pose bien le mode », personne ne le voit.
restore
patch "$TS" \
  "    subject: kind === 'background_frame' ? clone.subject : undefined," \
  "    subject: undefined,"
expect_failure "la garde refuse le mode même au bon type" "photo sur fond + kind → le mode est posé"

# --- C. un décor perd son mode --------------------------------------------
restore
patch_ligne_avant "$TS" "photo_anchor: 'tpl-ocean-zone'," "subject: 'cutout',"
expect_failure "un des trois décors perd son mode" "exactement trois modèles détourés"

# --- D. la zone désigne le dernier calque ---------------------------------
# Repointer l'ancre sur le calque du haut : plus rien n'est devant le sujet, le
# titre passe derrière lui. C'est l'erreur de composition la plus facile à faire
# en écrivant un décor à la main.
restore
patch "$TS" "photo_anchor: 'tpl-ocean-zone'," "photo_anchor: 'tpl-ocean-sous',"
expect_failure "la zone désigne le calque du dessus" "au moins un calque passe devant le sujet"

# --- E. le décor ne couvre plus le cadre ----------------------------------
restore
patch_ligne_apres "$TS" "label: 'Ciel de nuit'," "h: 1080," "h: 1000,"
expect_failure "le décor ne couvre plus tout le cadre" "le décor couvre tout le cadre"

# --- F. une source photographique entre dans un modèle --------------------
# Le contrôle qui protège la promesse : aucune image, jamais, dans un modèle.
# Un PNG de 1×1 suffit à le faire tomber — la taille n'est pas le sujet.
restore
patch "$TS" "src: cutoutZone()," \
  "src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',"
expect_failure "un modèle embarque une source photographique" "n’embarque aucune source photographique"

# --- G. un calque de participant entre dans un modèle ---------------------
# On renomme la zone **et** l'ancre : sans les deux, la panne serait une ancre
# orpheline, c'est-à-dire une autre raison que celle qu'on veut éprouver.
restore
patch "$TS" "id: 'tpl-ocean-zone'," "id: 'participant-photo',"
patch "$TS" "photo_anchor: 'tpl-ocean-zone'," "photo_anchor: 'participant-photo',"
expect_failure "un modèle porte un calque de participant" "ne contient aucun calque de participant"

# --- H. un texte déborde du cadre -----------------------------------------
# Un décor plein cadre le reste après mise à l'échelle ; les textes, non. C'est
# eux qui peuvent sortir, et le format 1:1 est le plus contraignant des trois.
restore
patch "$TS" "          y: 64," "          y: 1050,"
expect_failure "un titre sort du cadre" "rien ne déborde en 1:1"

# --- I. la zone du sujet sort du cadre ------------------------------------
restore
patch "$TS" "          x: 170," "          x: -40,"
expect_failure "la zone du sujet sort du cadre" "la zone du sujet reste dans le cadre"

restore

# --- Vérification finale -------------------------------------------------
node -e '
  const fs = require("fs");
  const a = fs.readFileSync("lib/templates.ts");
  const b = fs.readFileSync("tools/cutout-templates-check/build/falsify-backup/templates.ts");
  if (!a.equals(b)) { console.error("RESTAURATION INCOMPLÈTE — lib/templates.ts diffère de la sauvegarde"); process.exit(3); }
  console.log("lib/templates.ts restauré à l\x27octet près");
  /*
   * La sauvegarde est **consommée** : elle n\u2019a de sens que pendant la course.
   * La laisser derrière elle rendrait ambigu le signal de reprise ci-dessus — un
   * run terminé et un run interrompu se ressembleraient.
   */
  fs.rmSync("tools/cutout-templates-check/build/falsify-backup/templates.ts", { force: true });
' || exit 3

echo
echo "--- total ---"
echo "détectés : $DETECTED"
echo "manqués  : $MISSED"
echo "mauvaise raison : $WRONG"
echo
echo "Non éprouvé, et assumé : les deux contrôles de source (l’éditeur de cadre ne"
echo "compose jamais de descripteur participant) ne sont pas falsifiés ici. Les"
echo "faire tomber demanderait de patcher un **second** fichier — donc une seconde"
echo "sauvegarde, donc une seconde occasion de laisser le dépôt corrompu après un"
echo "SIGTERM. La règle est vérifiée ; sa falsification reste à faire, et je ne la"
echo "revendique pas."

if [ "$MISSED" -eq 0 ] && [ "$WRONG" -eq 0 ]; then
  echo "FALSIFICATION COMPLÈTE — les $DETECTED défauts sont détectés, chacun pour la bonne raison."
  exit 0
fi

echo "FALSIFICATION INCOMPLÈTE"
exit 1
