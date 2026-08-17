import { describe, expect, it } from "vitest";
import {
  checkCitations,
  extractChapters,
  extractCitations,
  summarize,
  titleSimilarity,
  tokenize,
} from "../lib/coherence";
import type { PdfPage } from "../lib/types";

const SAFETY_PAGES: PdfPage[] = [
  {
    page: 1,
    text: [
      "FLIGHT CONTROL SYSTEM SAFETY ASSESSMENT",
      "Document reference: DOC-27-SAF-0142",
      "Table of contents",
      "1 Introduction ................................................ 2",
      "4 Safety analyses ............................................ 4",
    ].join("\n"),
  },
  {
    page: 3,
    text: ["3.3 Functional hazard assessment results", "All failure conditions are acceptable."].join(
      "\n",
    ),
  },
  {
    page: 4,
    text: [
      "4 Safety analyses",
      "This chapter consolidates the analyses.",
      "4.1 Fault tree analysis",
      "Fault trees are built for each catastrophic failure condition.",
      "4.3 Common cause analysis",
      "4.3.1 Zonal safety analysis",
    ].join("\n"),
  },
  {
    page: 5,
    text: [
      "4.3.2 Particular risks analysis",
      "Particular risks considered: bird strike, tyre burst.",
      "4.4 Quantitative assessment",
    ].join("\n"),
  },
];

describe("tokenize / titleSimilarity", () => {
  it("ignore les mots vides et les accents", () => {
    expect(tokenize("Analyse des risques particuliers")).toEqual([
      "analyse",
      "risques",
      "particuliers",
    ]);
  });

  it("rend 1 pour deux libelles equivalents", () => {
    expect(titleSimilarity("Fault tree analysis", "fault TREE analysis")).toBe(1);
  });

  it("rend une valeur faible pour deux libelles etrangers", () => {
    expect(titleSimilarity("Particular risks analysis", "Functional hazard assessment results")).
      toBeLessThan(0.3);
  });

  it("est symetrique", () => {
    const a = "Common cause analysis";
    const b = "Analysis of common causes";
    expect(titleSimilarity(a, b)).toBe(titleSimilarity(b, a));
  });
});

describe("extractChapters", () => {
  it("reconstitue la structure et ignore le sommaire", () => {
    const chapters = extractChapters(SAFETY_PAGES);
    const numbers = chapters.map((chapter) => chapter.number);

    expect(numbers).toContain("4.3.2");
    expect(numbers).toContain("3.3");
    // Les lignes de sommaire avec points de conduite ne sont pas des chapitres.
    expect(chapters.filter((chapter) => chapter.number === "1")).toHaveLength(0);
  });

  it("associe le bon titre et la bonne page", () => {
    const chapter = extractChapters(SAFETY_PAGES).find((c) => c.number === "4.3.2");
    expect(chapter?.title).toBe("Particular risks analysis");
    expect(chapter?.page).toBe(5);
  });

  it("rattache le corps au chapitre courant", () => {
    const chapter = extractChapters(SAFETY_PAGES).find((c) => c.number === "4.1");
    expect(chapter?.body).toContain("catastrophic failure condition");
  });
});

describe("extractCitations", () => {
  it("lit document, issue, chapitre et titre annonce", () => {
    const [citation] = extractCitations(
      'DOC-27-SAF-0142 Iss. 1 chapter 4.3.2 "Functional hazard assessment results" provides it.',
    );
    expect(citation.documentRef).toBe("DOC-27-SAF-0142");
    expect(citation.documentIssue).toBe("1");
    expect(citation.chapter).toBe("4.3.2");
    expect(citation.claimedTitle).toBe("Functional hazard assessment results");
  });

  it("accepte la notation paragraphe", () => {
    const citations = extractCitations("voir §4.1 (Fault tree analysis) du dossier");
    expect(citations[0].chapter).toBe("4.1");
    expect(citations[0].claimedTitle).toBe("Fault tree analysis");
  });

  it("accepte plusieurs renvois dans un meme texte", () => {
    const citations = extractCitations("chapter 4.1 and chapter 7.2 and section 5");
    expect(citations.map((citation) => citation.chapter)).toEqual(["4.1", "7.2", "5"]);
  });
});

