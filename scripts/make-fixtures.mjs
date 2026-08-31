/**
 * Generation des jeux de donnees fictifs du POC.
 *
 * IMPORTANT : tous les contenus produits ici sont inventes. Aucune donnee
 * Airbus reelle n'entre dans ce depot. Les references documentaires, les noms
 * et les resultats d'analyse sont fictifs et servent uniquement a demontrer le
 * fonctionnement des controles.
 *
 * Les documents contiennent des defauts volontaires (renvois errones, en-tete
 * incomplet, MoC divergents) afin que la demonstration montre des detections
 * reelles et non un cas ideal.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const OUT_DIR = join("public", "fixtures");
const MARGIN = 56;
const LINE_HEIGHT = 14;
const FONT_SIZE = 10;
const TITLE_SIZE = 13;

/** Ecrit un document PDF a partir d'une liste de pages de lignes. */
async function writePdf(fileName, pages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const lines of pages) {
    const page = pdf.addPage([595, 842]); // A4
    let y = 842 - MARGIN;

    for (const line of lines) {
      const isTitle = typeof line === "object" && line.bold;
      const text = typeof line === "object" ? line.text : line;
      if (y < MARGIN) break;
      page.drawText(text, {
        x: MARGIN,
        y,
        size: isTitle ? TITLE_SIZE : FONT_SIZE,
        font: isTitle ? bold : font,
        color: rgb(0.1, 0.1, 0.12),
      });
      y -= isTitle ? LINE_HEIGHT + 4 : LINE_HEIGHT;
    }
  }

  const bytes = await pdf.save();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, fileName), bytes);
  console.log(`[fixtures] ${join(OUT_DIR, fileName)} (${pages.length} pages)`);
}

const t = (text) => ({ text, bold: true });

/* ------------------------------------------------------------------ */
/* ACP fictif : plan de certification ATA 27                           */
/* ------------------------------------------------------------------ */

