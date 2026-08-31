import Workspace from "@/components/workspace";

/**
 * Page unique du prototype.
 *
 * Le bandeau de cadrage est volontairement en tete et non relegue en pied de
 * page : le premier point souleve en revue porte sur la donnee et sur la place
 * de l'IA. Autant y repondre avant la demonstration.
 */
export default function Home() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-brand-500">
          Prototype - assistance a la redaction de certification
        </p>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          Outillage des taches de certification ATA 27
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Quatre automatisations pour decharger les equipes des taches chronophages a faible
          valeur ajoutee : structurer l&apos;information des documents volumineux, preparer les
          coversheets a partir des exigences a couvrir, verifier les renvois et recouper les
          perimetres. La redaction technique reste integralement a la main des ingenieurs de
          certification.
        </p>
      </header>

      <section
        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3"
        style={{ borderColor: "var(--border)", background: "var(--surface-raised)" }}
      >
        <Frame
          title="Donnees fictives uniquement"
          body="Tous les documents d'exemple sont inventes. Aucune donnee de programme n'est presente dans ce prototype."
        />
        <Frame
          title="Traitement 100 % local"
          body="Les PDF sont lus dans le navigateur. Pas de televersement, pas de stockage serveur, pas d'appel a un service externe."
        />
        <Frame
          title="IA en assistance ponctuelle"
          body="Le moteur des controles est deterministe et testable. L'IA generative n'intervient pas dans les verifications."
        />
      </section>

      <Workspace />

      <footer
        className="border-t pt-4 text-xs leading-relaxed"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      >
        <p>
          Les controles de ce prototype sont des aides a la relecture. Ils ne constituent pas une
          demonstration de conformite et ne se substituent pas a la revue des ingenieurs de
          certification ni a l&apos;examen de l&apos;Agence.
        </p>
        <p className="mt-2">
          Un probleme de lecture des PDF sur cet appareil ?{" "}
          <a href="/diagnostic" className="text-brand-500 hover:underline">
            Lancer le diagnostic de compatibilite
          </a>
          .
        </p>
      </footer>
    </main>
  );
}

function Frame({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {body}
      </p>
    </div>
  );
}
