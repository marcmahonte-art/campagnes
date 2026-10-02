/*
 * Contrôle de la règle de filigrane.
 *
 * Ce harnais existe parce que la règle est **commerciale**, donc facile à casser
 * sans qu'aucun test de rendu ne s'en aperçoive : une vignette sans badge passe
 * inaperçue, alors qu'elle annonce au participant un fichier qu'il n'obtiendra
 * pas. Ce qu'on vérifie, en important la **vraie** fonction du projet :
 *
 *  1. un accès **public** (`/c/[slug]`) marque toujours, même pour un compte Pro ;
 *  2. un accès **distribué** (`/d/[token]`) suit la formule du créateur ;
 *  3. la formule d'export traduit correctement la décision : dès qu'un badge est
 *     requis, on exporte sous `free` — seule formule sans le droit `no_watermark` ;
 *  4. les quatre combinaisons possibles sont couvertes explicitement.
 *
 * On vérifie aussi que la traduction en formule reste cohérente avec
 * `hasFeature()` de `lib/plans.ts` : si `free` obtenait un jour `no_watermark`,
 * ce contrôle échouerait — et c'est exactement ce qu'on veut.
 *
 * Lancement : `npm run check:watermark`
 */
import { exportPlanFor, shouldWatermark, type WatermarkInput } from '../../lib/watermark-policy';
import { hasFeature } from '../../lib/plans';

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}`);
  }
}

function eq<T>(label: string, actual: T, expected: T): void {
  ok(`${label} (attendu ${String(expected)}, obtenu ${String(actual)})`, actual === expected);
}

/* ------------------------------------------------------------------ */
/* 1. Les quatre combinaisons                                          */
/* ------------------------------------------------------------------ */

console.log('\n=== 1. Décision de poser le badge ===');

const cases: Array<{ input: WatermarkInput; expected: boolean; why: string }> = [
  {
    input: { access: 'public', creatorWatermark: true },
    expected: true,
    why: 'accès galerie + créateur Free',
  },
  {
    input: { access: 'public', creatorWatermark: false },
    expected: true,
    why: 'accès galerie + créateur Pro → LA règle demandée',
  },
  {
    input: { access: 'distributed', creatorWatermark: true },
    expected: true,
    why: 'lien distribué + créateur Free',
  },
  {
    input: { access: 'distributed', creatorWatermark: false },
    expected: false,
    why: 'lien distribué + créateur Pro → pas de badge',
  },
];

for (const c of cases) {
  eq(`  ${c.why}`, shouldWatermark(c.input), c.expected);
}

/* ------------------------------------------------------------------ */
/* 2. Ce que la règle garantit, énoncé comme tel                        */
/* ------------------------------------------------------------------ */

console.log('\n=== 2. Invariants ===');

ok(
  'tout accès public pose le badge, quelle que soit la formule',
  shouldWatermark({ access: 'public', creatorWatermark: true }) &&
    shouldWatermark({ access: 'public', creatorWatermark: false }),
);

ok(
  'un accès distribué par un créateur Pro ne pose pas le badge',
  !shouldWatermark({ access: 'distributed', creatorWatermark: false }),
);

ok(
  'un créateur Free est marqué même sur son lien distribué',
  shouldWatermark({ access: 'distributed', creatorWatermark: true }),
);

/* ------------------------------------------------------------------ */
/* 3. Traduction en formule d'export                                    */
/* ------------------------------------------------------------------ */

console.log("\n=== 3. Formule passée à l'export ===");

eq(
  'public + Free → free',
  exportPlanFor({ access: 'public', creatorWatermark: true }),
  'free',
);
eq(
  'public + Pro → free (badge requis)',
  exportPlanFor({ access: 'public', creatorWatermark: false }),
  'free',
);
eq(
  'distribué + Free → free',
  exportPlanFor({ access: 'distributed', creatorWatermark: true }),
  'free',
);
eq(
  'distribué + Pro → creator (pas de badge)',
  exportPlanFor({ access: 'distributed', creatorWatermark: false }),
  'creator',
);

/* ------------------------------------------------------------------ */
/* 4. Cohérence avec les droits réels                                   */
/* ------------------------------------------------------------------ */

console.log('\n=== 4. Cohérence avec lib/plans.ts ===');

ok(
  "la formule 'free' n'a PAS le droit de retirer le badge",
  !hasFeature('free', 'no_watermark'),
);
ok(
  "la formule 'creator' A le droit de retirer le badge",
  hasFeature('creator', 'no_watermark'),
);
ok(
  'exportPlanFor() renvoie toujours une formule cohérente avec le badge',
  cases.every((c) => {
    const plan = exportPlanFor(c.input);
    return !hasFeature(plan, 'no_watermark') === c.expected;
  }),
);

/* ------------------------------------------------------------------ */
/* Bilan                                                                */
/* ------------------------------------------------------------------ */

console.log(
  `\n${failed === 0 ? 'TOUT EST VERT' : `${failed} ÉCHEC(S)`} — ${passed} contrôle(s) réussi(s), ${failed} échoué(s)\n`,
);

process.exit(failed === 0 ? 0 : 1);