const acpPages = [
  [
    t("AIRCRAFT CERTIFICATION PLAN - ATA 27 FLIGHT CONTROLS"),
    "",
    "Document reference: ACP-27-CER-0114",
    "Title: Certification plan - Flight control system architecture update",
    "Issue: 3",
    "Date: 12/03/2026",
    "ATA chapter: 27",
    "Programme: A32N-DEMO",
    "Author: J. Fictif",
    "Checker: M. Exemple",
    "Approved by: C. Demonstration",
    "Classification: DONNEES FICTIVES - POC Airbus Protect",
    "",
    "DOCUMENT FICTIF. Contenu invente pour demonstration outillage.",
    "Aucune donnee de programme reel n'est utilisee.",
    "",
    t("1 Purpose"),
    "This plan defines the means of compliance retained for the flight control",
    "system modification. It is a fictitious document used to demonstrate the",
    "certification tooling prototype.",
  ],
  [
    t("2 Applicable certification basis"),
    "The certification basis is CS-25 at Amdt 27, complemented by the special",
    "conditions and CRIs listed hereafter.",
    "",
    t("2.1 Primary requirements"),
    "The following paragraphs are applicable to the modification:",
    "- CS 25.671 amdt 27 General, control systems. MoC: 1, 2, 3 and 6.",
    "- CS 25.671(c)(1) specific failure conditions. MoC: 3.",
    "- CS 25.672 Stability augmentation systems. MoC 1 / MoC 3.",
    "- CS 25.675 Stops. MoC: 1, 4.",
    "- CS 25.677 Trim systems. MoC: 1, 4, 6.",
    "",
    t("2.2 Secondary requirements"),
    "- CS 25.681 Limit load static tests. MoC: 2, 4.",
    "- CS 25.683 Operation tests. MoC 5.",
    "- CS 25.685 Control system details. MoC: 1, 4.",
    "- CS 25.689 Cable systems. MoC: 1, 4.",
    "- CS 25.693 Joints. MoC: 1.",
  ],
  [
    t("3 Systems and equipment requirements"),
    "The system safety assessment is performed in accordance with AMC 25.1309",
    "and the associated development assurance process.",
    "",
    "- CS 25.1309(b) Equipment, systems and installations. MoC: 2, 3, 9.",
    "- CS 25.1309(c) failure information to the crew. MoC: 3.",
    "- CS 25.1322 Flight crew alerting. MoC: 1, 7.",
    "- CS 25.1301 Function and installation. MoC: 1, 9.",
    "- AMC 25.1309 System design and analysis guidance.",
    "",
    t("3.1 Handling qualities"),
    "- CS 25.143 Controllability and manoeuvrability. MoC: 2, 6, 8.",
    "- CS 25.703 Takeoff warning system. MoC: 1, 5, 6.",
    "",
    t("3.2 Lift and drag devices"),
    "- CS 25.697 Lift and drag device controls. MoC: 1, 5, 6.",
    "- CS 25.699 Lift and drag device indicator. MoC: 1, 5.",
    "- CS 25.701 Flap and slat interconnection. MoC: 1, 2, 4.",
  ],
  [
    t("4 Special conditions and review items"),
    "The following items are opened with the Agency for this modification:",
    "",
    "- SC F-12 Electronic flight control system protection functions.",
    "- CRI F-01 Flight control laws validation approach.",
    "- CRI B-14 Crew alerting philosophy for control system failures.",
    "- ESF F-03 Equivalent safety finding on control system jamming.",
    "",
    t("5 Compliance documentation"),
    "Compliance is substantiated by the documents listed below. Each compliance",
    "demonstration is captured in a dedicated coversheet.",
    "",
    "- DOC-27-SAF-0142 Flight control system safety assessment, Issue 2.",
    "- DOC-27-STR-0087 Control surface load substantiation, Issue 1.",
    "- DOC-27-TST-0203 Ground and flight test report, Issue 1.",
    "",
    "The safety assessment results are consolidated in DOC-27-SAF-0142",
    "chapter 4 and its sub-chapters.",
  ],
  [
    t("6 Compliance checklist summary"),
    "Requirement            Means of compliance     Coversheet",
    "CS 25.671              MC1 MC2 MC3 MC6         CVS-27-FCS-0001",
    "CS 25.672              MC1 MC3                 CVS-27-FCS-0002",
    "CS 25.675              MC1 MC4                 CVS-27-FCS-0003",
    "CS 25.677              MC1 MC4 MC6             CVS-27-FCS-0004",
    "CS 25.1309(b)          MC2 MC3 MC9             CVS-27-FCS-0005",
    "CS 25.1322             MC1 MC7                 CVS-27-FCS-0006",
    "CS 25.143              MC2 MC6 MC8             CVS-27-FCS-0007",
    "CS 25.703              MC1 MC5 MC6             to be issued",
    "",
    t("7 Schedule"),
    "The compliance documentation is planned for release before the Type",
    "Certification Board. Dates are fictitious.",
  ],
];

/* ------------------------------------------------------------------ */
/* Document de substantiation fictif : safety assessment               */
/* ------------------------------------------------------------------ */

