/*
 * Contrôle du clip vidéo participant — durée, fenêtre, géométrie.
 *
 * Pourquoi ce harnais existe : le parcours vidéo réutilise **toute** la
 * géométrie du parcours photo. Une seule valeur fausse suffit donc à faire
 * diverger deux choses que le participant croit identiques :
 *
 *   1. la **fenêtre retenue** — l'aperçu, la progression et le rendu doivent
 *      décrire le même extrait. Si le calcul divergeait, le participant
 *      verrait 30 secondes à l'écran et en téléchargerait 28, ou l'inverse ;
 *   2. la **géométrie** — le clip n'est pas une photo, mais il doit se placer
 *      exactement comme une photo de mêmes dimensions. C'est ce qui permet de
 *      ne pas dupliquer `photoSize`, `clampPlacement` et `initialPlacement`.
 *
 * On vérifie donc, en exécutant réellement le code :
 *   — les bornes de durée : un clip ne dépasse jamais 30 s, une source plus
 *     longue n'est jamais refusée mais bornée ;
 *   — les cas dégénérés (durée inconnue, négative, NaN) qui ne doivent jamais
 *     produire une fenêtre vide ni une exception ;
 *   — que `pseudoPhoto()` produit la même géométrie qu'une photo de mêmes
 *     dimensions — la propriété dont dépend tout le placement ;
 *   — le premier filtre de type de fichier, qui n'est qu'un filtre et doit le
 *     rester (un type MIME est déclaratif, donc souvent faux sur mobile).
 *
 * Ce harnais ne teste **pas** le rendu : il n'y a pas de navigateur ici. Le
 * rendu lui-même est couvert par `check:frame-render` côté serveur, et par
 * vérification manuelle côté navigateur.
 *
 * Lancement : `npm run check:video-clip`
 */
import {
  CLIP_STEP_MS,
  MAX_CLIP_MS,
  TRANSPARENT_PIXEL,
  clampClipStart,
  clipWindow,
  fitsWithinLimit,
  formatClipDuration,
  knownDuration,
  looksLikeVideo,
  maxClipStart,
  pseudoPhoto,
  type ParticipantVideo,
} from '../../lib/video-clip';
import { initialPlacement, photoSize, type ParticipantPhoto } from '../../lib/participant';
import type { PhotoZone } from '../../lib/descriptor';

let failures = 0;

