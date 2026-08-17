/**
 * Extraction PDF cote Node, utilisee uniquement par les tests.
 *
 * L'application utilise lib/pdf.ts (build navigateur + worker servi en
 * statique). Ici on passe par le build "legacy" de pdf.js, sans worker, mais on
 * reutilise itemsToLines pour tester exactement la meme reconstruction de lignes
 * que celle executee dans le navigateur.
 */
import { readFileSync } from "node:fs";
import { itemsToLines } from "../lib/pdf";
import type { PdfDocumentText, PdfPage } from "../lib/types";

export async function extractPdfTextNode(path: string): Promise<PdfDocumentText> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(path));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: false }).promise;

  const pages: PdfPage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push({
      page: pageNumber,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      text: itemsToLines(content.items as any).join("\n"),
    });
  }

  const pageCount = pdf.numPages;
  await pdf.destroy();
  return { sourceName: path.split("/").pop() ?? path, pages, pageCount };
}
