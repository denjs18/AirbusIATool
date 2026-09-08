/**
 * Test d'integration sur les PDF fictifs reellement generes.
 *
 * C'est ce test qui garantit que la demonstration fonctionne : il rejoue la
 * chaine complete (extraction PDF -> exigences -> trames -> controles) et
 * verifie que chaque defaut volontairement introduit dans les fixtures est bien
 * detecte. Si une regression casse la demo, ce test tombe avant la reunion.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { queryForSlot, rankLexical } from "../lib/chapter-search";
import { checkCitations, extractChapters, extractCitations } from "../lib/coherence";
import { crossCheck } from "../lib/crosscheck";
import { parseHeader } from "../lib/headers";
import { parsePlan, planStats } from "../lib/parse-acp";
import { countPlaceholders, placeholderHints } from "../lib/placeholders";
import { isRegistryFile, registryToCoverage } from "../lib/registry";
import {
  applyTemplates,
  coerceLibrary,
  knownRequirementsFor,
} from "../lib/templates";
import { extractPdfTextNode } from "./pdf-node";

const FIXTURES = "public/fixtures";

const acpText = await extractPdfTextNode(`${FIXTURES}/ACP-27-CER-0114_Iss3.pdf`);
const safetyText = await extractPdfTextNode(`${FIXTURES}/DOC-27-SAF-0142_Iss2.pdf`);
const coversheetText = await extractPdfTextNode(`${FIXTURES}/CVS-27-FCS-0001_Iss2.pdf`);

describe("extraction du plan de certification", () => {
  const plan = parsePlan(acpText);

  it("lit l'en-tete de la page de garde", () => {
    expect(plan.header.documentRef).toBe("ACP-27-CER-0114");
    expect(plan.header.issue).toBe("3");
    expect(plan.header.ataChapter).toBe("27");
    expect(plan.header.programme).toBe("A32N-DEMO");
  });

  it("retrouve les exigences citees dans tout le document", () => {
    const ids = plan.requirements.map((requirement) => requirement.id);

    for (const expected of [
      "CS 25.671",
      "CS 25.671(c)(1)",
      "CS 25.672",
      "CS 25.1309(b)",
      "CS 25.143",
      "CS 25.703",
      "AMC 25.1309",
      "SC F-12",
      "CRI F-01",
      "CRI B-14",
      "ESF F-03",
    ]) {
      expect(ids, `${expected} doit etre extrait`).toContain(expected);
    }
  });

  it("rattache les exigences a leur page et a leur section", () => {
    const occurrence = plan.occurrences.find((o) => o.id === "CS 25.672");
    expect(occurrence?.page).toBe(2);
    expect(occurrence?.section).toContain("Primary requirements");
  });

  it("remonte les MoC annonces dans le plan", () => {
    const occurrence = plan.occurrences.find(
      (o) => o.id === "CS 25.671" && o.mocIds.length > 0,
    );
    expect(occurrence?.mocIds).toEqual(["1", "2", "3", "6"]);
  });

  it("produit des statistiques exploitables", () => {
    const stats = planStats(plan);
    expect(stats.pageCount).toBe(5);
    expect(stats.requirementCount).toBeGreaterThanOrEqual(20);
    expect(stats.byKind.CS).toBeGreaterThanOrEqual(15);
    expect(stats.byKind.SC).toBe(1);
  });
});

describe("coherence des renvois de la coversheet fictive", () => {
  const chapters = extractChapters(safetyText.pages);
  const citationText = coversheetText.pages.map((page) => page.text).join("\n");
  const results = checkCitations(extractCitations(citationText), chapters, {
    actualDocumentRef: "DOC-27-SAF-0142",
    actualDocumentIssue: "2",
  });

  it("reconstitue la structure du document de substantiation", () => {
    const numbers = chapters.map((chapter) => chapter.number);
    expect(numbers).toContain("3.3");
    expect(numbers).toContain("4.3.2");
    expect(numbers).not.toContain("7.2");
  });

  it("detecte le renvoi vers un chapitre inexistant (defaut volontaire)", () => {
    const missing = results.find((r) => r.label.includes("7.2") && r.status === "error");
    expect(missing).toBeDefined();
  });

  it("detecte le titre annonce qui ne correspond pas au chapitre 4.3.2", () => {
    const mismatch = results.find((r) => r.label.includes("4.3.2"));
    expect(mismatch?.status).toBe("error");
    expect(mismatch?.detail).toContain("Particular risks analysis");
  });

  it("valide le renvoi correct vers le chapitre 4.1", () => {
    const ok = results.find((r) => r.label.includes("4.1") && r.status === "ok");
    expect(ok).toBeDefined();
  });

  it("signale l'issue citee obsolete", () => {
    expect(results.some((r) => r.id.endsWith(".issue") && r.status === "warning")).toBe(true);
  });

  it("n'evalue pas le renvoi vers un document non fourni", () => {
    const other = results.find((r) => r.label.includes("DOC-27-STR-0087"));
    expect(other?.status).toBe("info");
  });
});

describe("recoupement ACP / registre de coversheets", () => {
  const plan = parsePlan(acpText);
  const registry = JSON.parse(readFileSync(`${FIXTURES}/coversheets-registry.json`, "utf8"));

  it("charge un registre valide", () => {
    expect(isRegistryFile(registry)).toBe(true);
  });

  const report = crossCheck({ plan, coversheets: registryToCoverage(registry) });

  it("detecte CS 25.703 sans coversheet (defaut volontaire)", () => {
    expect(report.uncovered).toContain("CS 25.703");
  });

  it("detecte la coversheet CS 25.1329 hors plan (defaut volontaire)", () => {
    expect(report.orphans).toContain("CS 25.1329");
  });

  it("detecte le doublon sur CS 25.675 (defaut volontaire)", () => {
    expect(report.duplicated).toContain("CS 25.675");
  });

  it("detecte les MoC manquants sur CS 25.671 (defaut volontaire)", () => {
    const moc = report.results.find((r) => r.id.startsWith("crosscheck.moc.CS 25.671"));
    expect(moc?.status).toBe("error");
    expect(moc?.detail).toContain("3");
  });

  it("chiffre la couverture du plan", () => {
    expect(report.coverageRatio).toBeGreaterThan(0.5);
    expect(report.coverageRatio).toBeLessThan(1);
  });
});

/**
 * La bibliotheque fictive et l'ACP fictif doivent parler des memes exigences.
 *
 * Ce test existe parce que les deux ont diverge une premiere fois : la
 * bibliotheque citait "CS 25.671(a)" quand l'ACP produisait "CS 25.671", et
 * plus aucune redaction n'etait restituee. Rien ne le signalait a l'ecran.
 */
