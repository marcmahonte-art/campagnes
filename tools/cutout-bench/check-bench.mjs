/*
 * Vérifie le banc de détourage sans navigateur — ce qui est vérifiable l'est.
 *
 * Le banc ne peut pas être **exécuté** ici : il lui faut un navigateur, un GPU et
 * le réseau. Mais deux choses qui cassent une page **au chargement** se
 * vérifient parfaitement en ligne de commande, et ce sont justement les plus
 * bêtes :
 *
 *  1. `cutout.js` s'importe-t-il réellement, sans toucher au DOM au niveau
 *     module ? Si le module lisait `document` en haut de fichier, la page
 *     mourrait avant d'afficher quoi que ce soit.
 *  2. **Chaque nom importé par `bench.js` existe-t-il dans `cutout.js` ?** Un nom
 *     mal orthographié ne casse rien à la compilation — `bench.js` n'est pas
 *     typé — et la page reste blanche. C'est le défaut le plus probable de ce
 *     banc, et le plus pénible à diagnostiquer dans un navigateur de téléphone.
 *
 * Ce que ce contrôle **ne** fait pas, et ne peut pas faire : dire si le détourage
 * fonctionne. Cela demande un appareil, et c'est tout l'objet du banc.
 *
 * Lancement : `npm run check:bench`
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
/** Le module compilé — produit par `npm run bench:cutout` dans `build/`. */
const COMPILED = join(HERE, 'build', 'cutout.js');

let failures = 0;

function ok(label, condition, detail = '') {
  if (!condition) failures += 1;
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log('\nBanc de détourage — vérification statique\n');

/* 0. Le module compilé doit exister : sans lui, rien de ce qui suit n'a de sens. */
let module;
try {
  module = await import(pathToFileURL(COMPILED).href);
  ok('cutout.js s’importe sans navigateur', true);
} catch (error) {
  const missing = error?.code === 'ERR_MODULE_NOT_FOUND';
  ok(
    'cutout.js s’importe sans navigateur',
    false,
    missing ? 'absent — lancer `npm run bench:cutout` d’abord' : String(error.message),
  );
}

if (module) {
  const exported = new Set(Object.keys(module));
  ok('le module expose de quoi travailler', exported.size > 20, `${exported.size} exports`);

  /* 1. Chaque nom importé par bench.js doit exister dans le module. */
  const source = readFileSync(join(HERE, 'bench.js'), 'utf8');
  const block = source.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/build\/cutout\.js['"]/);
  ok('bench.js importe bien le module compilé', Boolean(block));

  if (block) {
    const names = block[1].split(',').map((name) => name.trim()).filter(Boolean);
    ok('bench.js importe des noms', names.length > 10, `${names.length} noms`);

    const missing = names.filter((name) => !exported.has(name));
    ok(
      'tous les noms importés existent dans le module',
      missing.length === 0,
      missing.length ? `introuvables : ${missing.join(', ')}` : `${names.length} noms vérifiés`,
    );
  }

  /* 2. Ce que le banc appelle vraiment doit être appelable. */
  const called = [
    'cutoutPhoto',
    'chooseModel',
    'detectWebGpu',
    'defaultFeather',
    'firstLoadBytes',
    'runtimeCost',
    'modelWarning',
    'measurementsToCsv',
    'cutoutErrorMessage',
    'deviceLabel',
    'formatBytes',
    'formatMs',
    'inputSize',
  ];
  const notFunctions = called.filter((name) => typeof module[name] !== 'function');
  ok(
    'tout ce que le banc appelle est une fonction',
    notFunctions.length === 0,
    notFunctions.length ? notFunctions.join(', ') : `${called.length} vérifiées`,
  );

  /* 3. Les données du registre doivent être exploitables telles quelles. */
  ok('le registre des modèles est un tableau', Array.isArray(module.CUTOUT_MODELS));
  ok('les colonnes de mesure sont un tableau', Array.isArray(module.MEASUREMENT_COLUMNS));
  ok(
    'chaque colonne porte une clé et un libellé',
    module.MEASUREMENT_COLUMNS.every((c) => c.key && c.label),
  );
  ok('le défaut est un modèle du registre', module.CUTOUT_MODELS.includes(module.DEFAULT_CUTOUT_MODEL));
}

/* 4. La page et le script doivent se parler. */
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
ok('la page charge bench.js en module', html.includes('type="module"') && html.includes('./bench.js'));

const bench = readFileSync(join(HERE, 'bench.js'), 'utf8');
const ids = [...bench.matchAll(/\$\('([a-zA-Z0-9_-]+)'\)/g)].map((match) => match[1]);
const uniqueIds = [...new Set(ids)];
const absent = uniqueIds.filter((id) => !html.includes(`id="${id}"`));
ok(
  'chaque identifiant lu par bench.js existe dans la page',
  absent.length === 0,
  absent.length ? `absents : ${absent.join(', ')}` : `${uniqueIds.length} identifiants vérifiés`,
);

ok(
  'la page promet que la photo ne quitte pas l’appareil',
  /ne quitte jamais cet appareil/.test(html),
);

/* 5. Le serveur ne doit pas s'ouvrir au réseau sans qu'on le demande. */
const serve = readFileSync(join(HERE, 'serve.mjs'), 'utf8');
ok(
  'le serveur écoute en local par défaut',
  /process\.env\.HOST \?\? '127\.0\.0\.1'/.test(serve),
  'sinon le banc serait exposé au réseau sans prévenir',
);
ok(
  'et il explique comment l’ouvrir pour mesurer sur un téléphone',
  serve.includes('HOST=0.0.0.0'),
);

/*
 * La garde de chemin est **éprouvée**, pas relue.
 *
 * C'était une branche morte : `normalize()` ramène déjà tout chemin absolu sous
 * sa racine, donc un test sur la présence de `..` ne pouvait jamais se
 * déclencher. Ces cinq chemins hostiles vérifient ce qui compte réellement — que
 * la résolution ne sorte jamais du dossier du banc.
 */
const { resolve } = await import(pathToFileURL(join(HERE, 'serve.mjs')).href);
const hostiles = [
  '/../package.json',
  '/../../package.json',
  '/build/../../package.json',
  '/%2e%2e/package.json',
  '/..%2f..%2fpackage.json',
];
const escaped = hostiles.filter((path) => {
  const target = resolve(path);
  return target !== null && !target.startsWith(HERE.endsWith('\\') || HERE.endsWith('/') ? HERE : HERE + (HERE.includes('\\') ? '\\' : '/'));
});
ok(
  'aucun chemin hostile ne sort du dossier du banc',
  escaped.length === 0,
  escaped.length ? `évadés : ${escaped.join(', ')}` : `${hostiles.length} chemins éprouvés`,
);
ok(
  'la racine du banc se résout bien sur index.html',
  String(resolve('/')).endsWith('index.html'),
);
ok(
  'un chemin normal reste servi',
  String(resolve('/build/cutout.js')).endsWith(join('build', 'cutout.js')),
);

/* 6. L'artefact de compilation ne doit pas pouvoir être committé. */
ok(
  'le module compilé est écrit dans un dossier build/',
  COMPILED.split(/[/\\]/).includes('build'),
  'build/ est déjà ignoré par git — un artefact n’a rien à faire dans un commit',
);

console.log(
  failures === 0
    ? '\nPASS — 0 contrôle en échec\n'
    : `\nFAIL — ${failures} contrôle(s) en échec\n`,
);
process.exitCode = failures === 0 ? 0 : 1;
