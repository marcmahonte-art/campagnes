import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Une racine explicite évite de tracer les fichiers personnels du dossier parent.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  distDir: process.env.CAMPAGNES_BUILD_DIR ?? '.next',
  reactStrictMode: true,
  /*
   * Rendu serveur du pass « sans filigrane » : la route d'export charge
   * `fabric/node`, adossé à node-canvas (binaire natif). On garde Fabric et
   * canvas **hors du bundle serveur** — sinon webpack tenterait d'empaqueter un
   * module natif, et le build casserait. Le client n'est pas concerné.
   * (`canvas` est déjà externalisé par Next par défaut ; on l'ajoute par
   * lisibilité et pour ne pas dépendre d'une valeur par défaut qui peut changer.)
   */
  serverExternalPackages: ['fabric', 'canvas'],
  experimental: {
    // Fabric.js manipule des objets lourds ; on garde le paquet côté client.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
