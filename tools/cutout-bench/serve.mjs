/*
 * Sert le banc de détourage.
 *
 * Pourquoi un serveur, alors que le banc est une simple page : **les modules ES
 * ne se chargent pas en `file://`**. Le navigateur refuse l'import d'un fichier
 * local depuis un document local (origine opaque). Sans serveur, `bench.js` ne
 * pourrait pas importer `cutout.js`, et le banc ne mesurerait rien.
 *
 * Aucune dépendance : `node:http` et `node:fs` suffisent, et le dépôt garde ses
 * dépendances légères. Le banc ne doit rien coûter à installer.
 *
 * Lancement : `npm run bench:cutout:serve`
 *
 * Par défaut le serveur n'écoute que sur `127.0.0.1` — la machine locale. Pour
 * mesurer **sur un téléphone**, il faut l'ouvrir au réseau local :
 *
 *     HOST=0.0.0.0 PORT=8788 npm run bench:cutout:serve
 *
 * puis ouvrir `http://<adresse-IP-locale-de-cet-ordinateur>:8788` depuis le
 * téléphone. Attention : dans ce mode, **toute personne du même réseau** peut
 * ouvrir la page. C'est acceptable pour un banc de mesure sur un réseau de
 * confiance, et à refermer aussitôt la mesure finie.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8788);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Résout un chemin d'URL sous ROOT, ou `null` s'il tente d'en sortir.
 *
 * Ce qui protège réellement, et qu'il faut comprendre avant de « simplifier » :
 * `normalize()` ramène tout chemin absolu sous sa racine — `/../package.json`
 * devient `/package.json`, et `/build/../../package.json` aussi. Un `..` **ne
 * peut pas survivre** à cette étape, parce que la chaîne commence toujours par
 * `/` (forme-origine d'une requête HTTP). Puis `join()` n'ajoute jamais au-dessus
 * de son premier argument.
 *
 * La vérification de confinement est donc **redondante aujourd'hui**, et c'est
 * assumé : elle ne protège pas contre le code actuel mais contre la modification
 * la plus plausible du code actuel — remplacer `join` par `path.resolve()`, ou
 * passer `decoded` au lieu de `relative`. Les deux casseraient le confinement, et
 * la ligne ci-dessous le rattraperait. `check-bench.mjs` éprouve la propriété
 * observable (aucun chemin hostile ne sort du dossier) plutôt que de relire cette
 * ligne, parce qu'une garde qu'on ne peut pas éprouver ne garde rien.
 *
 * Exportée pour être testable : `check-bench.mjs` l'importe, et la garde
 * `launched` en bas de fichier évite qu'un simple import ouvre un port.
 */
export function resolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = normalize(decoded === '/' ? '/index.html' : decoded).replace(/^[/\\]+/, '');
  const target = join(ROOT, relative);
  const root = ROOT.endsWith(sep) ? ROOT : ROOT + sep;
  return target.startsWith(root) ? target : null;
}

const server = createServer(async (request, response) => {
  const target = resolve(request.url ?? '/');

  if (!target) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Chemin refusé.');
    return;
  }

  try {
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      // Le banc se recharge souvent : aucun cache, sinon on mesure l'ancien code.
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(
      `Introuvable : ${target}\n\n` +
        "Avez-vous lancé `npm run bench:cutout` ? Il compile `lib/cutout.ts` en " +
        '`tools/cutout-bench/cutout.js`, sans lequel la page ne peut rien mesurer.\n',
    );
  }
});

/*
 * Le serveur ne démarre que si ce fichier est **lancé**, pas s'il est importé.
 * Sans cette garde, `check-bench.mjs` ne pourrait pas tester `resolve()` : le
 * simple fait de l'importer ouvrirait un port. C'est ce qui rend la garde de
 * chemin éprouvable au lieu d'être crue sur parole.
 */
const launched = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (launched) {
  server.listen(PORT, HOST, () => {
    console.log('');
    console.log(`  Banc de détourage — http://${HOST}:${PORT}`);
    console.log('');
    if (HOST === '127.0.0.1') {
      console.log('  Accessible depuis cet ordinateur seulement.');
      console.log('  Pour mesurer sur un téléphone du même réseau :');
      console.log('    HOST=0.0.0.0 PORT=8788 npm run bench:cutout:serve');
      console.log('    puis ouvrir http://<IP-locale-de-cet-ordinateur>:' + PORT);
      console.log('  (dans ce mode, toute personne du même réseau peut ouvrir la page)');
    } else {
      console.log(`  Ouvert au réseau local sur le port ${PORT}. À refermer après la mesure.`);
    }
    console.log('');
  });
}
