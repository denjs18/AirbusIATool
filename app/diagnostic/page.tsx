import DiagnosticPanel from "@/components/diagnostic-panel";

export const metadata = {
  title: "Diagnostic de compatibilite",
};

export default function DiagnosticPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3">
        <a href="/" className="text-sm text-brand-500 hover:underline">
          &larr; Retour a l&apos;outil
        </a>
        <h1 className="text-2xl font-semibold">Diagnostic de compatibilite</h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Cette page verifie ce que ce navigateur sait faire et rejoue la lecture d&apos;un PDF
          etape par etape. Elle sert a identifier precisement ce qui echoue sur un appareil,
          plutot qu&apos;a le deviner. Aucune donnee n&apos;est transmise : le rapport reste sur
          cet appareil tant que vous ne le copiez pas vous-meme.
        </p>
      </header>
      <DiagnosticPanel />
    </main>
  );
}
