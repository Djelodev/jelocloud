import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LABS, MODULES } from "@/lib/labs";
import { useProgress } from "@/lib/progress";
import { Brand } from "@/components/Brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Jelo Cloud — 100 jours de DevOps" },
      { name: "description", content: "Ton parcours DevOps de débutant à expert : 100 labs pratiques avec terminal intégré." },
      { property: "og:title", content: "Jelo Cloud — 100 jours de DevOps" },
      { property: "og:description", content: "100 labs pratiques Linux, Git, Docker, Kubernetes, Jenkins, Ansible et Terraform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { done } = useProgress();
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return LABS.filter((l) => [l.title, l.objectif, l.concept, ...l.steps.map((s) => s.cmd)].join(" ").toLowerCase().includes(t)).slice(0, 8);
  }, [q]);
  const next = LABS.find((l) => !done.includes(l.day)) ?? LABS[0]!;
  const pct = Math.round((done.length / LABS.length) * 100);

  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Brand />
        <span className="font-mono text-sm text-muted-foreground">{done.length}/100 labs</span>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="py-12">
          <p className="font-mono text-sm text-primary">$ ./start --parcours devops</p>
          <h1 className="mt-3 text-5xl font-bold tracking-tight md:text-6xl">100 jours de DevOps</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">Apprends en faisant. Chaque jour, un lab réel avec un terminal dans ton navigateur : du premier utilisateur Linux jusqu'à l'infrastructure AWS avec Terraform.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link to="/lab/$day" params={{ day: String(next.day) }} className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-glow transition hover:opacity-90">
              {done.length ? "Continuer" : "Commencer"} — Jour {next.day}
            </Link>
            <div className="flex items-center gap-3">
              <div className="h-2 w-48 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
              <span className="font-mono text-sm text-muted-foreground">{pct}%</span>
            </div>
          </div>
          <div className="relative mt-10 max-w-2xl">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un lab, une commande (ex : docker run, cron, rollout)…" className="w-full rounded-md border border-input bg-card px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring" />
            {results.length > 0 && (
              <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-md border border-border bg-popover">
                {results.map((l) => (
                  <li key={l.day}><Link to="/lab/$day" params={{ day: String(l.day) }} className="block px-4 py-2 text-sm hover:bg-muted"><span className="font-mono text-primary">J{l.day}</span> {l.title}</Link></li>
                ))}
              </ul>
            )}
          </div>
        </section>
        {MODULES.map((m) => {
          const labs = LABS.filter((l) => l.module === m.id);
          const d = labs.filter((l) => done.includes(l.day)).length;
          return (
            <section key={m.id} className="mt-12">
              <div className="mb-4 flex items-baseline justify-between border-b border-border pb-2">
                <h2 className="text-2xl font-bold">{m.icon} {m.nom}</h2>
                <span className="font-mono text-sm text-muted-foreground">{d}/{labs.length}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {labs.map((l) => {
                  const ok = done.includes(l.day);
                  return (
                    <Link key={l.day} to="/lab/$day" params={{ day: String(l.day) }} className={`group rounded-lg border bg-card p-4 transition hover:border-primary ${ok ? "border-primary/60" : "border-border"}`}>
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className="text-primary">JOUR {String(l.day).padStart(3, "0")}</span>
                        <span className={ok ? "text-primary" : "text-muted-foreground"}>{ok ? "✔ Terminé" : `${l.steps.length} étapes`}</span>
                      </div>
                      <h3 className="mt-2 font-semibold leading-snug group-hover:text-primary">{l.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.objectif}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
