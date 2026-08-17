/**
 * Extraction de texte PDF cote navigateur.
 *
 * Point d'architecture important pour la certification : pdf.js tourne dans
 * l'onglet du poste utilisateur. Les documents ne sont jamais televerses, il n'y
 * a pas de stockage serveur et pas d'appel a un service externe. C'est ce qui
 * permet d'envisager l'outil sans instruction d'accessibilite des donnees.
 */
import type { PdfDocumentText, PdfPage } from "./types";

/** Tolerance verticale de regroupement des fragments en lignes, en points PDF. */
const LINE_TOLERANCE = 2.5;

type TextItem = { str: string; transform: number[] };

/**
 * Reconstitue les lignes a partir des fragments positionnes de pdf.js.
 * pdf.js restitue des fragments sans notion de ligne : sans ce regroupement, la
 * detection des titres de chapitre en debut de ligne est impossible.
 */
export function itemsToLines(items: TextItem[]): string[] {
  const rows = new Map<number, { x: number; str: string }[]>();

  for (const item of items) {
    if (!item.str) continue;
    const y = item.transform[5];
    const x = item.transform[4];

    // On rattache le fragment a une ligne existante si l'ecart vertical est faible.
    let key = [...rows.keys()].find((candidate) => Math.abs(candidate - y) <= LINE_TOLERANCE);
    if (key === undefined) {
      key = y;
      rows.set(key, []);
    }
    rows.get(key)!.push({ x, str: item.str });
  }

  return [...rows.entries()]
    // Ordonnancement de lecture : de haut en bas (y decroissant en PDF).
    .sort((a, b) => b[0] - a[0])
    .map(([, fragments]) =>
      fragments
        .sort((a, b) => a.x - b.x)
        .map((fragment) => fragment.str)
        .join("")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/** Charge pdf.js a la demande et pointe le worker servi en statique. */
async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

/** Extrait le texte page par page d'un PDF, sans quitter le navigateur. */
export async function extractPdfText(
  file: File | ArrayBuffer,
  sourceName = "document.pdf",
): Promise<PdfDocumentText> {
  const pdfjs = await loadPdfJs();
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const name = file instanceof ArrayBuffer ? sourceName : file.name;

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: PdfPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({
        page: pageNumber,
        text: itemsToLines(content.items as TextItem[]).join("\n"),
      });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return { sourceName: name, pages, pageCount: pdf.numPages };
}

/**
 * Convertit un texte colle a la main en document analysable.
 * Sert de voie de repli quand un PDF est un scan sans couche texte, et de mode
 * de demonstration sans fichier.
 */
export function textToDocument(text: string, sourceName = "saisie manuelle"): PdfDocumentText {
  // Le separateur de page explicite permet de conserver la notion de pagination.
  const parts = text.split(/^\s*---\s*page\s*---\s*$/gim);
  const pages: PdfPage[] = parts.map((part, index) => ({
    page: index + 1,
    text: part.trim(),
  }));
  return { sourceName, pages, pageCount: pages.length };
}
