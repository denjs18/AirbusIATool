/**
 * Reperes de paragraphe et indications de recherche.
 *
 * L'enjeu de ces tests est double. D'abord qu'un repere reste reconnu comme
 * avant, indication ou pas : les redactions deja ecrites doivent continuer a
 * fonctionner. Ensuite, et surtout, qu'une indication ne sorte jamais dans le
 * document produit : elle vient d'une edition anterieure du document joint,
 * personne ne l'a verifiee, et rien dans la coversheet ne la distinguerait d'un
 * chapitre reellement cite.
 */
import { describe, expect, it } from "vitest";
import {
  countPlaceholders,
  fillPlaceholders,
  normalizeChapter,
  placeholderHints,
  splitPlaceholders,
} from "../lib/placeholders";

describe("countPlaceholders", () => {
  it("compte les reperes sans indication, comme avant", () => {
    expect(countPlaceholders("voir §x, §X.X et § x.x.x")).toBe(3);
  });

  it("compte un repere porteur d'une indication une seule fois", () => {
    expect(countPlaceholders("voir §x.x[5.4] et §x.x[ch. 9]")).toBe(2);
  });

  it("ne prend pas un chapitre reel pour un repere", () => {
    expect(countPlaceholders("described in §3.3.5 and §4.1")).toBe(0);
  });

  it("ne compte rien dans un texte absent", () => {
    expect(countPlaceholders(undefined)).toBe(0);
  });
});

describe("placeholderHints", () => {
  it("rend les indications dans l'ordre des reperes", () => {
    expect(placeholderHints("a §x.x[2.1] b §x.x c §x.x[ch. 9]")).toEqual([
      "2.1",
      undefined,
      "ch. 9",
    ]);
  });

  it("accepte les espaces autour de l'indication", () => {
    expect(placeholderHints("voir §x.x [ 5.4 ]")).toEqual(["5.4"]);
  });

  it("ignore des crochets qui ne suivent pas un repere", () => {
    expect(placeholderHints("voir [5.4] plus loin")).toEqual([]);
  });
});

describe("splitPlaceholders", () => {
  it("rend le texte et les reperes dans l'ordre de lecture", () => {
    const parts = splitPlaceholders("avant §x.x[5.4] apres");
    expect(parts.map((part) => part.kind)).toEqual(["text", "slot", "text"]);
    expect(parts[0]).toMatchObject({ text: "avant " });
    expect(parts[1]).toMatchObject({ index: 0, hint: "5.4", marker: "§x.x" });
    expect(parts[2]).toMatchObject({ text: " apres" });
  });

  it("numerote les reperes pour pouvoir rattacher chaque saisie", () => {
    const slots = splitPlaceholders("§x.x a §x.x b §x.x").filter((p) => p.kind === "slot");
    expect(slots.map((slot) => (slot.kind === "slot" ? slot.index : -1))).toEqual([0, 1, 2]);
  });

  it("recolle un texte sans repere en un seul morceau", () => {
    expect(splitPlaceholders("aucun repere ici")).toEqual([
      { kind: "text", text: "aucun repere ici" },
    ]);
  });
});

describe("normalizeChapter", () => {
  it("accepte le chapitre avec ou sans le signe paragraphe", () => {
    expect(normalizeChapter(" §5.4 ")).toBe("5.4");
    expect(normalizeChapter("5.4")).toBe("5.4");
  });
});

describe("fillPlaceholders", () => {
  const TEXT = "described in §x.x[5.4] and listed in §x.x[9]";

  it("remplace un repere par le chapitre saisi", () => {
    expect(fillPlaceholders(TEXT, { 0: "6.1", 1: "10" })).toBe(
      "described in §6.1 and listed in §10",
    );
  });

  /**
   * Le point qui compte : une indication non saisie ne doit pas se retrouver
   * dans le document. Elle designe le chapitre d'une edition anterieure ; la
   * laisser sortir reviendrait a citer un paragraphe que personne n'a verifie.
   */
  it("laisse un trou visible, jamais l'indication, quand rien n'est saisi", () => {
    const rendu = fillPlaceholders(TEXT, {});
    expect(rendu).toBe("described in §x.x and listed in §x.x");
    expect(rendu).not.toContain("5.4");
    expect(rendu).not.toContain("[");
  });

  it("ne comble que les reperes saisis", () => {
    expect(fillPlaceholders(TEXT, { 1: "10" })).toBe("described in §x.x and listed in §10");
  });

  it("traite une saisie blanche comme une absence de saisie", () => {
    expect(fillPlaceholders(TEXT, { 0: "   " })).toContain("described in §x.x");
  });

  it("tolere que le chapitre soit saisi avec son signe paragraphe", () => {
    expect(fillPlaceholders(TEXT, { 0: "§6.1" })).toContain("described in §6.1");
  });

  it("fait tomber le compte des reperes restants au fur et a mesure", () => {
    expect(countPlaceholders(fillPlaceholders(TEXT, {}))).toBe(2);
    expect(countPlaceholders(fillPlaceholders(TEXT, { 0: "6.1" }))).toBe(1);
    expect(countPlaceholders(fillPlaceholders(TEXT, { 0: "6.1", 1: "10" }))).toBe(0);
  });
});

/**
 * Un repere place en fin de phrase touche la ponctuation. Le motif ne doit pas
 * l'absorber : sinon le chapitre saisi remplace le repere et le point, et la
 * phrase part sans fin dans la coversheet livree.
 */
describe("repere en fin de phrase", () => {
  const TEXTE = "Probabilities are demonstrated in §x.x. In addition, see §x.x[4.2].";

  it("ne mange pas le point qui termine la phrase", () => {
    expect(splitPlaceholders(TEXTE)[1]).toMatchObject({ marker: "§x.x" });
    expect(fillPlaceholders(TEXTE, { 0: "4.4" })).toContain("demonstrated in §4.4. In addition");
  });

  it("laisse la phrase intacte quand rien n'est saisi", () => {
    expect(fillPlaceholders(TEXTE, {})).toBe(
      "Probabilities are demonstrated in §x.x. In addition, see §x.x.",
    );
  });

  it("compte bien deux reperes", () => {
    expect(countPlaceholders(TEXTE)).toBe(2);
    expect(placeholderHints(TEXTE)).toEqual([undefined, "4.2"]);
  });
});
