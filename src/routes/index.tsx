import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LABS, MODULES, type Lab } from "@/lib/labs";
import { searchLabs } from "@/lib/labs/search";
import { useProgress } from "@/lib/progress";
import { Brand } from "@/components/Brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Jelo Cloud — 100 jours de DevOps" },
      { name: "description", content: "100 labs DevOps pratiques avec terminal intégré." },
      { property: "og:title", content: "Jelo Cloud — 100 jours de DevOps" },
      {
        property: "og:description",
        content:
          "100 labs pratiques Linux, Git, Docker, Kubernetes, Jenkins, Ansible et Terraform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function LabCard({ lab, done }: { lab: Lab; done: boolean }) {
  return (
    <Link
      to="/lab/$day"
      params={{ day: String(lab.day) }}
      className={`group block rounded-lg border bg-card p-4 transition hover:border-primary focus-visible:outline-2 focus-visible:outline-primary ${done ? "border-primary/60" : "border-border"}`}
    >
      <div className="flex items-center justify-between gap-2 font-mono text-xs">
        <span className="text-primary">JOUR {String(lab.day).padStart(3, "0")}</span>
        <span className={done ? "text-primary" : "text-muted-foreground"}>
          {done ? "✔ Terminé" : `${lab.steps.length} étape${lab.steps.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <h3 className="mt-2 font-semibold leading-snug group-hover:text-primary">{lab.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{lab.objectif}</p>
    </Link>
  );
}

function Index() {
  const { done } = useProgress();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const searching = !!query.trim();
  const results = useMemo(() => (searching ? searchLabs(query) : []), [query, searching]);
  const next = LABS.find((lab) => !done.includes(lab.day));
  const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Brand />
        <span className="font-mono text-xs text-muted-foreground sm:text-sm">
          {done.length}/{LABS.length} labs terminés
        </span>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <section className="py-8 sm:py-14">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">100 jours de DevOps</h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Pratique dans un terminal simulé, de ton premier utilisateur Linux à l’infrastructure
            AWS avec Terraform.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            {next ? (
              <Link
                to="/lab/$day"
                params={{ day: String(next.day) }}
                className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-glow hover:opacity-90"
              >
                {done.length ? "Continuer" : "Commencer"} — Jour {next.day}
              </Link>
            ) : (
              <p className="font-semibold text-primary">✔ Parcours terminé</p>
            )}
            <div className="flex items-center gap-3">
              <div
                role="progressbar"
                aria-label="Labs terminés"
                aria-valuemin={0}
                aria-valuemax={LABS.length}
                aria-valuenow={done.length}
                className="h-2 w-32 overflow-hidden rounded-full bg-muted sm:w-48"
              >
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(done.length / LABS.length) * 100}%` }}
                />
              </div>
              <span className="font-mono text-sm text-muted-foreground">
                {Math.round((done.length / LABS.length) * 100)}%
              </span>
            </div>
          </div>
        </section>
        <form
          role="search"
          className="max-w-2xl"
          onSubmit={(event) => {
            event.preventDefault();
            const first = results[0];
            if (first) void navigate({ to: "/lab/$day", params: { day: String(first.day) } });
          }}
        >
          <label htmlFor="lab-search" className="mb-2 block text-sm font-semibold">
            Rechercher un lab
          </label>
          <div className="flex items-center gap-3 rounded-lg border border-input bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search size={18} aria-hidden="true" className="shrink-0 text-muted-foreground" />
            <input
              id="lab-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
              placeholder="Jour 94, Docker, git merge…"
              className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
            />
            {query && (
              <button
                type="button"
                className="shrink-0 py-2 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setQuery("")}
              >
                Effacer
              </button>
            )}
          </div>
        </form>
        <div aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {searching &&
            (results.length
              ? `${results.length} lab${results.length === 1 ? "" : "s"} trouvé${results.length === 1 ? "" : "s"}`
              : "Aucun lab trouvé. Essaie un numéro de jour ou un mot-clé.")}
        </div>
        {searching ? (
          <section aria-label="Résultats de recherche" className={`mt-4 ${grid}`}>
            {results.map((lab) => (
              <LabCard key={lab.day} lab={lab} done={done.includes(lab.day)} />
            ))}
          </section>
        ) : (
          <>
            <nav aria-label="Modules" className="mt-6 flex flex-wrap gap-2">
              {MODULES.map((mod) => (
                <a
                  key={mod.id}
                  href={`#${mod.id}`}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-primary"
                >
                  {mod.icon} {mod.nom}
                </a>
              ))}
            </nav>
            {MODULES.map((mod) => {
              const labs = LABS.filter((lab) => lab.module === mod.id);
              return (
                <section key={mod.id} id={mod.id} className="mt-10 scroll-mt-5">
                  <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-border pb-2">
                    <h2 className="text-xl font-bold sm:text-2xl">
                      {mod.icon} {mod.nom}
                    </h2>
                    <span className="shrink-0 font-mono text-sm text-muted-foreground">
                      {labs.filter((lab) => done.includes(lab.day)).length}/{labs.length}
                    </span>
                  </div>
                  <div className={grid}>
                    {labs.map((lab) => (
                      <LabCard key={lab.day} lab={lab} done={done.includes(lab.day)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