describe("checkCitations", () => {
  const chapters = extractChapters(SAFETY_PAGES);
  const options = { actualDocumentRef: "DOC-27-SAF-0142", actualDocumentIssue: "2" };

  it("valide un renvoi correct", () => {
    const results = checkCitations(
      extractCitations('DOC-27-SAF-0142 chapter 4.1 "Fault tree analysis"'),
      chapters,
      options,
    );
    expect(results.some((result) => result.status === "ok")).toBe(true);
  });

  it("detecte un chapitre inexistant", () => {
    const results = checkCitations(
      extractCitations('DOC-27-SAF-0142 chapter 7.2 "Quantitative assessment"'),
      chapters,
      options,
    );
    const missing = results.find((result) => result.id.endsWith(".missing"));
    expect(missing?.status).toBe("error");
    expect(missing?.label).toContain("7.2");
  });

  it("detecte un titre annonce qui ne correspond pas au chapitre reel", () => {
    const results = checkCitations(
      extractCitations('DOC-27-SAF-0142 chapter 4.3.2 "Functional hazard assessment results"'),
      chapters,
      options,
    );
    const mismatch = results.find((result) => result.id.endsWith(".mismatch"));
    expect(mismatch?.status).toBe("error");
    expect(mismatch?.detail).toContain("Particular risks analysis");
  });

  it("signale une issue citee obsolete", () => {
    const results = checkCitations(
      extractCitations('DOC-27-SAF-0142 Iss. 1 chapter 4.1 "Fault tree analysis"'),
      chapters,
      options,
    );
    const issue = results.find((result) => result.id.endsWith(".issue"));
    expect(issue?.status).toBe("warning");
  });

  it("n'evalue pas un renvoi vers un autre document", () => {
    const results = checkCitations(
      extractCitations('DOC-27-STR-0087 chapter 2.4 "Load cases"'),
      chapters,
      options,
    );
    expect(results[0].status).toBe("info");
    expect(results[0].label).toContain("DOC-27-STR-0087");
  });

  it("propose les chapitres voisins quand le numero est absent", () => {
    const results = checkCitations(
      extractCitations("DOC-27-SAF-0142 chapter 4.3.9"),
      chapters,
      options,
    );
    const missing = results.find((result) => result.id.endsWith(".missing"));
    expect(missing?.detail).toContain("4.3");
  });

  it("indique quand aucun titre n'est annonce", () => {
    const results = checkCitations(
      extractCitations("see DOC-27-SAF-0142 chapter 4.1"),
      chapters,
      options,
    );
    expect(results[0].status).toBe("info");
    expect(results[0].label).toContain("titre non annonce");
  });

  it("retourne un diagnostic explicite quand aucun renvoi n'est trouve", () => {
    const results = checkCitations(extractCitations("no citation here"), chapters, options);
    expect(results[0].id).toBe("coherence.none");
  });
});

describe("summarize", () => {
  it("compte les resultats par statut", () => {
    const summary = summarize([
      { id: "a", status: "ok", label: "", detail: "" },
      { id: "b", status: "error", label: "", detail: "" },
      { id: "c", status: "error", label: "", detail: "" },
    ]);
    expect(summary).toEqual({ ok: 1, error: 2 });
  });
});

describe("renvois internes", () => {
  const chapters = extractChapters(SAFETY_PAGES);
  const options = { actualDocumentRef: "DOC-27-SAF-0142", actualDocumentIssue: "2" };

  it("ne confronte pas un renvoi sans document cite a proximite", () => {
    const results = checkCitations(
      extractCitations("as substantiated by the documents referenced in section 2."),
      chapters,
      options,
    );
    expect(results[0].status).toBe("info");
    expect(results[0].label).toContain("Renvoi interne");
  });

  it("ne rattache pas un renvoi a la reference documentaire du renvoi suivant", () => {
    const citations = extractCitations(
      'see section 2. Later on, DOC-27-SAF-0142 chapter 4.1 "Fault tree analysis" applies.',
    );
    expect(citations[0].chapter).toBe("2");
    expect(citations[0].documentRef).toBeUndefined();
    expect(citations[1].documentRef).toBe("DOC-27-SAF-0142");
  });
});
