import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tout le traitement documentaire se fait cote client : aucune route serveur
  // ne recoit de document. Voir lib/pdf.ts.
  reactStrictMode: true,
};

export default nextConfig;
