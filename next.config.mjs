import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Une racine explicite évite de tracer les fichiers personnels du dossier parent.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  distDir: process.env.CAMPAGNES_BUILD_DIR ?? '.next',
  reactStrictMode: true,
  experimental: {
    // Fabric.js manipule des objets lourds ; on garde le paquet côté client.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
