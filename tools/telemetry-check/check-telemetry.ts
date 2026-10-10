/*
 * Contrôle de la télémétrie — `npm run check:telemetry`
 *
 * POURQUOI CE HARNAIS EXISTE
 *
 *   Le parcours participant manipule la photo de quelqu'un, et c'est exactement
 *   là qu'on veut mesurer. C'est donc là qu'une fuite est la plus facile à
 *   écrire : `emit('cutout_ok', { src: result.src })` tient sur une ligne, se
 *   relit sans déplaisir, et envoie une photo.
 *
 *   Le module `lib/telemetry.ts` répond par une liste **fermée** : chaque clé a
 *   ses valeurs, aucune n'est du texte libre, et une charge utile qui sort du
 *   cadre n'est pas filtrée — elle est **abandonnée**. Ce harnais éprouve cette
 *   promesse plutôt que de la commenter.
 *
 * CE QU'IL VÉRIFIE
 *
 *   1. le vocabulaire : cinq événements, et rien d'autre ;
 *   2. les clés inconnues — `src`, `photo`, `email`, `url` — sont refusées ;
 *   3. les valeurs hors liste sont refusées, y compris une URI de données
 *      glissée dans une clé pourtant légitime ;
 *   4. les nombres sont bornés, entiers, et refusent `NaN` comme `Infinity` ;
 *   5. la forme sérialisée ne porte aucun marqueur interdit et reste courte ;
 *   6. le **témoin négatif** : un constructeur naïf, lui, laisserait bien
 *      passer ce que `buildEvent()` refuse — sans quoi on ne saurait pas si le
 *      contrôle mesure quelque chose ;
 *   7. le puits : rien ne sort tant qu'aucun destinataire n'est branché, et un
 *      destinataire qui échoue ne casse pas le parcours ;
 *   8. les appels du parcours : les cinq moments sont émis, et **aucun** ne
 *      passe une clé qui ressemble à une photo.
 *
 * CE QU'IL NE VÉRIFIE PAS
 *
 *   Qu'un événement arrive quelque part : il n'y a **aucun** destinataire, et
 *   c'est délibéré. Choisir où va la mesure est une décision d'exploitation.
 *   Tant qu'elle n'est pas prise, rien ne quitte l'appareil — et c'est l'état
 *   que ce harnais constate (point 7).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  TELEMETRY_MAX_BYTES,
  buildEvent,
  emit,
  hasTelemetrySink,
  serializeEvent,
  setTelemetrySink,
  type TelemetryEvent,
} from '../../lib/telemetry';
import { cutoutFailureReason } from '../../lib/cutout';

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

function eq(label: string, actual: unknown, expected: unknown): void {
  ok(label, actual === expected, `attendu ${String(expected)}, obtenu ${String(actual)}`);
}

/**
 * La racine du dépôt, trouvée en remontant jusqu'au `package.json`.
 *
 * On ne compte pas les `..` : le harnais est compilé sous
 * `tools/<harnais>/build/tools/<harnais>/`, et un chemin relatif écrit à la main
 * se décale au premier changement de `outDir`.
 */
function racine(): string {
  let courant = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(courant, 'package.json'))) return courant;
    courant = dirname(courant);
  }
  throw new Error('racine du dépôt introuvable depuis ' + __dirname);
}

const RACINE = racine();

/** Une charge utile qui ressemble à ce qu'on ne veut pas voir partir. */
const PHOTO_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* ------------------------------------------------------------------ */
/* 1. Le vocabulaire                                                   */
/* ------------------------------------------------------------------ */

console.log('=== 1. Cinq événements, et rien d’autre ===');

const NOMS = ['journey_open', 'photo_imported', 'cutout_ok', 'cutout_failed', 'export_ok'] as const;

for (const nom of NOMS) {
  ok(`« ${nom} » est accepté`, buildEvent(nom) !== null);
}

ok(
  'un nom d’événement inconnu est refusé',
  buildEvent('page_view' as never) === null,
);

/* ------------------------------------------------------------------ */
/* 2. Les clés inconnues sont refusées                                 */
/* ------------------------------------------------------------------ */

console.log('\n=== 2. Une clé inconnue fait échouer tout l’événement ===');

const CLES_INTERDITES: Array<[string, unknown]> = [
  ['src', PHOTO_DATA_URL],
  ['photo', PHOTO_DATA_URL],
  ['photoSrc', PHOTO_DATA_URL],
  ['image', PHOTO_DATA_URL],
  ['email', 'participant@example.com'],
  ['url', 'https://exemple.test/c/mon-slug'],
  ['slug', 'mon-slug'],
  ['campaignName', 'Ma campagne'],
  ['message', 'TypeError: Failed to fetch'],
  ['detail', 'n’importe quoi'],
];

