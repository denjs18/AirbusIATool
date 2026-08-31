/**
 * Lecture d'un classeur depuis le navigateur.
 *
 * Isole de lib/workbook.ts parce que le paquet de lecture xlsx n'expose que
 * des points d'entree distincts par environnement : le parseur reste ainsi
 * testable cote Node, et c'est lui qui porte toutes les regles.
 *
 * Le classeur est lu dans l'onglet : il ne quitte pas le poste.
 */
import { readSheets, type WorkbookParseResult } from "./workbook";

export async function readLibraryWorkbook(file: File): Promise<WorkbookParseResult> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  // Le lecteur rend toutes les feuilles avec leur contenu en une passe.
  const sheets = await readXlsxFile(file);
  return readSheets(sheets);
}
