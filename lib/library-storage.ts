/**
 * Persistance de la bibliotheque de blocs types.
 *
 * Elle vit dans le navigateur du poste : c'est un parametrage d'equipe, pas une
 * donnee de programme, et il n'y a de toute facon pas de serveur pour
 * l'accueillir. L'export JSON reste le moyen de la partager entre postes.
 */
import { coerceLibrary, EMPTY_LIBRARY, type TemplateLibrary } from "./templates";

const STORAGE_KEY = "airbus-ia-tool.block-templates";

/**
 * Relit la bibliotheque memorisee.
 *
 * Le contenu du stockage a pu etre ecrit par une version anterieure de l'outil,
 * qui ne conservait que les identifiants des exigences. Il est donc converti a
 * la relecture, jamais rendu tel quel : le rendre brut a fait planter les deux
 * onglets qui le lisent, chez un utilisateur dont le poste gardait l'ancienne
 * forme, alors que tout etait vert ici.
 */
export function loadLibrary(): TemplateLibrary {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return coerceLibrary(parsed) ?? EMPTY_LIBRARY;
  } catch {
    // Navigation privee, stockage refuse, contenu corrompu : on repart d'une
    // bibliotheque vide plutot que d'empecher l'outil de s'ouvrir.
    return EMPTY_LIBRARY;
  }
}

export function saveLibrary(library: TemplateLibrary): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch {
    // Le parametrage reste alors valable pour la session en cours seulement.
  }
}