for (const [cle, valeur] of CLES_INTERDITES) {
  ok(
    `« ${cle} » est refusée`,
    buildEvent('photo_imported', { [cle]: valeur }) === null,
    'une clé inconnue ne doit pas être ignorée en silence',
  );
}

/* ------------------------------------------------------------------ */
/* 3. Les valeurs hors liste sont refusées                             */
/* ------------------------------------------------------------------ */

console.log('\n=== 3. Une valeur hors liste est refusée ===');

ok('kind valide', buildEvent('journey_open', { kind: 'background_frame' }) !== null);
ok('kind inconnu refusé', buildEvent('journey_open', { kind: 'autre_chose' }) === null);
ok('runtime valide', buildEvent('cutout_ok', { runtime: 'mediapipe' }) !== null);
ok('runtime inconnu refusé', buildEvent('cutout_ok', { runtime: 'onnx' }) === null);
ok('verdict valide', buildEvent('cutout_ok', { verdict: 'faible' }) !== null);
ok('verdict inconnu refusé', buildEvent('cutout_ok', { verdict: 'peut-être' }) === null);
ok('outcome valide', buildEvent('cutout_ok', { outcome: 'warn' }) !== null);
ok('outcome inconnu refusé', buildEvent('cutout_ok', { outcome: 'bof' }) === null);

/*
 * Le contrôle central : une URI de données glissée dans une clé **légitime**.
 * La clé existe, donc un contrôle qui ne regarderait que les noms de clés
 * laisserait passer. C'est la liste de valeurs qui l'arrête.
 */
ok(
  'une URI de données dans « reason » est refusée',
  buildEvent('cutout_failed', { reason: PHOTO_DATA_URL }) === null,
);
ok(
  'une URI de données dans « kind » est refusée',
  buildEvent('journey_open', { kind: PHOTO_DATA_URL }) === null,
);
ok(
  'une valeur non textuelle est refusée',
  buildEvent('cutout_ok', { verdict: 42 }) === null,
);

/* ------------------------------------------------------------------ */
/* 4. Les nombres sont bornés                                          */
/* ------------------------------------------------------------------ */

console.log('\n=== 4. Les nombres sont bornés et entiers ===');

ok('une durée normale passe', buildEvent('cutout_ok', { ms: 4200 }) !== null);
eq(
  'la durée est arrondie',
  buildEvent('cutout_ok', { ms: 4200.7 })?.ms,
  4201,
);
ok('une durée négative est refusée', buildEvent('cutout_ok', { ms: -1 }) === null);
ok('une durée démesurée est refusée', buildEvent('cutout_ok', { ms: 600_001 }) === null);
ok('NaN est refusé', buildEvent('cutout_ok', { ms: NaN }) === null);
ok('Infinity est refusé', buildEvent('cutout_ok', { ms: Infinity }) === null);
ok('une durée textuelle est refusée', buildEvent('cutout_ok', { ms: '4200' }) === null);

/* ------------------------------------------------------------------ */
/* 5. La forme sérialisée                                              */
/* ------------------------------------------------------------------ */

console.log('\n=== 5. La forme qui part ne porte aucun marqueur interdit ===');

const MARQUEURS = ['data:', 'blob:', '://', '@'];

const evenements: TelemetryEvent[] = [
  buildEvent('journey_open', { kind: 'background_frame' }),
  buildEvent('photo_imported', { kind: 'background_frame' }),
  buildEvent('cutout_ok', { runtime: 'mediapipe', verdict: 'ok', outcome: 'ok', ms: 2400 }),
  buildEvent('cutout_failed', { runtime: 'transformers', reason: 'network', ms: 12 }),
  buildEvent('export_ok', { kind: 'background_frame', ms: 900 }),
].filter((e): e is TelemetryEvent => e !== null);

eq('les cinq événements nominaux se construisent', evenements.length, 5);

for (const evenement of evenements) {
  const texte = serializeEvent(evenement);
  ok(`[${evenement.name}] se sérialise`, texte !== null);

  if (texte === null) continue;

  const marqueurs = MARQUEURS.filter((m) => texte.includes(m));
  eq(`[${evenement.name}] aucun marqueur interdit`, marqueurs.length, 0);
  ok(
    `[${evenement.name}] tient dans ${TELEMETRY_MAX_BYTES} octets`,
    texte.length <= TELEMETRY_MAX_BYTES,
    `${texte.length} octets`,
  );
}

