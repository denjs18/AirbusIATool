"use client";

/**
 * Plan de travail unique regroupant les cinq modules.
 *
 * Choix assume d'un espace unique plutot que de pages separees : l'ACP importe
 * alimente la generation de trames et le recoupement. En reunion, on veut
 * importer une fois et derouler la chaine complete sans recharger.
 */
import { useState } from "react";
import CoherencePanel from "./panels/coherence-panel";
import CoversheetsPanel from "./panels/coversheets-panel";
import CrossCheckPanel from "./panels/crosscheck-panel";
import PlanPanel from "./panels/plan-panel";
import type { ParsedPlan } from "@/lib/types";

const TABS = [
  { id: "plan", label: "1. Plan de certification", hint: "Extraction des exigences citees" },
  { id: "coversheets", label: "2. Preparer une coversheet", hint: "Exigences puis document de certification" },
  { id: "coherence", label: "3. Coherence des renvois", hint: "Chapitre cite / contenu reel" },
  { id: "crosscheck", label: "4. Recoupement", hint: "ACP / coversheets emises" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Workspace() {
  const [tab, setTab] = useState<TabId>("plan");
  // Le plan est le seul etat partage entre modules : il alimente la generation
  // de trames (module 2) et le recoupement (module 5).
  const [plan, setPlan] = useState<ParsedPlan>();

  return (
    <div className="flex flex-col gap-5">
      <nav className="scroll-x">
        <ul className="flex min-w-max gap-1.5">
          {TABS.map((item) => {
            const active = item.id === tab;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setTab(item.id)}
                  title={item.hint}
                  className={`rounded-md px-3 py-2 text-left text-sm transition ${
                    active ? "bg-brand-500 text-white" : "hover:bg-ink-100 dark:hover:bg-ink-800"
                  }`}
                  style={active ? undefined : { color: "var(--text-muted)" }}
                >
                  <span className="block font-medium">{item.label}</span>
                  <span className={`block text-xs ${active ? "text-white/80" : ""}`}>
                    {item.hint}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "plan" && <PlanPanel plan={plan} onPlan={setPlan} />}
      {tab === "coversheets" && <CoversheetsPanel plan={plan} onPlan={setPlan} />}
      {tab === "coherence" && <CoherencePanel />}
      {tab === "crosscheck" && <CrossCheckPanel plan={plan} onPlan={setPlan} />}
    </div>
  );
}
