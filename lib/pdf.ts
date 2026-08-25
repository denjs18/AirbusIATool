/**
 * Extraction de texte PDF cote navigateur.
 *
 * Point d'architecture important pour la certification : pdf.js tourne dans
 * l'onglet du poste utilisateur. Les documents ne sont jamais televerses, il n'y
 * a pas de stockage serveur et pas d'appel a un service externe. C'est ce qui
 * permet d'envisager l'outil sans instruction d'accessibilite des donnees.
 *
 * On utilise volontairement le build "legacy" de pdf.js, et non le build par
 * defaut. Le build par defaut appelle Promise.withResolvers() sans repli, une
 * API disponible seulement a partir de Safari 17.4 / iOS 17.4 : sur un iPhone
 * plus ancien, le chargement d'un PDF echoue avec un message incomprehensible.
 * Le build legacy est transpile et embarque les polyfills necessaires. Un outil
 * de demonstration doit fonctionner sur le telephone de la personne en face,
 * pas seulement sur un poste a jour.
 */
import type { PdfDocumentText, PdfPage } from "./types";

/** Tolerance verticale de regroupement des fragments en lignes, en points PDF. */
const LINE_TOLERANCE = 2.5;

type TextItem = { str: string; transform: number[] };

/**
 * Reconstitue les lignes a partir des fragments positionnes de pdf.js.
 * pdf.js restitue des fragments sans notion de ligne : sans ce regroupement, la
 * detection des titres de chapitre en debut de ligne est impossible.
 */
