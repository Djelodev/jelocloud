import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getLab, LABS, MODULES, type Lab } from "@/lib/labs";
import { CREDS } from "@/lib/engine";
import { worldFor } from "@/lib/labs/scenario";
import { LabTerminal } from "@/components/LabTerminal";
import { useProgress } from "@/lib/progress";
import { Brand } from "@/components/Brand";

export const Route = createFileRoute("/lab/$day")({
  loader: ({ params }) => {
    const lab = getLab(Number(params.day));
    if (!lab) throw notFound();
    return { day: lab.day, title: lab.title, objectif: lab.objectif };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `Jour ${loaderData.day} : ${loaderData.title} — Jelo Cloud` : "Lab — Jelo Cloud";
    const d = loaderData?.objectif ?? "Lab DevOps pratique.";
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" }] };
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
  const [verified, setVerified] = useState(false);
  const [, update] = useState(0);
  const { done, complete, reset } = useProgress();
  const mod = MODULES.find((module) => module.id === lab.module)!;
  const prev = LABS[lab.day - 2];
  const next = LABS[lab.day];
  const results = lab.checks.map(({ label, test }) => ({ label, passed: test(world) }));

  const passed = results.every((result) => result.passed);

  function verify() {
    setVerified(true);
    if (passed) complete(lab.day);
  }

  function restart() {
    setWorld(worldFor(lab));
    setAttempt((value) => value + 1);
    setVerified(false);
    reset(lab.day);
  }

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-4">
          <Brand />
          <span className="hidden font-mono text-xs text-muted-foreground md:inline">{mod.icon} {mod.nom}</span>
        </div>
        <nav aria-label="Navigation entre les labs" className="flex items-center gap-2 font-mono text-sm">
          {prev && <Link to="/lab/$day" params={{ day: String(prev.day) }} className="rounded border border-border px-3 py-1 hover:border-primary">← J{prev.day}</Link>}
          {next && <Link to="/lab/$day" params={{ day: String(next.day) }} className="rounded border border-border px-3 py-1 hover:border-primary">J{next.day} →</Link>}
        </nav>
      </header>
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <aside className="min-w-0 border-r border-border p-6 md:overflow-y-auto">
          <p className="font-mono text-xs text-primary">JOUR {lab.day} / 100 {done.includes(lab.day) && "· ✔ terminé"}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{lab.title}</h1>
          <p className="mt-4 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">{lab.objectif}</p>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Le concept</h2>
          <p className="mt-2 text-sm leading-relaxed">{lab.concept}</p>
          {lab.astuce && <p className="mt-3 rounded bg-muted p-3 text-sm text-muted-foreground">{lab.astuce}</p>}
          <section className="mt-6 rounded-md border border-border p-3">
            <h2 className="text-sm font-semibold">Vérification</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {results.map(({ label, passed }) => (
                <li key={label} className={passed ? "text-primary" : "text-muted-foreground"}>
                  <span className="sr-only">{passed ? "Validé" : "À faire"} — </span>
                  <span aria-hidden="true">{passed ? "✔" : "○"} </span>{label}
                </li>
              ))}
            </ul>
            <button type="button" onClick={verify} className="mt-3 rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Vérifier</button>
            <div aria-live="polite">
              {verified && passed && done.includes(lab.day) && <p className="mt-2 text-sm font-semibold text-primary">Lab réussi et progression enregistrée.</p>}
              {verified && !passed && <p className="mt-2 text-sm text-accent">Certains contrôles sont encore en attente.</p>}
            </div>
            {verified && passed && done.includes(lab.day) && next &&
              <Link to="/lab/$day" params={{ day: String(next.day) }} className="mt-2 inline-block text-sm text-primary underline">Jour suivant →</Link>}
          </section>
          <details className="mt-4 rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Identifiants des serveurs</summary>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {Object.entries(CREDS).map(([server, credential]) => (
                <div key={server} className="contents">
                  <dt className="font-mono text-xs">{server}</dt>
                  <dd className="font-mono text-xs text-muted-foreground">{credential.user} / {credential.pass} <br />{credential.ip}</dd>
                </div>
              ))}
            </dl>
          </details>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Étapes</h2>
          <ol className="mt-3 space-y-3">
            {lab.steps.map((step, index) => (
              <li key={index} className="rounded-md border border-border p-3 text-sm">
                <div className="font-semibold">{index + 1}. {step.titre}</div>
                {step.explication && <p className="mt-1 text-muted-foreground">{step.explication}</p>}
                <details className="mt-2">
                  <summary className="cursor-pointer font-mono text-xs text-accent">Afficher la solution</summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-terminal px-2 py-1 text-xs text-terminal-foreground"><code>{step.cmd}</code></pre>
                  {step.edit && <pre className="mt-2 overflow-x-auto rounded bg-terminal p-2 text-xs text-terminal-foreground"><code>{step.edit.content}</code></pre>}
                </details>
              </li>
            ))}
          </ol>
          <button type="button" onClick={restart} className="mt-6 font-mono text-xs text-muted-foreground hover:text-destructive">↺ Réinitialiser le lab</button>
        </aside>
        <section aria-label="Simulateur" className="flex h-[65dvh] min-w-0 flex-col bg-terminal md:h-auto md:min-h-0">
          <h2 className="border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">Terminal</h2>
          <LabTerminal key={attempt} world={world} day={lab.day}
            onChange={() => update((value) => value + 1)} />
        </section>
      </div>
    </div>
  );
}