const safetyPages = [
  [
    t("FLIGHT CONTROL SYSTEM SAFETY ASSESSMENT"),
    "",
    "Document reference: DOC-27-SAF-0142",
    "Title: Flight control system safety assessment",
    "Issue: 2",
    "Date: 2026-02-18",
    "ATA chapter: 27",
    "Programme: A32N-DEMO",
    "Author: S. Fictive",
    "Checked by: L. Exemple",
    "Approved by: C. Demonstration",
    "Classification: DONNEES FICTIVES - POC Airbus Protect",
    "",
    "DOCUMENT FICTIF - contenu invente, aucune valeur de certification.",
    "",
    t("Table of contents"),
    "1 Introduction ................................................ 2",
    "2 System description ......................................... 2",
    "3 Functional hazard assessment .............................. 3",
    "4 Safety analyses ............................................ 4",
    "5 Conclusion ................................................. 6",
  ],
  [
    t("1 Introduction"),
    "This document presents the safety assessment of the flight control system",
    "for the fictitious modification used in this prototype.",
    "",
    t("1.1 Scope"),
    "The assessment covers the primary and secondary flight controls.",
    "",
    t("1.2 Applicable requirements"),
    "The assessment supports compliance with CS 25.671 and CS 25.1309(b) at",
    "Amdt 27, using AMC 25.1309 guidance.",
    "",
    t("2 System description"),
    "The system comprises fictitious computers, actuators and sensors.",
    "",
    t("2.1 Architecture overview"),
    "Three dissimilar computing lanes are assumed for demonstration purposes.",
  ],
  [
    t("3 Functional hazard assessment"),
    "The functional hazard assessment identifies the failure conditions and",
    "their classification.",
    "",
    t("3.1 Failure condition list"),
    "Fictitious failure conditions FC-01 to FC-18 are considered.",
    "",
    t("3.2 Classification rationale"),
    "Classification follows the severity definitions of AMC 25.1309.",
    "",
    t("3.3 Functional hazard assessment results"),
    "All identified failure conditions are assessed as acceptable in this",
    "fictitious dataset. Results are summarised in table 3-2.",
  ],
  [
    t("4 Safety analyses"),
    "This chapter consolidates the quantitative and qualitative analyses.",
    "",
    t("4.1 Fault tree analysis"),
    "Fictitious fault trees are built for each catastrophic failure condition.",
    "",
    t("4.2 Failure modes and effects analysis"),
    "The FMEA covers the actuator and sensor fictitious failure modes.",
    "",
    t("4.3 Common cause analysis"),
    "The common cause analysis addresses zonal, particular risks and common",
    "mode aspects.",
    "",
    t("4.3.1 Zonal safety analysis"),
    "Fictitious zonal analysis of the avionics bay and wing zones.",
  ],
  [
    t("4.3.2 Particular risks analysis"),
    "Particular risks considered: fictitious bird strike, tyre burst and",
    "hydraulic fluid loss scenarios.",
    "",
    t("4.3.3 Common mode analysis"),
    "Common mode analysis of the three fictitious computing lanes.",
    "",
    t("4.4 Quantitative assessment"),
    "The fictitious computed probabilities meet the objectives of CS 25.1309.",
  ],
  [
    t("5 Conclusion"),
    "On the basis of this fictitious assessment, the flight control system is",
    "considered compliant with CS 25.671 and CS 25.1309(b).",
    "",
    t("5.1 Open points"),
    "No open point in this fictitious dataset.",
  ],
];

/* ------------------------------------------------------------------ */
/* Coversheet fictive comportant des defauts volontaires               */
/* ------------------------------------------------------------------ */

const coversheetPages = [
  [
    t("COMPLIANCE COVERSHEET"),
    "",
    "Document reference: CVS-27-FCS-0001",
    "Title: Compliance coversheet - CS 25.671",
    "Issue: 2",
    "Date: 15/09/2026",
    "ATA chapter: 27",
    // Defaut volontaire 1 : champ Programme absent de l'en-tete.
    "Requirement: CS 25.671 (Amdt 26)",
    "Means of compliance: MC1, MC2",
    "Author: J. Fictif",
    "Checked by: M. Exemple",
    // Defaut volontaire 2 : approbateur identique au redacteur.
    "Approved by: J. Fictif",
    "Classification: DONNEES FICTIVES - POC Airbus Protect",
    "",
    t("1 Compliance statement"),
    "Compliance with CS 25.671 is demonstrated by design review and analysis,",
    "as substantiated by the documents referenced in section 2.",
    "",
    t("2 Substantiation documents"),
    // Defaut volontaire 3 : le chapitre 4.3.2 existe mais traite des risques
    // particuliers, pas des resultats de FHA (le bon renvoi serait 3.3).
    "a) DOC-27-SAF-0142 Iss. 1 chapter 4.3.2 \"Functional hazard assessment",
    "results\" provides the failure condition classification.",
    "",
    // Defaut volontaire 4 : chapitre inexistant dans le document fourni.
    "b) DOC-27-SAF-0142 chapter 7.2 \"Quantitative assessment\" provides the",
    "computed probabilities.",
    "",
    // Renvoi correct, pour montrer un cas conforme.
    "c) DOC-27-SAF-0142 chapter 4.1 \"Fault tree analysis\" provides the fault",
    "trees for catastrophic failure conditions.",
    "",
    "d) DOC-27-STR-0087 chapter 2.4 \"Load cases\" provides the load",
    "substantiation.",
  ],
];

