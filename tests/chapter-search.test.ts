/**
 * Recherche du chapitre qui repond, dans le document joint.
 *
 * Ces tests portent sur deux choses distinctes : la construction de la requete
 * a partir du texte qui entoure le repere, et le classement lui-meme. La
 * premiere est la plus fragile, parce qu'une phrase porte souvent deux reperes
 * et qu'une requete identique pour les deux ne servirait a rien.
 */
import { describe, expect, it } from "vitest";
import { queryForSlot, rankLexical, suggestForSlot } from "../lib/chapter-search";
import type { DocumentChapter } from "../lib/types";

const chapter = (number: string, title: string, body: string): DocumentChapter => ({
  number,
  title,
  page: 1,
  body,
});

const CHAPTERS = [
  chapter("1", "Introduction", "This document presents the safety assessment."),
  chapter("3.2", "Classification rationale", "Classification follows the severity definitions."),
  chapter("4.4", "Quantitative assessment", "The computed probabilities meet the objectives."),
  chapter("5", "Conclusion", "The system is considered compliant."),
];

const DEUX_REPERES =
  "Combinations of failures have been classified in §x.x, and adequate failure " +
  "probabilities are demonstrated in §x.x.";

describe("queryForSlot", () => {
  it("prend la phrase qui entoure le repere comme question", () => {
    const query = queryForSlot("The SyDMP references in §x.x the other plans.", 0);
    expect(query).toContain("references");
    expect(query).toContain("other plans");
  });

  /**
   * Le point qui compte : une phrase porte souvent deux reperes. Leur donner la
   * meme requete donnerait deux fois le meme classement, donc aucune aide.
   */
  it("distingue deux reperes d'une meme phrase", () => {
    const first = queryForSlot(DEUX_REPERES, 0);
    const second = queryForSlot(DEUX_REPERES, 1);
    expect(first).not.toBe(second);
    expect(first).toContain("classified");
    expect(second).toContain("probabilities");
    expect(second).not.toContain("classified");
  });

  it("ignore l'indication de recherche, qui n'est pas du texte", () => {
    expect(queryForSlot("classified in §x.x[3.2] here", 0)).not.toContain("3.2");
  });

  it("elargit une proposition trop maigre au texte entier", () => {
    const query = queryForSlot("See §x.x. The failure conditions are classified by severity.", 0);
    expect(query).toContain("classified");
  });

  it("rend une requete vide pour un repere inexistant", () => {
    expect(queryForSlot("aucun repere", 3)).toBe("");
  });
});

describe("rankLexical", () => {
  it("remonte le chapitre dont le titre repond a la question", () => {
    const [best] = rankLexical("adequate failure probabilities are demonstrated", CHAPTERS);
    expect(best.chapter.number).toBe("4.4");
  });

  it("explique pourquoi un chapitre est propose", () => {
    const [best] = rankLexical("failures have been classified", CHAPTERS);
    expect(best.chapter.number).toBe("3.2");
    expect(best.matched).toContain("classified");
  });

  it("ne propose rien plutot que n'importe quoi", () => {
    expect(rankLexical("hydraulic reservoir temperature", CHAPTERS)).toEqual([]);
    expect(rankLexical("", CHAPTERS)).toEqual([]);
    expect(rankLexical("classified", [])).toEqual([]);
  });

  it("rend exactement le meme classement d'une execution a l'autre", () => {
    const once = rankLexical("classification of failure conditions", CHAPTERS);
    const twice = rankLexical("classification of failure conditions", CHAPTERS);
    expect(once.map((c) => c.chapter.number)).toEqual(twice.map((c) => c.chapter.number));
  });

  it("borne le nombre de candidats proposes", () => {
    expect(rankLexical("assessment", CHAPTERS, 1)).toHaveLength(1);
  });

  /**
   * Limite assumee de la methode lexicale, consignee ici volontairement : elle
   * ne rapproche que des mots partages. Un chapitre qui dit la meme chose avec
   * d'autres mots ne remonte pas. C'est precisement ce qu'une recherche
   * semantique apportera, et ce test tombera alors - c'est le but.
   */
  it("ne rapproche pas deux formulations sans mot commun", () => {
    const catalogue = [
      chapter("2", "Severity of hazardous events", "Events are ranked by their consequences."),
    ];
    expect(rankLexical("classification of failure conditions", catalogue)).toEqual([]);
  });
});

describe("suggestForSlot", () => {
  it("enchaine requete et classement pour un repere donne", async () => {
    const candidats = await suggestForSlot(DEUX_REPERES, 1, CHAPTERS);
    expect(candidats[0].chapter.number).toBe("4.4");
  });

  it("ne propose rien quand le repere n'existe pas", async () => {
    expect(await suggestForSlot(DEUX_REPERES, 9, CHAPTERS)).toEqual([]);
  });
});
