/*
 * Génère un portrait de test — `node tools/cutout-journey-check/make-portrait.cjs`
 *
 * POURQUOI UN PORTRAIT SYNTHÉTIQUE
 *
 *   Le contrôle du parcours détouré doit faire traverser au participant les
 *   états réels : accord de connexion facturée, progression, verdict, panneau
 *   de réglages. Pour ça il faut **une photo**, déposée dans le vrai champ de
 *   fichier du parcours.
 *
 *   Aucune photo de personne réelle ne peut servir ici : elle serait versionnée
 *   dans le dépôt. Ce portrait est donc **dessiné** — un buste qui occupe la
 *   majorité du cadre, ce qu'un détourage reconnaît comme un sujet.
 *
 * CE QUE CE PORTRAIT NE PERMET PAS DE JUGER
 *
 *   La qualité du contour. Un visage dessiné n'a ni cheveux fins, ni
 *   transparence, ni arrière-plan complexe : c'est précisément ce qui se juge
 *   sur un téléphone, avec une vraie photo (phase 1, point 9). Ce fichier sert
 *   à prouver que **la chaîne tourne et que les écrans s'affichent**, pas que
 *   le masque est beau.
 *
 * Le PNG est écrit dans `tools/cutout-journey-check/fixtures/`, un dossier
 * volontairement laissé hors des captures versionnées.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const W = 720;
const H = 960;

/** Un buffer RGBA plat, rempli par une fonction de dessin. */
function render(pixel) {
  const raw = Buffer.alloc(H * (W * 4 + 1));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (W * 4 + 1);
    raw[rowStart] = 0; // filtre PNG : aucun
    for (let x = 0; x < W; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = rowStart + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }

  const chunks = [];
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    chunks.push(len, body, crc);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RGBA
  chunk('IHDR', ihdr);
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 }));
  chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/** Mélange deux couleurs, `t` allant de 0 (a) à 1 (b). */
const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const SKIN = [232, 190, 160];
const HAIR = [58, 44, 38];
const SHIRT = [58, 84, 140];
const WALL = [226, 214, 198];

function pixel(x, y) {
  const cx = W / 2;
  // Fond : un mur uni légèrement dégradé, ce qu'un détourage doit écarter.
  let color = mix(WALL, [204, 190, 172], y / H);
  let alpha = 255;

  // Épaules : un trapèze large qui descend hors du cadre.
  const shoulderTop = 620;
  if (y >= shoulderTop) {
    const half = 130 + ((y - shoulderTop) / (H - shoulderTop)) * 230;
    if (Math.abs(x - cx) < half) color = mix(SHIRT, [40, 60, 104], (y - shoulderTop) / 300);
  }

  // Cou.
  if (y > 470 && y < 660 && Math.abs(x - cx) < 62) color = mix(SKIN, [200, 158, 130], 0.35);

  // Tête : ellipse.
  const headCy = 380;
  const headRx = 132;
  const headRy = 176;
  const dx = (x - cx) / headRx;
  const dy = (y - headCy) / headRy;
  if (dx * dx + dy * dy <= 1) color = SKIN;

  // Cheveux : calotte au-dessus du front, plus des mèches sur les côtés.
  const hairDy = (y - (headCy - 34)) / (headRy + 20);
  if (dx * dx + hairDy * hairDy <= 1 && y < headCy + 40) color = HAIR;
  if (Math.abs(x - cx) > headRx - 34 && y < headCy + 150 && Math.abs(x - cx) < headRx + 8) {
    color = HAIR;
  }

  // Yeux.
  for (const ex of [cx - 48, cx + 48]) {
    const exd = (x - ex) / 20;
    const eyd = (y - 372) / 13;
    if (exd * exd + eyd * eyd <= 1) color = [46, 38, 36];
  }

  // Bouche.
  const mxd = (x - cx) / 40;
  const myd = (y - 452) / 9;
  if (mxd * mxd + myd * myd <= 1) color = [158, 88, 84];

  return [color[0], color[1], color[2], alpha];
}

const outDir = path.join(__dirname, 'fixtures');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'portrait-test.png');
fs.writeFileSync(out, render(pixel));
console.log(`Portrait écrit : ${out} (${W}×${H}, ${Math.round(fs.statSync(out).size / 1024)} Ko)`);