describe("blocs types fictifs et ACP fictif", () => {
  const plan = parsePlan(acpText);
  const raw: unknown = JSON.parse(readFileSync(`${FIXTURES}/blocs-types.json`, "utf8"));
  const library = coerceLibrary(raw);

  it("charge une bibliotheque valide", () => {
    expect(library).toBeDefined();
  });

  it("ne cite que des exigences que l'ACP produit reellement", () => {
    const planIds = new Set(plan.requirements.map((requirement) => requirement.id));
    const cited = [
      ...new Set(library!.templates.flatMap((t) => t.requirements.map((r) => r.id))),
    ];
    const orphans = cited.filter((id) => !planIds.has(id));
    expect(orphans, `exigences absentes de l'ACP fictif : ${orphans.join(", ")}`).toEqual([]);
  });

  /**
   * Le classeur porte le qualifieur, pas l'ACP : c'est lui qui dicte la
   * citation produite. Une coversheet qui annoncerait le mauvais amendement
   * serait fausse sans que rien ne le signale.
   */
  it("conserve le qualifieur cite dans la bibliotheque", () => {
    const known = knownRequirementsFor(library!, "SYDMP");
    expect(known.find((r) => r.id === "CS 25.671(a)")?.qualifier).toBe("Amdt 23");
    expect(known.find((r) => r.id === "JAR 25.1301(a)")?.qualifier).toBe("ch. 11");
  });

  it("restitue une redaction differente selon la combinaison retenue", () => {
    const byId = new Map(plan.requirements.map((r) => [r.id, r]));
    const a = byId.get("CS 25.671(a)")!;
    const b = byId.get("JAR 25.1301(a)")!;

    const ensemble = applyTemplates("SYDMP", [a, b], library!).blocks;
    const seule = applyTemplates("SYDMP", [a], library!).blocks;

    expect(ensemble).toHaveLength(1);
    expect(seule).toHaveLength(1);
    expect(ensemble[0].justification).toBeDefined();
    expect(seule[0].justification).toBeDefined();
    expect(ensemble[0].justification).not.toBe(seule[0].justification);
  });

  /**
   * Les indications de l'exemple fictif doivent etre lues comme telles, sinon
   * la demonstration montre "§x.x[5.4]" a l'ecran au lieu d'un champ guide.
   */
  it("porte des indications de recherche lisibles", () => {
    const textes = library!.templates.map((t) => t.text ?? "");
    const indications = textes.flatMap((texte) => placeholderHints(texte)).filter(Boolean);
    expect(indications.length).toBeGreaterThan(0);
    // Aucune indication ne doit rester visible dans le texte une fois decoupe.
    for (const texte of textes) {
      expect(texte.includes("[") ? placeholderHints(texte).some(Boolean) : true).toBe(true);
    }
  });

  it("laisse des reperes de paragraphe a pointer dans chaque redaction", () => {
    for (const template of library!.templates) {
      expect(countPlaceholders(template.text)).toBeGreaterThan(0);
    }
  });
});