/*
 * Le plus long événement possible : toutes les clés remplies, aux bornes. S'il
 * passait au-dessus du plafond, le plafond ne servirait à rien — il ne
 * s'appliquerait qu'aux événements déjà courts.
 */
const maximal = buildEvent('cutout_failed', {
  kind: 'background_frame',
  runtime: 'transformers',
  verdict: 'plein',
  outcome: 'unusable',
  reason: 'unknown',
  ms: 600_000,
});
ok('l’événement maximal se construit', maximal !== null);
const maximalTexte = maximal ? serializeEvent(maximal) : null;
ok(
  'l’événement maximal passe le plafond',
  maximalTexte !== null && maximalTexte.length <= TELEMETRY_MAX_BYTES,
  maximalTexte === null ? 'refusé' : `${maximalTexte.length} octets`,
);

/*
 * Le contrôle de marqueurs est une **seconde** serrure, et une seconde serrure
 * qu'on ne fait jamais forcer ne prouve rien : la liste blanche suffit
 * aujourd'hui, donc aucune charge utile normale ne l'atteindrait. On la met donc
 * à l'épreuve sur un événement fabriqué **à la main**, qui a franchi la liste
 * blanche par construction — c'est exactement le cas qu'elle est là pour
 * rattraper si un jour la liste blanche s'élargit.
 */
const forge = { name: 'export_ok', kind: PHOTO_DATA_URL } as unknown as TelemetryEvent;
ok(
  'une forme sérialisée porteuse d’un marqueur est refusée',
  serializeEvent(forge) === null,
  'la seconde serrure doit tenir même quand la première a cédé',
);

/* ------------------------------------------------------------------ */
/* 6. Témoin négatif : la garde mesure quelque chose                   */
/* ------------------------------------------------------------------ */

console.log('\n=== 6. Témoin négatif : un constructeur naïf laisse passer ===');

/*
 * Le constructeur qu'on écrirait sans y penser : il assemble les champs qu'on
 * lui donne et les sérialise. On lui présente **la même** charge utile qu'à
 * `buildEvent()`, et on exige qu'il produise, lui, une chaîne contenant la
 * photo.
 *
 * Sans ce témoin, les contrôles des points 2 et 3 seraient vrais même si la
 * fonction refusait tout — et on ne saurait pas distinguer une garde efficace
 * d'une garde qui bloque au hasard.
 */
function naif(nom: string, champs: Record<string, unknown>): string {
  return JSON.stringify({ name: nom, ...champs });
}

const naifTexte = naif('photo_imported', { src: PHOTO_DATA_URL });
ok(
  'le constructeur naïf, lui, transmet la photo',
  naifTexte.includes('data:image/png'),
  'sinon le témoin ne prouve rien',
);
ok(
  'et buildEvent refuse exactement la même charge utile',
  buildEvent('photo_imported', { src: PHOTO_DATA_URL }) === null,
);
ok(
  'la forme naîve serait refusée par le contrôle de marqueurs',
  MARQUEURS.some((m) => naifTexte.includes(m)),
);

/* ------------------------------------------------------------------ */
/* 7. Le puits : rien ne sort sans destinataire                        */
/* ------------------------------------------------------------------ */

console.log('\n=== 7. Aucun destinataire branché : rien ne quitte l’appareil ===');

setTelemetrySink(null);
eq('aucun destinataire par défaut', hasTelemetrySink(), false);

let recus = 0;
emit('journey_open', { kind: 'background_frame' });
eq('sans destinataire, rien n’est reçu', recus, 0);

const textes: string[] = [];
setTelemetrySink((_evenement, texte) => {
  recus += 1;
  textes.push(texte);
});
eq('un destinataire est maintenant branché', hasTelemetrySink(), true);

emit('journey_open', { kind: 'background_frame' });
eq('avec destinataire, l’événement est reçu', recus, 1);
ok(
  'le texte reçu ne porte aucun marqueur interdit',
  textes.every((t) => MARQUEURS.every((m) => !t.includes(m))),
);

// Une charge utile refusée n'atteint jamais le puits.
emit('photo_imported', { src: PHOTO_DATA_URL });
eq('une charge utile refusée n’est pas transmise', recus, 1);

// Un destinataire qui échoue ne doit pas casser le parcours.
setTelemetrySink(() => {
  throw new Error('le destinataire est en panne');
});
let leve = false;
try {
  emit('export_ok', { kind: 'background_frame' });
} catch {
  leve = true;
}
ok('un destinataire en panne ne fait pas échouer l’appel', !leve);

setTelemetrySink(null);
eq('le destinataire se débranche', hasTelemetrySink(), false);

/* ------------------------------------------------------------------ */
/* 8. Les appels du parcours                                           */
/* ------------------------------------------------------------------ */

