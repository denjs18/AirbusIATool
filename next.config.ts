import type { NextConfig } from "next";

/**
 * L'application n'a aucune route serveur : tout le traitement documentaire se
 * fait dans le navigateur (voir lib/pdf.ts). Elle peut donc etre construite de
 * deux facons :
 *
 *  - build standard, pour un hebergement de type Vercel ;
 *  - export statique (STATIC_EXPORT=1), qui produit un dossier out/ de fichiers
 *    inertes, servable depuis n'importe quel serveur de fichiers interne, voire
 *    ouvrable derriere un simple serveur statique local.
 *
 * Le second mode est celui a presenter a l'IT : il n'y a alors aucun serveur
 * applicatif, donc aucun endroit ou un document pourrait transiter ou etre
 * stocke.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env.STATIC_EXPORT === "1" ? { output: "export" as const } : {}),
};

export default nextConfig;
