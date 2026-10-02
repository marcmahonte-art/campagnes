/**
 * Contrôle du verrouillage des « Modèles de Cadres ».
 *
 * RÈGLE MÉTIER
 *   Les modèles de cadres sont un module premium : ils sont réservés aux
 *   formules payantes. Un compte gratuit ne doit pouvoir en appliquer AUCUN,
 *   par aucun chemin.
 *
 * POURQUOI CE CONTRÔLE
 *   Le verrou vit dans `lib/plans.ts` (`templates_premium`). L'interface ne
 *   fait que l'appliquer — deux écrans l'appliquent (le bouton du panneau et
 *   la garde de `useTemplate`). Si la règle changeait, ou si un écran se
 *   mettait à la recopier de travers, ce contrôle le dirait.
 *
 *   Il vérifie aussi que le verrou est **fermé par défaut** : une formule
 *   inconnue ou absente ne doit jamais ouvrir le module. C'est le sens de
 *   `plan={user?.plan ?? 'free'}` dans l'éditeur — dans le doute, on ferme.
 *
 * Usage : npm run check:templates
 */

import { PLANS, PREMIUM_MODULES, FEATURE_LABELS, hasFeature, planOf, isPaidPlan } from '../../lib/plans';
import type { PlanId } from '../../lib/plans';

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  ok     ${label}`);
  } else {
    failed++;
    console.log(`  ECHEC  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const PAID: PlanId[] = ['creator', 'organization'];

/* ------------------------------------------------------------------ */
/* 1. La règle en elle-même                                           */
/* ------------------------------------------------------------------ */

console.log('=== 1. Le droit `templates_premium` ===');

ok(
  'le compte gratuit N’A PAS accès aux modèles',
  !hasFeature('free', 'templates_premium'),
);

for (const plan of PAID) {
  ok(
    `la formule ${plan} A accès aux modèles`,
    hasFeature(plan, 'templates_premium'),
  );
}

ok(
  'le droit est cohérent avec « formule payante »',
  (['free', 'creator', 'organization'] as PlanId[]).every(
    (p) => hasFeature(p, 'templates_premium') === isPaidPlan(p),
  ),
);

/* ------------------------------------------------------------------ */
/* 2. Fermé par défaut — le cas qui compte vraiment                    */
/* ------------------------------------------------------------------ */

console.log('\n=== 2. Fermé par défaut (null / valeur inconnue) ===');

ok(
  'plan null → pas d’accès',
  !hasFeature(null, 'templates_premium'),
);
ok(
  'plan undefined → pas d’accès',
  !hasFeature(undefined, 'templates_premium'),
);
ok(
  'plan vide (chaîne) → pas d’accès',
  !hasFeature('', 'templates_premium'),
);
ok(
  'plan inconnu (« enterprise ») → pas d’accès',
  !hasFeature('enterprise', 'templates_premium'),
  'une formule non déclarée ne doit jamais élargir un droit',
);
ok(
  'planOf(undefined) retombe sur free',
  planOf(undefined).id === 'free',
);
ok(
  'planOf(« enterprise ») retombe sur free',
  planOf('enterprise').id === 'free',
);

/* ------------------------------------------------------------------ */
/* 3. La formule requise annoncée à l'utilisateur                      */
/* ------------------------------------------------------------------ */

console.log('\n=== 3. Formule requise annoncée ===');

const required =
  PREMIUM_MODULES.find((m) => m.feature === 'templates_premium')?.availableFrom ?? null;

ok(
  'le module des modèles est déclaré dans PREMIUM_MODULES',
  required !== null,
  'sinon l’interface ne saurait pas quelle formule proposer',
);
ok(
  'la formule requise est bien une formule PAYANTE',
  required !== null && isPaidPlan(required),
  `requise = ${String(required)}`,
);
ok(
  'la formule requise débloque réellement les modèles',
  required !== null && hasFeature(required, 'templates_premium'),
  'sinon on proposerait une formule qui ne débloque rien',
);
ok(
  'PLANS contient la formule requise',
  required !== null && Boolean(PLANS[required as PlanId]),
);

/* ------------------------------------------------------------------ */
/* 4. Cohérence avec la grille tarifaire affichée                      */
/* ------------------------------------------------------------------ */

console.log('\n=== 4. Le verrou est-il annoncé sur /tarifs ? ===');

/*
 * Un module payant qui n'apparaît nulle part sur la page des formules serait
 * un verrou muet : l'utilisateur verrait un bouton grisé sans comprendre
 * pourquoi, et sans savoir quoi souscrire.
 */
ok(
  '« Templates premium » figure dans les libellés de module',
  Object.values(FEATURE_LABELS).some((l) => /template/i.test(l)),
  'sinon le verrou serait muet sur la page des formules',
);

ok(
  'la formule payante affiche « 4 900 FCFA / mois »',
  PLANS.creator.priceFcfa === 4900,
  `réel = ${PLANS.creator.priceFcfa}`,
);

/* ------------------------------------------------------------------ */
/* Bilan                                                              */
/* ------------------------------------------------------------------ */

console.log(
  `\n${failed === 0 ? 'TOUT EST VERT' : `${failed} ÉCHEC(S)`} — ${passed} contrôle(s) réussi(s), ${failed} échoué(s)\n`,
);

process.exit(failed === 0 ? 0 : 1);
