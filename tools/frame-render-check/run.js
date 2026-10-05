/*
 * Enveloppe d'exécution du contrôle géométrique de l'image téléversée.
 *
 * Ce contrôle ne rend aucun pixel : il calcule directement la géométrie que le
 * descripteur produit et la compare à ce que l'utilisateur est en droit
 * d'attendre (image entière, centrée, ratio préservé, aller-retour stable).
 *
 * Pas de DOM, pas de canvas : le harnais reste rapide et reproductible.
 */
const path = require('node:path');
require(path.join(__dirname, 'build', 'tools', 'frame-render-check', 'check-geometry.js'));
