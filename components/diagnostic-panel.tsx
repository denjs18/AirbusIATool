"use client";

/**
 * Panneau de diagnostic.
 *
 * La detection des API se fait apres montage : elle depend du navigateur et ne
 * peut pas etre calculee au rendu serveur.
 */
import { useEffect, useState } from "react";
import { Button, Card } from "./ui";
import { DEMO_FILES } from "@/lib/demo";
import {
  formatReport,
  probeFeatures,
  runPdfPipeline,
  type FeatureProbe,
  type StepResult,
} from "@/lib/diagnostic";

export default function DiagnosticPanel() {
  const [features, setFeatures] = useState<FeatureProbe[]>([]);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [userAgent, setUserAgent] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Le rapport depend du navigateur et de l'heure : il ne peut etre construit
  // qu'apres montage, sinon le HTML rendu par le serveur ne correspond pas.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setFeatures(probeFeatures());
    setUserAgent(navigator.userAgent);
    setMounted(true);
  }, []);

  async function runTest() {
    setBusy(true);
    setSteps([]);
    try {
      setSteps(await runPdfPipeline(DEMO_FILES.acp));
    } finally {
      setBusy(false);
    }
  }

  const report = mounted ? formatReport(features, steps) : "Detection en cours...";

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Sur les navigateurs sans presse-papier accessible, on laisse le rapport
      // visible plus bas : il reste selectionnable a la main.
      setCopied(false);
    }
  }

  const missing = features.filter((feature) => !feature.available);

  return (
    <div className="flex flex-col gap-5">
      <Card title="Test de lecture PDF" subtitle="C'est l'operation qui echoue. Chaque etape est isolee.">
        <Button onClick={runTest} disabled={busy}>
          {busy ? "Test en cours..." : "Lancer le test"}
        </Button>

        {steps.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {steps.map((step) => (
              <li
                key={step.step}
                className="rounded-md border p-3"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                      step.ok ? "bg-ok-100 text-ok-500" : "bg-err-100 text-err-500"
                    }`}
                  >
                    {step.ok ? "OK" : "Echec"}
                  </span>
                  <span className="text-sm font-medium">{step.step}</span>
                </div>
                <p className="mt-1.5 font-mono text-xs break-words" style={{ color: "var(--text-muted)" }}>
                  {step.errorName ? `${step.errorName}: ${step.detail}` : step.detail}
                </p>
                {step.errorStack && (
                  <pre className="mt-2 overflow-x-auto rounded border p-2 text-[11px] leading-relaxed"
                       style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                    {step.errorStack}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="API disponibles sur ce navigateur"
        subtitle={
          features.length === 0
            ? "Detection en cours..."
            : missing.length === 0
              ? "Toutes les API testees sont disponibles."
              : `${missing.length} API absentes sur ${features.length} testees.`
        }
      >
        <div className="scroll-x">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                <th className="pb-2 font-medium">API</th>
                <th className="pb-2 font-medium">Safari</th>
                <th className="pb-2 font-medium">Presente</th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => (
                <tr key={feature.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 font-mono text-xs">{feature.name}</td>
                  <td className="py-1.5 tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {feature.since}+
                  </td>
                  <td className={`py-1.5 font-semibold ${feature.available ? "text-ok-500" : "text-err-500"}`}>
                    {feature.available ? "oui" : "non"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Rapport a transmettre"
        actions={
          <Button variant="secondary" onClick={copyReport}>
            {copied ? "Copie" : "Copier le rapport"}
          </Button>
        }
      >
        <p className="mb-3 text-sm" style={{ color: "var(--text-muted)" }}>
          Navigateur : <span className="font-mono text-xs break-words">{userAgent || "..."}</span>
        </p>
        <pre
          className="max-h-80 overflow-auto rounded-md border p-3 text-[11px] leading-relaxed"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {report}
        </pre>
      </Card>
    </div>
  );
}
