/**
 * SPIKE — Peut-on composer un cadre côté serveur ?
 *
 * Question posée : vendre un pass « sans filigrane » n'a de sens que si le
 * badge est décidé **et** appliqué hors du navigateur. Aujourd'hui tout se joue
 * dans le client (`participant-journey.tsx` calcule le plan, `lib/video-export.ts`
 * dessine le badge). Ce spike ne livre rien : il répond par la mesure.
 *
 * Ce qu'il vérifie
 *   1. `fabric/node` produit-il un PNG, et en combien de temps ? (10 s en Hobby)
 *   2. Les assets publics se chargent-ils depuis le disque ?
 *   3. Le badge partagé (`lib/watermark.addBadge`) rend-il son **logo** ?
 *   4. Le pipeline complet `exportPng()` tourne-t-il, avec et sans badge ?
 *   5. Une forme **tracée** (chemin de courbes) se dessine-t-elle vraiment, ou
 *      disparaît-elle en silence ? C'est la seule couverture de cette famille
 *      sur le chemin du rendu payant (`/api/passes/export`).
 *
 * Si le 4 passe, le rendu serveur réutilise **le même code** que l'aperçu — la
 * règle du projet est respectée et le pass devient défendable.
 *
 * Sorties : `out-raw.png`, `out-badge.png`, `out-free.png`, `out-creator.png`,
 * `out-traced.png`.
 */

import { writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Importés **statiquement** : `tsc` ne suit pas les `require()` dont le chemin
 * est calculé à l'exécution, donc les modules partagés ne seraient pas compilés
 * dans `build/lib` — un faux négatif qui n'aurait rien appris.
 */
import { setFabricRuntime } from '../../lib/fabric-runtime';
import { setAssetResolver } from '../../lib/render/assets';
import { addBadge } from '../../lib/watermark';
import { exportPng } from '../../lib/video-export';

/** Racine du dépôt : on exécute toujours depuis là. */
const ROOT = process.cwd();

const results: Array<{ label: string; ok: boolean; detail: string }> = [];

function record(label: string, ok: boolean, detail: string) {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? '\u2713' : '\u2717'} ${label}\n      ${detail}`);
}

function writePng(name: string, dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const buffer = Buffer.from(base64, 'base64');
  writeFileSync(join(__dirname, name), buffer);
  return buffer.length;
}

/**
 * Le résolveur d'assets du serveur.
 *
 * `/logo-dark.png` devient un `file://` vers `public/`. Le chemin absolu seul
 * échoue : node-canvas refuse le schéma `c:`.
 */
function serverAssetResolver(src: string): string {
  if (!src.startsWith('/')) return src;
  return `file:///${join(ROOT, 'public', src).replace(/\\/g, '/')}`;
}

/* =====================================================================
 * 1. Le rendu brut
 * ===================================================================== */
async function testRawRender() {
  console.log('\n1. Rendu brut (fabric/node + node-canvas)');

  let fabric: any;
  try {
    fabric = require('fabric/node');
    record('fabric/node importable', true, 'ok');
  } catch (err) {
    record('fabric/node importable', false, err instanceof Error ? err.message : String(err));
    return null;
  }

  const started = Date.now();
  try {
    const canvas = new fabric.StaticCanvas(undefined, {
      width: 1080,
      height: 1080,
      backgroundColor: '#101010',
      enableRetinaScaling: false,
      renderOnAddRemove: false,
    });
    canvas.add(new fabric.Rect({ left: 100, top: 100, width: 400, height: 300, fill: '#7B61FF' }));
    canvas.add(new fabric.Textbox('Campagnes', { left: 100, top: 500, width: 800, fontSize: 90, fill: '#ffffff', fontFamily: 'Inter' }));
    canvas.renderAll();

    const bytes = writePng('out-raw.png', canvas.toDataURL({ format: 'png' }));
    const ms = Date.now() - started;
    record('PNG produit', bytes > 1000, `${bytes} octets en ${ms} ms`);
    record('délai compatible serverless', ms < 10_000, `${ms} ms (limite Hobby 10 000 ms)`);
    return fabric;
  } catch (err) {
    record('PNG produit', false, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/* =====================================================================
 * 2. Assets publics
 * ===================================================================== */
async function testAssets(fabric: any) {
  console.log('\n2. Assets publics');

  const logoPath = join(ROOT, 'public', 'logo-dark.png');
  if (!existsSync(logoPath)) {
    record('logo du badge présent', false, `introuvable : ${logoPath}`);
    return;
  }
  record('logo du badge présent', true, logoPath);

  try {
    const image = await fabric.FabricImage.fromURL(serverAssetResolver('/logo-dark.png'));
    record('image chargée via file://', Boolean(image), `${image?.width}x${image?.height}`);
  } catch (err) {
    record('image chargée via file://', false, err instanceof Error ? err.message : String(err));
  }
}

/* =====================================================================
 * 3. Le badge partagé, avec son logo
 * ===================================================================== */
async function testBadge(fabric: any) {
  console.log('\n3. Badge partagé (lib/watermark)');

  try {
    const canvas = new fabric.StaticCanvas(undefined, {
      width: 1080,
      height: 1080,
      backgroundColor: '#ffffff',
      enableRetinaScaling: false,
      renderOnAddRemove: false,
    });
    await addBadge(canvas, 1080, 1080);
    canvas.renderAll();

    const objects = canvas.getObjects();
    const hasLogo = objects.some((o: any) => o.type === 'image');
    const bytes = writePng('out-badge.png', canvas.toDataURL({ format: 'png' }));

    record('addBadge rendu côté serveur', bytes > 1000, `${bytes} octets, ${objects.length} objet(s)`);
    record(
      'le logo du badge est présent',
      hasLogo,
      hasLogo ? 'le badge est identique à celui du navigateur' : 'dégradation : le logo n’a pas chargé',
    );
  } catch (err) {
    record('addBadge rendu côté serveur', false, err instanceof Error ? err.message : String(err));
  }
}

/* =====================================================================
 * 4. Le pipeline complet
 * ===================================================================== */
async function testPipeline() {
  console.log('\n4. Pipeline complet (lib/video-export.exportPng)');

  const descriptor: any = {
    version: 1,
    ratio: '1:1',
    background: '#ffffff',
    layers: [
      { id: 'shp1', type: 'shape', shape: 'rect', x: 0.08, y: 0.08, w: 0.84, h: 0.3, z: 10, rotation: 0, opacity: 1, fill: '#7B61FF' },
      { id: 'txt1', type: 'text', text: 'SIAO 2026', font: 'Inter', size: 72, x: 0.1, y: 0.5, w: 0.8, h: 0.2, z: 20, rotation: 0, opacity: 1 },
    ],
    motion: null,
  };

  for (const [plan, file, badge] of [
    ['free', 'out-free.png', 'attendu'],
    ['creator', 'out-creator.png', 'absent'],
  ] as Array<[string, string, string]>) {
    const started = Date.now();
    try {
      const dataUrl = await exportPng({ descriptor, plan });
      const bytes = writePng(file, dataUrl);
      const ms = Date.now() - started;
      record(`exportPng plan « ${plan} »`, bytes > 1000, `${bytes} octets en ${ms} ms — badge ${badge}`);
    } catch (err) {
      record(`exportPng plan « ${plan} »`, false, err instanceof Error ? err.message : String(err));
    }
  }

  const freePath = join(__dirname, 'out-free.png');
  const creatorPath = join(__dirname, 'out-creator.png');
  if (existsSync(freePath) && existsSync(creatorPath)) {
    const a = statSync(freePath).size;
    const b = statSync(creatorPath).size;
    record(
      'les deux rendus diffèrent (le badge change le fichier)',
      a !== b,
      `free ${a} octets vs creator ${b} octets`,
    );
  }

  /*
   * Une forme tracée — un chemin de courbes, pas un polygone — doit se dessiner
   * côté serveur, et pas disparaître en silence. On rend le même cadre avec et
   * sans elle : si les deux fichiers sortent identiques, c'est que le chemin
   * n'a rien produit, et un participant qui a payé recevrait un visuel sans sa
   * forme. La comparaison est le seul verdict fiable : un `Path` qui échoue à
   * s'analyser ne lève pas, il ne dessine simplement rien.
   */
  const tracedLayer = {
    id: 'shp-traced',
    type: 'shape',
    kind: 'hill',
    x: 100,
    y: 700,
    w: 800,
    h: 300,
    z: 30,
    rotation: 0,
    opacity: 1,
    fill: '#111111',
    stroke: 'transparent',
    strokeWidth: 0,
    radius: 0,
  };

  try {
    const withTraced = await exportPng({
      descriptor: { ...descriptor, layers: [...descriptor.layers, tracedLayer] },
      plan: 'creator',
    });
    const without = await exportPng({ descriptor, plan: 'creator' });
    const bytes = writePng('out-traced.png', withTraced);
    record(
      'une forme tracée se dessine côté serveur',
      withTraced !== without && bytes > 1000,
      withTraced === without
        ? `${bytes} octets — fichier IDENTIQUE à celui sans la forme : rien n'a été dessiné`
        : `${bytes} octets — le fichier change bien quand la forme est présente`,
    );
  } catch (err) {
    record(
      'une forme tracée se dessine côté serveur',
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/* ===================================================================== */

async function main() {
  console.log('SPIKE — rendu serveur du cadre');
  console.log('==============================');

  /*
   * Le registre est rempli **avant** tout rendu : à partir d'ici, les fabriques
   * partagées utilisent le build node. Dans le navigateur, rien n'est enregistré
   * et elles gardent le build navigateur — aucun changement de comportement.
   */
  setFabricRuntime(require('fabric/node'));
  setAssetResolver(serverAssetResolver);

  const fabric = await testRawRender();
  if (fabric) {
    await testAssets(fabric);
    await testBadge(fabric);
  }
  await testPipeline();

  const failed = results.filter((r) => !r.ok);
  console.log('\n==============================');
  console.log(`${results.length - failed.length}/${results.length} vérifications passées`);
  for (const f of failed) console.log(`  \u2717 ${f.label} — ${f.detail}`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

void main();
