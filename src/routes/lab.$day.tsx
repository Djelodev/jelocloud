import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getLab, LABS, MODULES, type Lab } from "@/lib/labs";
import { CREDS } from "@/lib/engine";
import { worldFor } from "@/lib/labs/scenario";
import { LabTerminal } from "@/components/LabTerminal";
import { useProgress } from "@/lib/progress";
import { CopyCode } from "@/components/CopyCode";
import { Brand } from "@/components/Brand";

export const Route = createFileRoute("/lab/$day")({
  loader: ({ params }) => {
    if (!/^[1-9]\d{0,2}$/.test(params.day)) throw notFound();
    const lab = getLab(Number(params.day));
    if (!lab) throw notFound();
    return { day: lab.day, title: lab.title, objectif: lab.objectif };
  },
  head: ({ loaderData }) => {
    const t = loaderData
      ? `Jour ${loaderData.day} : ${loaderData.title} — Jelo Cloud`
      : "Lab — Jelo Cloud";
    const d = loaderData?.objectif ?? "Lab DevOps pratique.";
    return {
      meta: [
        { title: t },
        { name: "description", content: d },
        { property: "og:title", content: t },
        { property: "og:description", content: d },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: LabPage,
});

function LabPage() {
  const { day } = Route.useLoaderData();
  return <LabWorkspace key={day} lab={getLab(day)!} />;
}

function LabWorkspace({ lab }: { lab: Lab }) {
  const [world, setWorld] = useState(() => worldFor(lab));
  const [attempt, setAttempt] = useState(0);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [panel, setPanel] = useState<"guide" | "terminal">("guide");
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [, update] = useState(0);
  const { done, complete } = useProgress();
  const mod = MODULES.find((module) => module.id === lab.module)!;
  const prev = LABS[lab.day - 2];
  const next = LABS[lab.day];
  const results = lab.checks.map(({ label, test }) => ({ label, passed: test(world) }));

  const passedCount = results.filter((result) => result.passed).length;
  const passed = results.length > 0 && passedCount === results.length;

  function verify() {
    setVerified(passed);
    if (passed) complete(lab.day);
  }

  function restart() {
    setWorld(worldFor(lab));
    setAttempt((value) => value + 1);
    setVerified(null);
    setConfirmRestart(false);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-5">
        <div className="flex items-center gap-4">
          <Brand />
          <span className="hidden font-mono text-xs text-muted-foreground md:inline">
            {mod.icon} {mod.nom}
          </span>
        </div>
        <nav
          aria-label="Navigation entre les labs"
          className="flex items-center gap-2 font-mono text-sm"
        >
          {prev && (
            <Link
              to="/lab/$day"
              params={{ day: String(prev.day) }}
              aria-label={`Jour précédent, jour ${prev.day}`}
              className="rounded border border-border px-2 py-2 hover:border-primary"
            >
              ← J{prev.day}
            </Link>
          )}
          {next && (
            <Link
              to="/lab/$day"
              params={{ day: String(next.day) }}
              aria-label={`Jour suivant, jour ${next.day}`}
              className="rounded border border-border px-2 py-2 hover:border-primary"
            >
              J{next.day} →
            </Link>
          )}
        </nav>
      </header>
      <div
        role="group"
        aria-label="Panneaux du lab"
        className="grid shrink-0 grid-cols-2 gap-2 border-b border-border p-2 lg:hidden"
      >
        {(["guide", "terminal"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={panel === choice}
            aria-controls={`lab-${choice}`}
            onClick={() => setPanel(choice)}
            className={`min-h-10 rounded-md border px-3 text-sm font-semibold ${panel === choice ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {choice === "guide" ? "Guide du lab" : "Terminal"}
          </button>
        ))}
      </div>
      <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <aside
          id="lab-guide"
          aria-label="Guide du lab"
          className={`min-w-0 overflow-y-auto px-4 py-5 lg:block lg:border-r lg:border-border lg:px-6 ${panel === "guide" ? "" : "hidden"}`}
        >
          <p className="font-mono text-xs text-primary">
            JOUR {lab.day} / 100 {done.includes(lab.day) && "· ✔ terminé"}
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{lab.title}</h1>
          <p className="mt-4 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
            {lab.objectif}
          </p>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Le concept
          </h2>
          <p className="mt-2 text-sm leading-relaxed">{lab.concept}</p>
          {lab.astuce && (
            <p className="mt-3 rounded bg-muted p-3 text-sm text-muted-foreground">{lab.astuce}</p>
          )}
          <section className="mt-6 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Vérification</h2>
              <span className="font-mono text-xs text-muted-foreground">
                {passedCount}/{results.length} validés
              </span>
            </div>
            <ul className="mt-2 space-y-2 text-sm">
              {results.map(({ label, passed }) => (
                <li key={label} className={passed ? "text-primary" : "text-muted-foreground"}>
                  <span className="sr-only">{passed ? "Validé" : "À faire"} — </span>
                  <span aria-hidden="true">{passed ? "✔" : "○"} </span>
                  {label}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={verify}
              className="mt-3 rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              Vérifier
            </button>
            <div aria-live="polite">
              {verified === true && passed && (
                <p className="mt-2 text-sm font-semibold text-primary">
                  Lab réussi. Ta progression est à jour.
                </p>
              )}
              {verified === false && !passed && (
                <p className="mt-2 text-sm text-accent">
                  Il reste des objectifs à remplir. La liste indique ceux qui sont en attente.
                </p>
              )}
            </div>
            {verified === true && passed && next && (
              <Link
                to="/lab/$day"
                params={{ day: String(next.day) }}
                className="mt-2 inline-block text-sm text-primary underline"
              >
                Jour suivant →
              </Link>
            )}
          </section>
          <details className="mt-4 rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Identifiants des serveurs</summary>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {Object.entries(CREDS).map(([server, credential]) => (
                <div key={server} className="contents">
                  <dt className="font-mono text-xs">{server}</dt>
                  <dd className="font-mono text-xs text-muted-foreground">
                    {credential.user} / {credential.pass} <br />
                    {credential.ip}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Étapes
          </h2>
          <ol className="mt-3 space-y-3">
            {lab.steps.map((step, index) => (
              <li key={index} className="rounded-md border border-border p-3 text-sm">
                <div className="font-semibold">
                  {index + 1}. {step.titre}
                </div>
                {step.explication && (
                  <p className="mt-1 text-muted-foreground">{step.explication}</p>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer font-mono text-xs text-accent">
                    Afficher la solution
                  </summary>
                  <CopyCode text={step.cmd} label="Copier la commande" />
                  {step.edit && (
                    <CopyCode text={step.edit.content} label="Copier le contenu du fichier" />
                  )}
                </details>
              </li>
            ))}
          </ol>
        </aside>
        <section
          id="lab-terminal"
          aria-label="Simulateur"
          className={`min-h-0 min-w-0 flex-col bg-terminal lg:flex ${panel === "terminal" ? "flex" : "hidden"}`}
        >
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h2 className="font-mono text-sm font-semibold">Terminal</h2>
            <button
              type="button"
              aria-expanded={confirmRestart}
              onClick={() => setConfirmRestart(!confirmRestart)}
              className="rounded-md border border-border px-3 py-2 text-xs hover:border-accent hover:text-accent"
            >
              Recommencer le lab
            </button>
          </header>
          {confirmRestart && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-accent/40 bg-accent/10 px-3 py-2 text-sm">
              <p className="grow">
                La session simulée repart de zéro. Les jours terminés restent acquis.
              </p>
              <button
                type="button"
                onClick={() => setConfirmRestart(false)}
                className="rounded-md border border-border px-3 py-2"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={restart}
                className="rounded-md bg-accent px-3 py-2 font-semibold text-accent-foreground"
              >
                Confirmer
              </button>
            </div>
          )}
          <LabTerminal
            key={attempt}
            world={world}
            day={lab.day}
            onChange={() => update((value) => value + 1)}
          />
        </section>
      </main>
    </div>
  );
}