console.log('\n=== 8. Le parcours émet les cinq moments, sans clé suspecte ===');

const moduleTelemetrie = readFileSync(join(RACINE, 'lib/telemetry.ts'), 'utf8');
ok(
  'le module n’a aucun import de valeur',
  !/^\s*import\s+(?!type\b)/m.test(moduleTelemetrie),
  'il doit se charger partout, y compris dans un harnais',
);

const parcours = readFileSync(
  join(RACINE, 'components/participant/participant-journey.tsx'),
  'utf8',
);

for (const nom of NOMS) {
  ok(
    `le parcours émet « ${nom} »`,
    parcours.includes(`emit('${nom}'`),
  );
}

/**
 * Les champs de chaque appel `emit(...)`, extraits par parenthèses équilibrées.
 *
 * On ne cherche **pas** les clés interdites dans tout le fichier : le parcours
 * manipule évidemment `photo.src` ailleurs, et un contrôle qui les confondrait
 * serait vert quoi qu'il arrive. On ne regarde que ce qui est réellement passé
 * à `emit()`.
 */
function champsEmis(source: string): string[] {
  const sortie: string[] = [];
  let index = source.indexOf('emit(');
  while (index !== -1) {
    let i = index + 'emit('.length;
    let profondeur = 1;
    const debut = i;
    while (i < source.length && profondeur > 0) {
      const c = source[i];
      if (c === '(') profondeur += 1;
      else if (c === ')') profondeur -= 1;
      i += 1;
    }
    const args = source.slice(debut, i - 1);
    // On écarte le premier argument (le nom de l'événement) : « photo_imported »
    // contient « photo », et le confondre avec une clé ferait un faux positif.
    const virgule = args.indexOf(',');
    sortie.push(virgule === -1 ? '' : args.slice(virgule + 1));
    index = source.indexOf('emit(', i);
  }
  return sortie;
}

const champs = champsEmis(parcours);
/*
 * On exige **au moins** cinq appels, un par moment, et pas exactement cinq :
 * plusieurs moments ont plusieurs chemins (`photo_imported` est émis aussi bien
 * après un détourage qu'après un accord, `cutout_failed` aussi bien sur un
 * masque vide que sur une exception). Ce qui compte est que **tous** les appels
 * trouvés soient inspectés — c'est ce que fait le contrôle suivant.
 */
ok(
  'au moins un appel par moment est trouvé',
  champs.length >= NOMS.length,
  `${champs.length} appels trouvés`,
);

const SUSPECTS = ['src', 'photo', 'blob', 'base64', 'data:', 'email', 'token', 'url', 'href'];
const fautifs = champs.filter((c) => SUSPECTS.some((s) => c.includes(s)));
eq(
  'aucun appel n’est suivi d’une clé qui ressemble à une photo',
  fautifs.length,
  0,
);
if (fautifs.length > 0) {
  for (const f of fautifs) console.log(`       champ suspect : ${f.trim()}`);
}

/* ------------------------------------------------------------------ */
/* 9. Les raisons viennent du détourage, et y restent couvertes        */
/* ------------------------------------------------------------------ */

console.log('\n=== 9. Les raisons de panne sont transmissibles ===');

const ERREURS: Array<[string, unknown]> = [
  ['memory', 'Aborted: out of memory'],
  ['timeout', 'Operation timed out'],
  ['network', 'TypeError: Failed to fetch'],
  ['gpu', 'requestAdapter returned null (webgpu)'],
  ['image', 'Could not decode image'],
  ['unknown', '???'],
];

for (const [attendu, erreur] of ERREURS) {
  const raison = cutoutFailureReason(erreur);
  eq(`« ${String(erreur)} » donne la raison ${attendu}`, raison, attendu);
  ok(
    `la raison « ${raison} » est acceptée par la télémétrie`,
    buildEvent('cutout_failed', { reason: raison }) !== null,
    'sinon la panne la plus fréquente serait silencieuse',
  );
}

/*
 * Et le message brut, lui, n'est jamais transmissible — c'est la raison d'être
 * de `cutoutFailureReason()`.
 */
ok(
  'le message brut d’une panne n’est pas transmissible',
  buildEvent('cutout_failed', { reason: 'TypeError: Failed to fetch' }) === null,
);

/* ------------------------------------------------------------------ */
/* Bilan                                                              */
/* ------------------------------------------------------------------ */

console.log(
  `\n${failed === 0 ? 'TOUT EST VERT' : `${failed} ÉCHEC(S)`} — ${passed} contrôle(s) réussi(s), ${failed} échoué(s)\n`,
);

process.exit(failed === 0 ? 0 : 1);
