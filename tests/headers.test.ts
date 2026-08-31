import { describe, expect, it } from "vitest";
import { checkHeader, parseHeader, parseHeaderDate } from "../lib/headers";

const TODAY = new Date(Date.UTC(2026, 7, 17));

const VALID = `
Document reference: ACP-27-CER-0114
Title: Certification plan - Flight controls
Issue: 3
Date: 12/03/2026
ATA chapter: 27
Programme: A32N-DEMO
Author: J. Fictif
Checked by: M. Exemple
Approved by: C. Demonstration
Classification: DONNEES FICTIVES
`;

describe("parseHeader", () => {
  it("lit les champs d'un en-tete complet", () => {
    const header = parseHeader(VALID);
    expect(header.documentRef).toBe("ACP-27-CER-0114");
    expect(header.issue).toBe("3");
    expect(header.date).toBe("12/03/2026");
    expect(header.ataChapter).toBe("27");
    expect(header.programme).toBe("A32N-DEMO");
    expect(header.checker).toBe("M. Exemple");
    expect(header.approver).toBe("C. Demonstration");
  });

  it("ne confond pas 'Date' et 'Issue date'", () => {
    const header = parseHeader("Issue: 2\nIssue date: 2026-01-05");
    expect(header.issue).toBe("2");
    expect(header.date).toBe("2026-01-05");
  });

  it("accepte les etiquettes francaises", () => {
    const header = parseHeader("Reference document : CVS-27-FCS-0001\nAuteur : S. Fictive");
    expect(header.documentRef).toBe("CVS-27-FCS-0001");
    expect(header.author).toBe("S. Fictive");
  });
});

describe("parseHeaderDate", () => {
  it("accepte ISO, JJ/MM/AAAA et le format textuel", () => {
    expect(parseHeaderDate("2026-02-18")?.toISOString().slice(0, 10)).toBe("2026-02-18");
    expect(parseHeaderDate("12/03/2026")?.toISOString().slice(0, 10)).toBe("2026-03-12");
    expect(parseHeaderDate("12 March 2026")?.toISOString().slice(0, 10)).toBe("2026-03-12");
  });

  it("rejette une date impossible", () => {
    expect(parseHeaderDate("31/02/2026")).toBeUndefined();
    expect(parseHeaderDate("hier")).toBeUndefined();
  });
});

describe("checkHeader", () => {
  it("valide un en-tete complet et coherent", () => {
    const results = checkHeader(parseHeader(VALID), {
      expectedAta: "27",
      allowedProgrammes: ["A32N-DEMO"],
      today: TODAY,
    });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("ok");
  });

  it("signale un champ obligatoire absent", () => {
    const results = checkHeader(parseHeader("Document reference: CVS-27-FCS-0001"), {
      today: TODAY,
    });
    const missing = results.filter((result) => result.id.startsWith("header.missing."));
    expect(missing.map((result) => result.id)).toContain("header.missing.programme");
    expect(missing.every((result) => result.status === "error")).toBe(true);
  });

  it("signale un chapitre ATA different de celui attendu", () => {
    const results = checkHeader(parseHeader(VALID.replace("ATA chapter: 27", "ATA chapter: 32")), {
      expectedAta: "27",
      today: TODAY,
    });
    expect(results.find((result) => result.id === "header.ata.mismatch")?.status).toBe("error");
  });

  it("signale une date d'emission future", () => {
    const results = checkHeader(parseHeader(VALID.replace("12/03/2026", "15/09/2026")), {
      today: TODAY,
    });
    expect(results.find((result) => result.id === "header.date.future")?.status).toBe("warning");
  });

  it("signale un redacteur qui est aussi approbateur", () => {
    const results = checkHeader(
      parseHeader(VALID.replace("Approved by: C. Demonstration", "Approved by: J. Fictif")),
      { today: TODAY },
    );
    expect(results.find((result) => result.id === "header.roles.conflict")?.status).toBe("error");
  });

  it("signale une reference documentaire hors motif", () => {
    const results = checkHeader(parseHeader(VALID.replace("ACP-27-CER-0114", "plan_v3_final")), {
      today: TODAY,
    });
    expect(results.find((result) => result.id === "header.documentRef.format")?.status).toBe(
      "warning",
    );
  });

  it("signale un code MoC hors nomenclature", () => {
    const results = checkHeader({ ...parseHeader(VALID), moc: "MoC 2, MoC 12" }, { today: TODAY });
    const moc = results.find((result) => result.id === "header.moc.invalid");
    expect(moc?.status).toBe("error");
    expect(moc?.detail).toContain("12");
  });

  it("accepte les codes MoC valides", () => {
    const results = checkHeader({ ...parseHeader(VALID), moc: "MoC 1, MoC 2, MoC 9" }, { today: TODAY });
    expect(results.some((result) => result.id.startsWith("header.moc"))).toBe(false);
  });

  it("signale un champ MoC sans code identifiable", () => {
    const results = checkHeader(
      { ...parseHeader(VALID), moc: "revue de conception" },
      { today: TODAY },
    );
    expect(results.find((result) => result.id === "header.moc.unreadable")?.status).toBe("warning");
  });
});
