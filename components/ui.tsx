"use client";

/**
 * Briques d'interface partagees par les cinq modules.
 * Regroupees ici pour garantir une lecture identique des statuts d'un module a
 * l'autre : en revue, un "warning" doit toujours avoir la meme apparence.
 */
import type { ReactNode } from "react";
import type { CheckResult, CheckStatus } from "@/lib/types";

const STATUS_STYLE: Record<CheckStatus, { bg: string; fg: string; label: string }> = {
  ok: { bg: "bg-ok-100", fg: "text-ok-500", label: "Conforme" },
  warning: { bg: "bg-warn-100", fg: "text-warn-500", label: "A verifier" },
  error: { bg: "bg-err-100", fg: "text-err-500", label: "Non conforme" },
  info: { bg: "bg-info-100", fg: "text-info-500", label: "Information" },
};

export function StatusBadge({ status }: { status: CheckStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={`${style.bg} ${style.fg} inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-semibold tracking-wide uppercase`}
    >
      {style.label}
    </span>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-lg border p-4 sm:p-5"
      style={{ borderColor: "var(--border)", background: "var(--surface-raised)" }}
    >
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {subtitle && (
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  title?: string;
}) {
  const base =
    "rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45";
  const styles =
    variant === "primary"
      ? "bg-brand-500 text-white hover:bg-brand-600"
      : "border hover:bg-ink-100/60 dark:hover:bg-ink-800";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${styles}`}
      style={variant === "secondary" ? { borderColor: "var(--border)" } : undefined}
    >
      {children}
    </button>
  );
}

/** Compteur de synthese affiche en tete de resultats. */
export function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: CheckStatus;
}) {
  const fg = tone ? STATUS_STYLE[tone].fg : "";
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className={`text-xl font-semibold tabular-nums ${fg}`}>{value}</div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

/** Liste de resultats de controle, ordonnee du plus grave au moins grave. */
export function ResultList({ results }: { results: CheckResult[] }) {
  const severity: Record<CheckStatus, number> = { error: 0, warning: 1, info: 2, ok: 3 };
  const sorted = [...results].sort((a, b) => severity[a.status] - severity[b.status]);

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((result) => (
        <li
          key={result.id}
          className="rounded-md border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={result.status} />
            <span className="text-sm font-medium">{result.label}</span>
            {result.location?.page !== undefined && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                page {result.location.page}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            {result.detail}
          </p>
          {result.suggestion && (
            <p className="mt-1.5 text-sm">
              <span className="font-medium">Action proposee : </span>
              {result.suggestion}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Zone de depot de fichier, avec chargement de l'exemple fictif en repli. */
export function FileInput({
  label,
  accept,
  onFile,
  demoLabel,
  onDemo,
  busy,
  loaded,
}: {
  label: string;
  accept: string;
  onFile: (file: File) => void;
  demoLabel?: string;
  onDemo?: () => void;
  busy?: boolean;
  loaded?: string;
}) {
  return (
    <div
      className="rounded-md border border-dashed p-4"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">{label}</label>
        <input
          type="file"
          accept={accept}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            // Permet de recharger deux fois le meme fichier apres correction.
            event.target.value = "";
          }}
          className="text-sm"
        />
        {onDemo && (
          <Button variant="secondary" onClick={onDemo} disabled={busy}>
            {demoLabel ?? "Charger l'exemple fictif"}
          </Button>
        )}
      </div>
      {busy && (
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Lecture du document en cours...
        </p>
      )}
      {loaded && !busy && (
        <p className="mt-2 text-sm">
          Charge : <span className="font-mono text-xs">{loaded}</span>
        </p>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
      {children}
    </p>
  );
}
