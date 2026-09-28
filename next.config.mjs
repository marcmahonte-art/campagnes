/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Fabric.js manipule des objets lourds ; on garde le paquet côté client.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
