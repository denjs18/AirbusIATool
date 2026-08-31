/**
 * Generation du classeur Excel a completer.
 *
 * C'est le fichier que les equipes remplissent et rechargent dans l'outil :
 * il tient la bibliotheque de blocs types hors de l'application, donc hors du
 * depot et hors de tout hebergement. Le classeur vit la ou vivent deja les
 * coversheets, avec les memes regles d'acces.
 *
 * Le classeur est produit ici, cote Node, et non dans le navigateur : la
 * bibliotheque d'ecriture reste une dependance de developpement et n'est jamais
 * livree a l'utilisateur.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";

const OUT_DIR = "public";
const FILE_NAME = "modele-blocs-types.xlsx";

/** Feuille lue par l'application. Le nom fait partie du contrat. */
export const DATA_SHEET = "Blocs types";

const COLUMNS = [
  { header: "Famille de coversheet", key: "famille", width: 22 },
  { header: "Exigences", key: "exigences", width: 46 },
  { header: "Moyens de conformite", key: "moc", width: 20 },
  { header: "Redaction", key: "redaction", width: 90 },
  { header: "Coversheet source", key: "source", width: 26 },
];

const NOTICE = [
  ["Bibliotheque de blocs types - mode d'emploi", ""],
  ["", ""],
  ["A quoi sert ce fichier", ""],
  [
    "",
    "Il regroupe, pour chaque famille de coversheet, quelles exigences vont ensemble et la redaction qui leur correspond.",
  ],
  [
    "",
    "L'application le lit pour restituer la redaction deja ecrite au lieu de vous la faire reecrire a chaque standard.",
  ],
  ["", ""],
  ["Ou le ranger", ""],
  [
    "",
    "Avec vos coversheets, dans votre referentiel documentaire. Il en est extrait, il a la meme classification qu'elles.",
  ],
  [
    "",
    "Ne le deposez pas dans le depot de code : tout ce qui s'y trouve est servi par l'hebergeur a qui connait l'adresse.",
  ],
  ["", ""],
  ["Comment le remplir", ""],
  ["", "Une ligne par bloc de justification. Remplissez la feuille \"" + DATA_SHEET + '".'],
  ["", ""],
  [
    "Famille de coversheet",
    "La famille du document de certification : SyDMP, SSA, VVS, SyDAS... C'est elle qui regroupe les blocs.",
  ],
  [
    "Exigences",
    "Les exigences du bloc, telles qu'elles se citent. Separez-les par un point-virgule ou une virgule.",
  ],
  [
    "",
    "Toutes les exigences d'une ligne doivent etre selectionnees pour que sa redaction soit restituee.",
  ],
  [
    "",
    "C'est ce qui permet d'ecrire deux lignes differentes : une pour A seule, une pour A et B ensemble.",
  ],
  ["Moyens de conformite", "Facultatif. A remplir seulement si le bloc porte un MoC different du document."],
  [
    "Redaction",
    "Le texte du bloc. Ecrivez §x.x partout ou un chapitre devra etre pointe.",
  ],
  [
    "",
    "L'application compte ces reperes et vous rappelle combien il en reste ; elle ne cherche jamais a les deviner.",
  ],
  ["Coversheet source", "Facultatif. D'ou vient cette redaction, pour pouvoir y revenir."],
  ["", ""],
  ["Ce que l'application ne fait pas", ""],
  [
    "",
    "Elle ne redige rien et ne devine aucun paragraphe. Tout ce qu'elle restitue a d'abord ete ecrit dans ce fichier.",
  ],
];

/**
 * Exemples fictifs, dans une feuille separee pour ne pas etre pris pour des
 * donnees a conserver. Les deux premieres lignes montrent volontairement la
 * meme exigence traitee seule puis accompagnee.
 */
const EXAMPLES = [
  {
    famille: "SYDMP",
    exigences: "CS 25.671(a) ; JAR 25.1301(a)",
    moc: "0",
    redaction: [
      "The enclosed SyDMP is the master plan describing the development assurance",
      "activities to be performed for the change requests listed in §x.x.",
      "",
      "The SyDMP references in §x.x the other plans describing the activities to be",
      "performed, and provides in §x.x the list of applicable rules.",
    ].join("\n"),
    source: "CVS-SYDMP fictive issue 1",
  },
  {
    famille: "SYDMP",
    exigences: "CS 25.671(a)",
    moc: "0",
    redaction: [
      "The enclosed SyDMP describes in §x.x the development assurance activities",
      "applicable to this requirement, and justifies in §x.x the deviations to the",
      "applicable processes.",
    ].join("\n"),
    source: "CVS-SYDMP fictive issue 1",
  },
  {
    famille: "SSA",
    exigences: "CS 25.671(c)(1) ; CS 25.1309(b)",
    moc: "3",
    redaction: [
      "Combinations of failures have been classified in §x.x, and adequate failure",
      "probabilities are demonstrated in §x.x.",
    ].join("\n"),
    source: "CVS-SSA fictive issue 4",
  },
];

function styleHeader(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E5AA8" } };
  row.alignment = { vertical: "middle" };
  row.height = 22;
}

function addDataSheet(workbook, name, rows) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = COLUMNS;
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) sheet.addRow(row);

  // Le texte des redactions est multi-ligne : sans retour a la ligne
  // automatique, la colonne est illisible et invite a tronquer.
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    row.alignment = { vertical: "top", wrapText: true };
  });

  return sheet;
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Outillage certification ATA 27";
  workbook.created = new Date();

  const notice = workbook.addWorksheet("Notice");
  notice.columns = [
    { header: "", key: "titre", width: 26 },
    { header: "", key: "texte", width: 110 },
  ];
  for (const [titre, texte] of NOTICE) {
    const row = notice.addRow({ titre, texte });
    if (titre && !texte) row.font = { bold: true, size: 12 };
    if (titre && texte) row.getCell("titre").font = { bold: true };
    row.alignment = { vertical: "top", wrapText: true };
  }

  // Feuille a completer : en-tetes seuls.
  addDataSheet(workbook, DATA_SHEET, []);
  addDataSheet(workbook, "Exemple (a supprimer)", EXAMPLES);

  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, FILE_NAME);
  await workbook.xlsx.writeFile(path);
  console.log(`[modele] ${path}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