function ok(label: string, condition: boolean, detail = ''): void {
  if (!condition) failures += 1;
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

function eq(label: string, actual: unknown, expected: unknown): void {
  ok(label, actual === expected, `attendu ${String(expected)}, obtenu ${String(actual)}`);
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** Zone 1:1 pleine, comme un cadre transparent en mode Cadre. */
const zone: PhotoZone = { x: 0, y: 0, w: 1080, h: 1080 };

function clip(width: number, height: number, durationMs: number): ParticipantVideo {
  return { src: 'blob:local', width, height, durationMs, hasAudio: true };
}

/* ------------------------------------------------------------------ */
/* Contrôles                                                           */
/* ------------------------------------------------------------------ */

function main(): void {
  console.log('\nClip vidéo participant — durée, fenêtre, géométrie\n');

  /* ---------------- 1. Durée connue ---------------- */
  {
    eq('une durée de 12 s est retenue telle quelle', knownDuration(12_000), 12_000);
    eq('une durée fractionnaire est arrondie vers le bas', knownDuration(30_000.9), 30_000);
    eq('une durée nulle est inconnue', knownDuration(0), null);
    eq('une durée négative est inconnue', knownDuration(-1), null);
    eq('une durée NaN est inconnue', knownDuration(Number.NaN), null);
    eq('une durée infinie est inconnue', knownDuration(Number.POSITIVE_INFINITY), null);
  }

  /* ---------------- 2. Plafond de 30 s ---------------- */
  {
    eq('la limite est de 30 secondes', MAX_CLIP_MS, 30_000);
    eq('une source courte ne se décale pas', maxClipStart(20_000), 0);
    eq('une source de 45 s se décale de 15 s', maxClipStart(45_000), 15_000);
    eq('une source de 2 min se décale de 90 s', maxClipStart(120_000), 90_000);
    eq('une durée inconnue ne propose aucun décalage', maxClipStart(Number.NaN), 0);

    ok('une source de 30 s pile tient', fitsWithinLimit(30_000));
    ok('une source de 30,001 s ne tient pas', !fitsWithinLimit(30_001));
    ok('une source de 12 s tient', fitsWithinLimit(12_000));
    ok('une durée inconnue ne « tient » pas', !fitsWithinLimit(Number.NaN));
  }

  /* ---------------- 3. Bornage du début ---------------- */
  {
    eq('un début négatif retombe à zéro', clampClipStart(120_000, -5), 0);
    eq('un début au-delà du maximum est ramené', clampClipStart(120_000, 200_000), 90_000);
    eq('un début valide est arrondi à l’unité', clampClipStart(120_000, 45_000.6), 45_001);
    eq('un début NaN retombe à zéro', clampClipStart(120_000, Number.NaN), 0);
    eq('un début sur une source courte reste zéro', clampClipStart(10_000, 5_000), 0);
  }

  /* ---------------- 4. Fenêtre rendue ---------------- */
  {
    const short = clipWindow(20_000, 0);
    eq('une source courte occupe toute sa durée', short.durationMs, 20_000);
    eq('elle commence au début', short.startMs, 0);
    eq('elle finit à la fin de la source', short.endMs, 20_000);

    const full = clipWindow(120_000, 0);
    eq('une source longue rend exactement 30 s', full.durationMs, 30_000);
    eq('la fenêtre par défaut part du début', `${full.startMs}-${full.endMs}`, '0-30000');

    const late = clipWindow(120_000, 90_000);
    eq('la dernière fenêtre est pleine', late.durationMs, 30_000);
    eq('elle finit exactement à la fin de la source', late.endMs, 120_000);

    const past = clipWindow(120_000, 500_000);
    eq('un début hors bornes rend la dernière fenêtre', past.startMs, 90_000);

    const odd = clipWindow(45_000, 20_000);
    eq('un début au-delà du maximum est ramené', odd.startMs, 15_000);
    eq('la fenêtre reste donc pleine', odd.durationMs, 30_000);
    eq('et elle finit à la fin de la source', odd.endMs, 45_000);

    const within = clipWindow(45_000, 5_000);
    eq('un début valide décale la fenêtre', `${within.startMs}-${within.endMs}`, '5000-35000');
    eq('la fenêtre décalée fait toujours 30 s', within.durationMs, 30_000);

    /*
     * L'invariant qui rend le curseur sûr : **toute** position atteignable rend
     * un clip plein de 30 s. Si c'était faux, le participant pourrait régler le
     * curseur au maximum et obtenir un clip plus court que ce que l'interface
     * annonce — exactement le genre d'écart que ce parcours ne doit pas avoir.
     */
    ok(
      'toute position du curseur rend un clip plein',
      [30_000, 31_000, 45_000, 60_000, 120_000, 3_600_000].every((total) => {
        const max = maxClipStart(total);
        return [0, Math.round(max / 2), max].every(
          (start) => clipWindow(total, start).durationMs === MAX_CLIP_MS,
        );
      }),
    );

    const unknown = clipWindow(Number.NaN, 4_000);
    ok(
      'une durée inconnue rend une fenêtre nominale, jamais vide',
      unknown.durationMs === MAX_CLIP_MS && unknown.startMs === 0,
      JSON.stringify(unknown),
    );

    ok(
      'aucune fenêtre ne dépasse jamais la limite',
      [0, 1, 5_000, 29_999, 30_000, 30_001, 90_000, 120_000, 3_600_000].every(
        (total) => clipWindow(total, 0).durationMs <= MAX_CLIP_MS,
      ),
    );

    ok(
      'aucune fenêtre n’a une durée négative',
      [0, 1, 999, 30_000, 120_000].every(
        (total) =>
          [0, 1, 15_000, 90_000, 999_999].every(
            (start) => clipWindow(total, start).durationMs >= 0,
          ),
      ),
    );

    eq('le pas du curseur est de 100 ms', CLIP_STEP_MS, 100);
    eq('le pas divise exactement la limite', MAX_CLIP_MS % CLIP_STEP_MS, 0);
  }

  /* ---------------- 5. Durée lisible ---------------- */
  {
    eq('zéro s’écrit 0:00', formatClipDuration(0), '0:00');
    eq('30 s s’écrit 0:30', formatClipDuration(30_000), '0:30');
    eq('65 s s’écrit 1:05', formatClipDuration(65_000), '1:05');
    eq('2 min s’écrit 2:00', formatClipDuration(120_000), '2:00');
    eq('une durée négative ne casse pas l’affichage', formatClipDuration(-500), '0:00');
  }

  /* ---------------- 6. Géométrie : le clip est une photo ---------------- */
  {
    const video = clip(1920, 1080, 20_000);
    const pseudo = pseudoPhoto(video);

    eq('la photo de substitution reprend la largeur de la vidéo', pseudo.naturalWidth, 1920);
    eq('la photo de substitution reprend la hauteur de la vidéo', pseudo.naturalHeight, 1080);
    eq('elle ne porte aucune image réelle', pseudo.src, TRANSPARENT_PIXEL);
    ok(
      'le pixel de substitution est une URL de données valide',
      TRANSPARENT_PIXEL.startsWith('data:image/gif;base64,'),
    );

    /*
     * La propriété qui compte : une vidéo se place **exactement** comme une
     * photo de mêmes dimensions. C'est ce qui permet au parcours vidéo de
     * réutiliser `photoSize`, `clampPlacement` et `initialPlacement` sans les
     * réécrire — donc de ne pas pouvoir diverger du parcours photo.
     */
    const asPhoto: ParticipantPhoto = {
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
      naturalWidth: 1920,
      naturalHeight: 1080,
    };

    for (const zoom of [0.2, 0.5, 1, 1.7, 5]) {
      const fromVideo = photoSize(pseudo, zone, zoom);
      const fromPhoto = photoSize(asPhoto, zone, zoom);
      ok(
        `la couverture à ${zoom}× est identique à celle d’une photo`,
        fromVideo.w === fromPhoto.w && fromVideo.h === fromPhoto.h,
        `${JSON.stringify(fromVideo)} vs ${JSON.stringify(fromPhoto)}`,
      );
    }

    const startVideo = initialPlacement(pseudo, zone);
    const startPhoto = initialPlacement(asPhoto, zone);
    ok(
      'le cadrage de départ est identique à celui d’une photo',
      startVideo.zoom === startPhoto.zoom &&
        startVideo.x === startPhoto.x &&
        startVideo.y === startPhoto.y,
      `${JSON.stringify(startVideo)} vs ${JSON.stringify(startPhoto)}`,
    );

    /* Un format vertical, pour ne pas ne tester qu’un seul cas. */
    const vertical = pseudoPhoto(clip(1080, 1920, 20_000));
    const verticalZone: PhotoZone = { x: 0, y: 0, w: 1080, h: 1920 };
    const fitted = photoSize(vertical, verticalZone, 1);
    ok(
      'un clip vertical couvre la zone verticale sans laisser de vide',
      fitted.w >= verticalZone.w - 1e-6 && fitted.h >= verticalZone.h - 1e-6,
      JSON.stringify(fitted),
    );
  }

  /* ---------------- 7. Premier filtre de fichier ---------------- */
  {
    const file = (name: string, type: string) => new File([], name, { type });

    ok('un MP4 déclaré est accepté', looksLikeVideo(file('clip.mp4', 'video/mp4')));
    ok('un type vidéo inconnu est accepté', looksLikeVideo(file('x.bin', 'video/x-matroska')));
    ok('une image déclarée est refusée', !looksLikeVideo(file('photo.png', 'image/png')));
    ok('un PDF est refusé', !looksLikeVideo(file('doc.pdf', 'application/pdf')));

    /* Type MIME absent : on retombe sur l’extension, sans jamais filtrer dessus
       comme d’une vérité — la vraie validation est la lecture des métadonnées. */
    ok('un MOV sans type est reconnu par son extension', looksLikeVideo(file('clip.MOV', '')));
    ok('un WebM sans type est reconnu par son extension', looksLikeVideo(file('clip.webm', '')));
    ok('un JPEG sans type reste refusé', !looksLikeVideo(file('photo.jpg', '')));
    ok('un fichier sans extension reste refusé', !looksLikeVideo(file('sansnom', '')));
  }

  console.log(
    `\n${failures === 0 ? 'PASS' : 'ÉCHEC'} — ${failures} contrôle${failures > 1 ? 's' : ''} en échec\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
