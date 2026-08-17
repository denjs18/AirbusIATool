/**
 * Telechargements cote navigateur.
 *
 * Les exports sont fabriques dans l'onglet a partir des donnees deja en memoire :
 * aucun aller-retour serveur, donc aucun document ne sort du poste.
 */

/** Declenche le telechargement d'un contenu texte. */
export function downloadText(fileName: string, content: string, mimeType = "text/plain") {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // Liberation differee : Safari annule le telechargement si l'URL est revoquee
  // immediatement apres le clic.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Nom de fichier sur, derive d'une reference documentaire. */
export function safeFileName(value: string, extension: string): string {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "export"}.${extension}`;
}
