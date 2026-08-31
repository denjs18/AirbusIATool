/**
 * Lecture du classeur Excel de blocs types.
 *
 * Le classeur est rempli a la main par les equipes et recharge a chaque
 * ouverture. Il est donc lu avec indulgence sur la forme (ordre des colonnes,
 * accents, casse, separateurs) et avec rigueur sur le fond : chaque ligne
 * rejetee est signalee avec son numero et sa raison, plutot qu'ignoree en
 * silence. Un fichier a moitie lu sans que personne ne le sache serait pire
 * qu'un fichier refuse.
 *
 * La lecture se fait dans le navigateur : le classeur ne quitte pas le poste.
 */
import { extractMocIds, dedupeRequirements, extractOccurrencesFromPage } from "./requirements";
import { mergeTemplates, EMPTY_LIBRARY, type BlockTemplate, type TemplateLibrary } from "./templates";

/** Feuille lue par l'application ; le nom fait partie du contrat du modele. */
export const DATA_SHEET = "Blocs types";

/** Colonnes attendues, reconnues a l'accent et a la casse pres. */
const COLUMN_ALIASES = {
  documentType: ["famille de coversheet", "famille", "coversheet", "type de document"],
  requirements: ["exigences", "exigence", "requirements"],
  moc: ["moyens de conformite", "moyen de conformite", "moc", "means of compliance"],
  text: ["redaction", "texte", "justification"],
  source: ["coversheet source", "source"],
} as const;

type ColumnKey = keyof typeof COLUMN_ALIASES;

export interface WorkbookIssue {
  /** Numero de ligne tel qu'affiche dans Excel, pour pouvoir y retourner. */
  row: number;
  message: string;
}

export interface WorkbookParseResult {
  library: TemplateLibrary;
  issues: WorkbookIssue[];
  /** Lignes de donnees rencontrees, retenues ou non. */
  rowsRead: number;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/**
 * Localise la ligne d'en-tete et la position de chaque colonne.
 * L'ordre des colonnes n'est pas impose : seul leur intitule compte, ce qui
 * evite qu'une colonne inseree a la main casse la lecture.
 */
function locateColumns(rows: unknown[][]):
  | { headerRow: number; columns: Partial<Record<ColumnKey, number>> }
  | undefined {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const headers = (rows[index] ?? []).map(normalizeHeader);
    const columns: Partial<Record<ColumnKey, number>> = {};

    for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as [ColumnKey, readonly string[]][]) {
      const position = headers.findIndex((header) => aliases.includes(header));
      if (position >= 0) columns[key] = position;
    }

    if (columns.documentType !== undefined && columns.requirements !== undefined) {
      return { headerRow: index, columns };
    }
  }
  return undefined;
}

/** Moyens de conformite d'une cellule : "0", "4, 6", "MoC 3", "S". */
function parseMocCell(value: string): string[] {
  if (!value) return [];
  const viaLabel = extractMocIds(value);
  if (viaLabel.length) return viaLabel;
  return value
    .split(/[,;/&\s]+/)
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^(?:[0-9]|[A-Z])$/.test(token));
}

/** Convertit les lignes d'une feuille en bibliotheque de blocs types. */
export function parseWorkbookRows(rows: unknown[][]): WorkbookParseResult {
  const located = locateColumns(rows);
  if (!located) {
    return {
      library: EMPTY_LIBRARY,
      rowsRead: 0,
      issues: [
        {
          row: 0,
          message:
            'En-tetes introuvables. La feuille doit comporter au moins les colonnes "Famille de coversheet" et "Exigences". Repartez du modele telechargeable.',
        },
      ],
    };
  }

  const { headerRow, columns } = located;
  const issues: WorkbookIssue[] = [];
  const templates: BlockTemplate[] = [];
  // Une meme combinaison ne peut porter qu'une redaction : un doublon serait
  // silencieusement ecrase, on prefere le dire.
  const seen = new Map<string, number>();
  let rowsRead = 0;

  for (let index = headerRow + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const at = (key: ColumnKey) =>
      columns[key] === undefined ? "" : cellText(row[columns[key]!]);

    const documentType = at("documentType");
    const requirementsCell = at("requirements");
    const text = columns.text === undefined ? "" : String(row[columns.text] ?? "").trim();

    // Ligne entierement vide : fin de tableau ou trou de mise en page.
    if (!documentType && !requirementsCell && !text) continue;

    rowsRead += 1;
    const excelRow = index + 1;

    if (!documentType) {
      issues.push({ row: excelRow, message: "Famille de coversheet absente : ligne ignoree." });
      continue;
    }

    const requirements = dedupeRequirements(
      extractOccurrencesFromPage(requirementsCell, 1),
    );
    if (!requirements.length) {
      issues.push({
        row: excelRow,
        message: `Aucune exigence reconnue dans "${requirementsCell || "(vide)"}" : ligne ignoree.`,
      });
      continue;
    }

    const key = `${documentType.toUpperCase()}::${requirements.map((r) => r.id).sort().join("|")}`;
    const previous = seen.get(key);
    if (previous !== undefined) {
      issues.push({
        row: excelRow,
        message: `Meme famille et memes exigences qu'a la ligne ${previous} : cette ligne remplace la precedente.`,
      });
    }
    seen.set(key, excelRow);

    if (!text) {
      issues.push({
        row: excelRow,
        message: "Redaction vide : le regroupement est retenu, mais rien ne sera restitue.",
      });
    }

    const mocIds = parseMocCell(at("moc"));
    const source = at("source");

    templates.push({
      documentType,
      requirementIds: requirements.map((requirement) => requirement.id),
      text: text || undefined,
      mocIds: mocIds.length ? mocIds : undefined,
      source: source || undefined,
    });
  }

  return { library: mergeTemplates(EMPTY_LIBRARY, templates), issues, rowsRead };
}

export interface WorkbookSheet {
  sheet: string;
  data: unknown[][];
}

/**
 * Choisit la feuille a lire dans un classeur.
 *
 * La feuille attendue passe en premier ; a defaut on retient la premiere qui
 * donne des blocs, ce qui evite qu'un onglet renomme ou duplique bloque la
 * lecture. La feuille d'exemples fournie avec le modele est ecartee : elle est
 * la pour montrer, pas pour etre chargee.
 */
export function readSheets(sheets: WorkbookSheet[]): WorkbookParseResult {
  const isExample = (name: string) => /exemple|example/i.test(name);
  const ordered = [
    ...sheets.filter((s) => s.sheet.trim().toLowerCase() === DATA_SHEET.toLowerCase()),
    ...sheets.filter(
      (s) => s.sheet.trim().toLowerCase() !== DATA_SHEET.toLowerCase() && !isExample(s.sheet),
    ),
  ];

  let fallback: WorkbookParseResult | undefined;
  for (const { data } of ordered) {
    const parsed = parseWorkbookRows(data);
    if (parsed.library.templates.length) return parsed;
    fallback ??= parsed;
  }

  return (
    fallback ?? {
      library: EMPTY_LIBRARY,
      issues: [{ row: 0, message: "Aucune feuille exploitable dans ce classeur." }],
      rowsRead: 0,
    }
  );
}