export function itemsToLines(items: TextItem[]): string[] {
  const rows = new Map<number, { x: number; str: string }[]>();

  for (const item of items) {
    if (!item.str) continue;
    const y = item.transform[5];
    const x = item.transform[4];

    // On rattache le fragment a une ligne existante si l'ecart vertical est faible.
    let key = [...rows.keys()].find((candidate) => Math.abs(candidate - y) <= LINE_TOLERANCE);
    if (key === undefined) {
      key = y;
      rows.set(key, []);
    }
    rows.get(key)!.push({ x, str: item.str });
  }

  return [...rows.entries()]
    // Ordonnancement de lecture : de haut en bas (y decroissant en PDF).
    .sort((a, b) => b[0] - a[0])
    .map(([, fragments]) =>
      fragments
        .sort((a, b) => a.x - b.x)
        .map((fragment) => fragment.str)
        .join("")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/**
 * Filet de securite pour le thread principal sur les navigateurs anterieurs a
 * Safari 17.4 / iOS 17.4.
 *
 * A lui seul, ce polyfill ne suffit pas : le worker pdf.js s'execute dans un
 * scope separe qu'il n'atteint pas. C'est le build legacy, transpile et
 * polyfille cote script comme cote worker, qui corrige reellement le probleme
 * (verifie par scripts/smoke-legacy.mjs). On le conserve pour couvrir le code
 * applicatif du thread principal.
 */
function ensurePromiseWithResolvers() {
  const target = Promise as unknown as {
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };
  if (typeof target.withResolvers === "function") return;

  target.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/** Charge pdf.js a la demande et pointe le worker servi en statique. */
async function loadPdfJs() {
  ensurePromiseWithResolvers();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

let moduleWorkerProbe: Promise<boolean> | undefined;

/**
 * Verifie qu'un worker de type module demarre et communique reellement.
 *
 * On n'interroge pas une capacite declaree : on en cree un, minimal, et on
 * attend son message. Les workers de type module n'existent qu'a partir de
 * Safari 15 ; sur un appareil plus ancien la creation echoue, et pdf.js se
 * rabat alors sur un chemin qui depend d'un import dynamique fragile.
 */
function moduleWorkerWorks(): Promise<boolean> {
  moduleWorkerProbe ??= new Promise<boolean>((resolve) => {
    if (typeof Worker !== "function") {
      resolve(false);
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker("data:text/javascript,self.postMessage(1)", { type: "module" });
    } catch {
      resolve(false);
      return;
    }

    const finish = (works: boolean) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(works);
    };
    // Un worker qui ne repond pas rapidement est considere comme indisponible :
    // mieux vaut un repli sur que l'attente d'un message qui ne viendra pas.
    const timer = setTimeout(() => finish(false), 1500);
    worker.addEventListener("message", () => finish(true), { once: true });
    worker.addEventListener("error", () => finish(false), { once: true });
  });
  return moduleWorkerProbe;
}

let mainThreadWorkerLoaded: Promise<void> | undefined;

/**
 * Charge le code du worker dans le thread principal et l'enregistre sous le nom
 * que pdf.js consulte en priorite pour son mode sans worker.
 *
 * Quand le worker dedie ne peut pas demarrer, pdf.js se rabat sur un import
 * dynamique de l'URL du worker, annote `webpackIgnore`. Cette annotation est
 * propre a webpack, et l'import depend du reseau : si l'un ou l'autre echoue,
 * la lecture echoue.
 *
 * Deux raisons d'enregistrer ce module nous-memes, et de le faire AVANT toute
 * lecture :
 *  - il vient du bundle de l'application, donc ni resolution exotique ni
 *    requete reseau supplementaire au moment critique ;
 *  - pdf.js memorise le resultat de sa mise en place de worker. Un
 *    enregistrement posterieur au premier echec serait purement ignore, le
 *    resultat en echec etant reutilise tel quel.
 */
function loadMainThreadWorker(): Promise<void> {
  mainThreadWorkerLoaded ??= (async () => {
    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
    (globalThis as Record<string, unknown>).pdfjsWorker = workerModule;
  })();
  return mainThreadWorkerLoaded;
}

type ExecutionPath = "worker dedie" | "thread principal";

let executionPath: ExecutionPath | undefined;

/**
 * Chemin d'execution retenu lors de la derniere lecture.
 * Expose sous forme de fonction : une variable exportee serait capturee a
 * l'import, donc lue avant meme la lecture du document.
 */
export function lastExecutionPath(): ExecutionPath | undefined {
  return executionPath;
}

/** Extrait le texte page par page d'un PDF, sans quitter le navigateur. */
export async function extractPdfText(
  file: File | ArrayBuffer,
  sourceName = "document.pdf",
): Promise<PdfDocumentText> {
  const pdfjs = await loadPdfJs();
  // L'enregistrement du module de repli force pdf.js en mode sans worker de
  // maniere definitive : on ne le fait que si le worker ne peut pas demarrer,
  // sinon un gros ACP figerait l'interface pendant son analyse.
  if (!(await moduleWorkerWorks())) {
    await loadMainThreadWorker();
  }

  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const name = file instanceof ArrayBuffer ? sourceName : file.name;

  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const pdf = await task.promise;

  // Le port d'un worker reel est l'instance Worker elle-meme ; en mode sans
  // worker, pdf.js utilise un port en boucle locale.
  const taskInternals = task as unknown as { _worker?: { port?: unknown } };
  executionPath =
    typeof Worker === "function" && taskInternals._worker?.port instanceof Worker
      ? "worker dedie"
      : "thread principal";

  const pages: PdfPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({
        page: pageNumber,
        text: itemsToLines(content.items as TextItem[]).join("\n"),
      });
      page.cleanup();
    }
    return { sourceName: name, pages, pageCount: pdf.numPages };
  } finally {
    await pdf.destroy();
  }
}

/**
 * Convertit un texte colle a la main en document analysable.
 * Sert de voie de repli quand un PDF est un scan sans couche texte, et de mode
 * de demonstration sans fichier.
 */
export function textToDocument(text: string, sourceName = "saisie manuelle"): PdfDocumentText {
  // Le separateur de page explicite permet de conserver la notion de pagination.
  const parts = text.split(/^\s*---\s*page\s*---\s*$/gim);
  const pages: PdfPage[] = parts.map((part, index) => ({
    page: index + 1,
    text: part.trim(),
  }));
  return { sourceName, pages, pageCount: pages.length };
}