/* ------------------------------------------------------------------ */
/* Registre de coversheets fictif, pour le module de recoupement        */
/* ------------------------------------------------------------------ */

const registry = {
  _avertissement:
    "Donnees fictives generees pour le POC. Simule un export du referentiel documentaire.",
  programme: "A32N-DEMO",
  ataChapter: "27",
  coversheets: [
    { documentRef: "CVS-27-FCS-0001", requirement: "CS 25.671", qualifier: "Amdt 26", moc: ["1", "2"] },
    { documentRef: "CVS-27-FCS-0002", requirement: "CS 25.672", moc: ["1", "3"] },
    { documentRef: "CVS-27-FCS-0003", requirement: "CS 25.675", moc: ["1", "4"] },
    { documentRef: "CVS-27-FCS-0004", requirement: "CS 25.677", moc: ["1", "4", "6"] },
    { documentRef: "CVS-27-FCS-0005", requirement: "CS 25.1309(b)", moc: ["2", "3", "9"] },
    { documentRef: "CVS-27-FCS-0023", requirement: "CS 25.1309(c)", moc: ["3"] },
    { documentRef: "CVS-27-FCS-0024", requirement: "AMC 25.1309", moc: ["2", "3"] },
    { documentRef: "CVS-27-FCS-0006", requirement: "CS 25.1322", moc: ["1", "7"] },
    { documentRef: "CVS-27-FCS-0007", requirement: "CS 25.143", moc: ["2", "6", "8"] },
    { documentRef: "CVS-27-FCS-0008", requirement: "CS 25.681", moc: ["2", "4"] },
    { documentRef: "CVS-27-FCS-0009", requirement: "CS 25.683", moc: ["5"] },
    { documentRef: "CVS-27-FCS-0010", requirement: "CS 25.685", moc: ["1", "4"] },
    { documentRef: "CVS-27-FCS-0011", requirement: "CS 25.689", moc: ["1", "4"] },
    { documentRef: "CVS-27-FCS-0012", requirement: "CS 25.693", moc: ["1"] },
    { documentRef: "CVS-27-FCS-0013", requirement: "CS 25.697", moc: ["1", "5", "6"] },
    { documentRef: "CVS-27-FCS-0014", requirement: "CS 25.699", moc: ["1", "5"] },
    { documentRef: "CVS-27-FCS-0015", requirement: "CS 25.701", moc: ["1", "2", "4"] },
    { documentRef: "CVS-27-FCS-0016", requirement: "CS 25.1301", moc: ["1", "9"] },
    { documentRef: "CVS-27-FCS-0017", requirement: "SC F-12", moc: ["1", "3", "6"] },
    { documentRef: "CVS-27-FCS-0018", requirement: "CRI F-01", moc: ["2", "8"] },
    { documentRef: "CVS-27-FCS-0019", requirement: "CRI B-14", moc: ["1", "7"] },
    { documentRef: "CVS-27-FCS-0020", requirement: "ESF F-03", moc: ["1", "3"] },
    // Coversheet volontairement hors perimetre du plan.
    { documentRef: "CVS-27-FCS-0021", requirement: "CS 25.1329", moc: ["1", "6", "8"] },
    // Doublon volontaire sur une exigence deja couverte.
    { documentRef: "CVS-27-FCS-0022", requirement: "CS 25.675", moc: ["1", "4"] },
  ],
};

async function main() {
  await writePdf("ACP-27-CER-0114_Iss3.pdf", acpPages);
  await writePdf("DOC-27-SAF-0142_Iss2.pdf", safetyPages);
  await writePdf("CVS-27-FCS-0001_Iss2.pdf", coversheetPages);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "coversheets-registry.json"),
    `${JSON.stringify(registry, null, 2)}\n`,
  );
  console.log(`[fixtures] ${join(OUT_DIR, "coversheets-registry.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