/**
 * Recherche du chapitre dans le document joint, sur le PDF fictif reellement
 * genere.
 *
 * C'est cette epreuve, et non les tests unitaires, qui a revele les deux
 * defauts serieux du premier jet : le point interieur d'un repere "§x.x" pris
 * pour une fin de phrase, et deux reperes d'une meme proposition recevant la
 * meme question. Un moteur de recherche ne se juge pas sur des exemples
 * fabriques pour lui.
 */
describe("recherche du chapitre dans le document joint", async () => {
  const document = await extractPdfTextNode(`${FIXTURES}/DOC-27-SAF-0142_Iss2.pdf`);
  const chapters = extractChapters(document.pages);
  const library = coerceLibrary(
    JSON.parse(readFileSync(`${FIXTURES}/blocs-types.json`, "utf8")),
  )!;

  /** Redaction SSA a trois reperes, celle qui porte les cas interessants. */
  const ssa = library.templates.find(
    (template) =>
      template.documentType === "SSA" && countPlaceholders(template.text) === 3,
  )!;

  it("releve la structure en chapitres du document joint", () => {
    expect(chapters.length).toBeGreaterThan(10);
    expect(chapters.map((chapter) => chapter.number)).toContain("4.4");
  });

  it("pose une question differente pour chaque repere d'une meme redaction", () => {
    const questions = [0, 1, 2].map((index) => queryForSlot(ssa.text!, index));
    expect(new Set(questions).size).toBe(3);
    // Le repere ne fait pas partie de la question posee au document.
    for (const question of questions) expect(question).not.toContain("§");
  });

  it("propose le chapitre attendu pour une phrase qui parle de classification", () => {
    const [best] = rankLexical(queryForSlot(ssa.text!, 0), chapters);
    expect(best.chapter.title).toBe("Classification rationale");
    expect(best.matched).toContain("classified");
  });

  it("propose le chapitre attendu pour une phrase qui parle de probabilites", () => {
    const [best] = rankLexical(queryForSlot(ssa.text!, 1), chapters);
    expect(best.chapter.number).toBe("4.4");
  });

  it("explique chaque proposition par des termes de la question", () => {
    const query = queryForSlot(ssa.text!, 1);
    for (const candidate of rankLexical(query, chapters)) {
      expect(candidate.matched.length).toBeGreaterThan(0);
      for (const term of candidate.matched) {
        expect(query.toLowerCase()).toContain(term);
      }
    }
  });

  it("rend le meme classement a chaque execution", () => {
    const query = queryForSlot(ssa.text!, 0);
    expect(rankLexical(query, chapters).map((c) => c.chapter.number)).toEqual(
      rankLexical(query, chapters).map((c) => c.chapter.number),
    );
  });
});
