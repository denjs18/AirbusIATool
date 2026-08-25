/**
 * Le build worker de pdf.js n'est pas type : il n'est pas prevu pour etre
 * importe directement. On l'importe pourtant volontairement, pour disposer du
 * code de traitement dans le thread principal quand le worker dedie ne peut
 * pas demarrer (voir lib/pdf.ts).
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.min.mjs" {
  export const WorkerMessageHandler: unknown;
}
