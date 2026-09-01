/**
 * Relecture de la bibliotheque memorisee dans le navigateur.
 *
 * Ce test existe parce que le stockage a livre a l'application une forme
 * qu'elle ne savait plus lire : une bibliotheque ecrite par une version
 * anterieure, rendue telle quelle. Les deux onglets qui la lisent plantaient au
 * chargement, sur un poste ou tout etait vert ici. Ce qui sort du stockage doit
 * donc etre verifie comme ce qui vient d'un fichier.
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadLibrary, saveLibrary } from "../lib/library-storage";
import { EMPTY_LIBRARY, mergeTemplates } from "../lib/templates";
import { parseRequirementList } from "../lib/requirements";

const STORAGE_KEY = "airbus-ia-tool.block-templates";

/** Stockage minimal, suffisant : le module n'utilise que get et set. */
function stubStorage(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(STORAGE_KEY, initial);
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  };
  return store;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("loadLibrary", () => {
  it("rend une bibliotheque vide quand rien n'est memorise", () => {
    stubStorage();
    expect(loadLibrary()).toEqual(EMPTY_LIBRARY);
  });

  it("relit ce qui vient d'etre enregistre", () => {
    stubStorage();
    const library = mergeTemplates(EMPTY_LIBRARY, [
      {
        documentType: "SYDMP",
        requirements: parseRequirementList("CS 25.0671(a) amdt. 23"),
        text: "Voir §x.x.",
      },
    ]);
    saveLibrary(library);

    const relu = loadLibrary();
    expect(relu.templates).toHaveLength(1);
    expect(relu.templates[0].requirements[0].id).toBe("CS 25.671(a)");
    // Le qualifieur survit a l'aller-retour : sans lui, la coversheet citerait
    // le mauvais amendement.
    expect(relu.templates[0].requirements[0].qualifier).toBe("Amdt 23");
  });

  it("convertit une bibliotheque laissee par une version anterieure", () => {
    stubStorage(
      JSON.stringify({
        templates: [{ documentType: "SYDMP", requirementIds: ["CS 25.671(a)"], text: "Voir §x.x." }],
      }),
    );
    const relu = loadLibrary();
    // Le point qui a casse : requirements doit exister, pas requirementIds.
    expect(relu.templates[0].requirements.map((r) => r.id)).toEqual(["CS 25.671(a)"]);
    expect(relu.templates.every((t) => Array.isArray(t.requirements))).toBe(true);
  });

  it("repart d'une bibliotheque vide sur un contenu inexploitable", () => {
    stubStorage("{ ceci n'est pas du JSON");
    expect(loadLibrary()).toEqual(EMPTY_LIBRARY);

    stubStorage(JSON.stringify({ templates: [{ documentType: "SSA" }] }));
    expect(loadLibrary()).toEqual(EMPTY_LIBRARY);
  });

  it("n'empeche pas l'outil de s'ouvrir quand le stockage est refuse", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("stockage refuse");
        },
        setItem: () => {
          throw new Error("stockage refuse");
        },
      },
    };
    expect(loadLibrary()).toEqual(EMPTY_LIBRARY);
    expect(() => saveLibrary(EMPTY_LIBRARY)).not.toThrow();
  });
});
