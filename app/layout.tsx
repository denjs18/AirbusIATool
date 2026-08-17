import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outillage certification ATA 27 - POC",
  description:
    "Prototype d'assistance a la redaction des documents de certification. Donnees fictives, traitement local.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
