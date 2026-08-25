"use client";

/**
 * Etat "aucun plan charge" des modules qui derivent de l'ACP.
 *
 * Ces modules ont besoin du plan, mais on ne veut pas renvoyer l'utilisateur
 * vers un autre onglet : en demonstration, chaque module doit pouvoir partir de
 * zero. Le plan charge ici alimente aussi les autres modules.
 */
import { useState } from "react";
import { Button, Card } from "../ui";
import { describeLoadError, loadDemoPlan } from "@/lib/demo";
import type { ParsedPlan } from "@/lib/types";

export default function PlanRequired({
  title,
  explanation,
  onPlan,
}: {
  title: string;
  explanation: string;
  onPlan: (plan: ParsedPlan) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function load() {
    setBusy(true);
    setError(undefined);
    try {
      onPlan(await loadDemoPlan());
    } catch (cause) {
      setError(describeLoadError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={title}>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {explanation}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={load} disabled={busy}>
          {busy ? "Lecture en cours..." : "Charger l'ACP fictif"}
        </Button>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          ou importez votre propre ACP dans l&apos;onglet 1.
        </span>
      </div>
      {error && <p className="mt-3 text-sm text-err-500">{error}</p>}
    </Card>
  );
}
