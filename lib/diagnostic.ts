/**
 * Diagnostic de compatibilite navigateur.
 *
 * Sert a remplacer la devinette par des faits quand l'outil echoue sur un
 * appareil qu'on n'a pas sous la main. Deux volets :
 *  - detection des API modernes reellement disponibles ;
 *  - execution de la chaine de lecture PDF etape par etape, de facon a savoir
 *    laquelle echoue et avec quelle pile d'appel.
 */

export interface FeatureProbe {
  name: string;
  /** Version Safari a partir de laquelle l'API existe nativement. */
  since: string;
  available: boolean;
}

/** Teste une expression sans laisser une exception interrompre le diagnostic. */
function safe(probe: () => boolean): boolean {
  try {
    return probe();
  } catch {
    return false;
  }
}

export function probeFeatures(): FeatureProbe[] {
  const g = globalThis as Record<string, unknown>;

  return [
    { name: "Promise.withResolvers", since: "17.4", available: safe(() => typeof (Promise as unknown as { withResolvers?: unknown }).withResolvers === "function") },
    { name: "structuredClone", since: "15.4", available: safe(() => typeof g.structuredClone === "function") },
    { name: "Object.hasOwn", since: "15.4", available: safe(() => typeof Object.hasOwn === "function") },
    { name: "Object.groupBy", since: "17.4", available: safe(() => typeof (Object as unknown as { groupBy?: unknown }).groupBy === "function") },
    { name: "Array.prototype.at", since: "15.4", available: safe(() => typeof [].at === "function") },
    { name: "Array.prototype.findLast", since: "15.4", available: safe(() => typeof (([] as unknown) as { findLast?: unknown }).findLast === "function") },
    { name: "Array.prototype.flatMap", since: "12", available: safe(() => typeof [].flatMap === "function") },
    { name: "Array.prototype.toSorted", since: "16.4", available: safe(() => typeof (([] as unknown) as { toSorted?: unknown }).toSorted === "function") },
    { name: "String.prototype.matchAll", since: "13", available: safe(() => typeof "".matchAll === "function") },
    { name: "String.prototype.replaceAll", since: "13.1", available: safe(() => typeof "".replaceAll === "function") },
    { name: "Blob.prototype.arrayBuffer", since: "14", available: safe(() => typeof Blob.prototype.arrayBuffer === "function") },
    { name: "Blob.prototype.text", since: "14", available: safe(() => typeof Blob.prototype.text === "function") },
    { name: "Iterator helpers (.toArray)", since: "18.4", available: safe(() => typeof (Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())) as { toArray?: unknown }).toArray === "function") },
    { name: "Set.prototype.union", since: "17", available: safe(() => typeof (new Set() as unknown as { union?: unknown }).union === "function") },
    { name: "Workers de type module", since: "15", available: safe(() => moduleWorkersSupported()) },
    { name: "OffscreenCanvas", since: "16.4", available: safe(() => typeof g.OffscreenCanvas === "function") },
    { name: "WeakRef", since: "14.1", available: safe(() => typeof g.WeakRef === "function") },
    { name: "RegExp lookbehind", since: "16.4", available: safe(() => { new RegExp("(?<=a)b"); return true; }) },
  ];
}

/**
 * Detecte le support des workers de type module sans en creer un reellement :
 * on observe si l'option `type` est lue par le constructeur.
 */
function moduleWorkersSupported(): boolean {
  if (typeof Worker !== "function") return false;
  let read = false;
  const options = {
    get type() {
      read = true;
      return "module";
    },
  };
  try {
    // URL inerte : le worker est immediatement termine.
    const worker = new Worker("data:text/javascript,", options as WorkerOptions);
    worker.terminate();
  } catch {
    // Peu importe l'echec de creation : seule la lecture de l'option compte.
  }
  return read;
}

export interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
  errorName?: string;
  errorStack?: string;
}

function describeError(cause: unknown): Pick<StepResult, "detail" | "errorName" | "errorStack"> {
  if (cause instanceof Error) {
    return {
      detail: cause.message,
      errorName: cause.name,
      errorStack: (cause.stack ?? "").split("\n").slice(0, 8).join("\n"),
    };
  }
  return { detail: String(cause) };
}

/**
 * Rejoue la chaine de lecture PDF etape par etape.
 * On s'arrete a la premiere etape en echec : les suivantes en dependent.
 */
export async function runPdfPipeline(path: string): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  const record = async (step: string, run: () => Promise<string>) => {
    try {
      steps.push({ step, ok: true, detail: await run() });
      return true;
    } catch (cause) {
      steps.push({ step, ok: false, ...describeError(cause) });
      return false;
    }
  };

  let buffer: ArrayBuffer | undefined;
  let pdfjs: typeof import("pdfjs-dist") | undefined;
  let doc: Awaited<ReturnType<typeof import("pdfjs-dist").getDocument>["promise"]> | undefined;

  if (
    !(await record("1. Telechargement du PDF", async () => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      buffer = await response.arrayBuffer();
      return `${Math.round(buffer.byteLength / 1024)} Ko recus`;
    }))
  ) {
    return steps;
  }

  if (
    !(await record("2. Telechargement du worker", async () => {
      const response = await fetch("/pdf.worker.min.mjs");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get("content-type") ?? "inconnu";
      const size = (await response.arrayBuffer()).byteLength;
      return `${Math.round(size / 1024)} Ko, content-type ${type}`;
    }))
  ) {
    return steps;
  }

  if (
    !(await record("3. Chargement du module pdf.js", async () => {
      pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as typeof import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return `version ${(pdfjs as unknown as { version?: string }).version ?? "inconnue"}`;
    }))
  ) {
    return steps;
  }

  if (
    !(await record("4. Ouverture du document", async () => {
      doc = await pdfjs!.getDocument({ data: new Uint8Array(buffer!) }).promise;
      return `${doc.numPages} pages`;
    }))
  ) {
    return steps;
  }

  await record("5. Extraction du texte", async () => {
    const page = await doc!.getPage(1);
    const content = await page.getTextContent();
    return `${content.items.length} fragments sur la page 1`;
  });

  await record("6. Analyse des exigences", async () => {
    const { extractOccurrencesFromPage } = await import("./requirements");
    const page = await doc!.getPage(2);
    const content = await page.getTextContent();
    const { itemsToLines } = await import("./pdf");
    const text = itemsToLines(content.items as { str: string; transform: number[] }[]).join("\n");
    return `${extractOccurrencesFromPage(text, 2).length} exigences sur la page 2`;
  });

  return steps;
}

/** Rapport texte, destine a etre copie et transmis. */
export function formatReport(features: FeatureProbe[], steps: StepResult[]): string {
  const lines = [
    "RAPPORT DE DIAGNOSTIC",
    `Date : ${new Date().toISOString()}`,
    `Navigateur : ${typeof navigator === "undefined" ? "inconnu" : navigator.userAgent}`,
    "",
    "API DISPONIBLES",
  ];

  for (const feature of features) {
    lines.push(`  ${feature.available ? "OUI" : "NON"}  ${feature.name} (Safari ${feature.since}+)`);
  }

  lines.push("", "CHAINE DE LECTURE PDF");
  if (!steps.length) {
    lines.push("  (test non lance)");
  }
  for (const step of steps) {
    lines.push(`  ${step.ok ? "OK  " : "ECHEC"} ${step.step} : ${step.detail}`);
    if (step.errorName) lines.push(`        type : ${step.errorName}`);
    if (step.errorStack) {
      for (const line of step.errorStack.split("\n")) lines.push(`        ${line.trim()}`);
    }
  }

  return lines.join("\n");
}
