import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getLab, LABS, MODULES } from "@/lib/labs";
import { newSim, prompt, run, stepMatches } from "@/lib/simulator";
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

type Line = { kind: "in" | "out" | "ok" | "info"; text: string };

function LabPage() {
  const { day } = Route.useLoaderData();
  const lab = getLab(day)!;
  const mod = MODULES.find((m) => m.id === lab.module)!;
  const { done, complete, reset } = useProgress();
  const [sim] = useState(newSim);
  const [lines, setLines] = useState<Line[]>([]);
  const [cur, setCur] = useState(0);
  const [input, setInput] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const [showHint, setShowHint] = useState(false);
  const [, force] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLInputElement>(null);
  const finished = cur >= lab.steps.length;

  useEffect(() => {
    Object.assign(sim, newSim());
    setCur(0); setShowHint(false);
    setLines([{ kind: "info", text: `Bienvenue dans le lab Jour ${lab.day}. Tape "help" pour la liste des commandes, "indice" si tu bloques.` }]);
  }, [lab.day, sim]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lines]);
  useEffect(() => { if (finished) complete(lab.day); }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    const c = input;
    const p = prompt(sim);
    setInput(""); setHi(-1);
    if (c.trim()) setHist((h) => [...h, c]);
    if (c.trim() === "indice") {
      const s = lab.steps[cur];
      setLines((l) => [...l, { kind: "in", text: `${p} ${c}` }, { kind: "info", text: s ? `💡 ${s.explication}\n   Exemple : ${s.cmd}` : "Lab terminé 🎉" }]);
      return;
    }
    const r = run(sim, c);
    if (r.clear) { setLines([]); force((x) => x + 1); return; }
    const add: Line[] = [{ kind: "in", text: `${p} ${c}` }];
    if (r.out) add.push({ kind: "out", text: r.out });
    const step = lab.steps[cur];
    if (step && stepMatches(step, c)) {
      add.push({ kind: "ok", text: `✔ Étape ${cur + 1} validée : ${step.titre}` });
      setCur(cur + 1); setShowHint(false);
    }
    setLines((l) => [...l, ...add]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
    else if (e.key === "ArrowUp" && hist.length) { e.preventDefault(); const i = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1); setHi(i); setInput(hist[i] ?? ""); }
    else if (e.key === "ArrowDown" && hi >= 0) { e.preventDefault(); const i = hi + 1; if (i >= hist.length) { setHi(-1); setInput(""); } else { setHi(i); setInput(hist[i] ?? ""); } }
    else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); setLines([]); }
  };

  const restart = () => { Object.assign(sim, newSim()); setCur(0); setLines([{ kind: "info", text: "Lab réinitialisé." }]); reset(lab.day); };
  const prev = LABS[lab.day - 2]; const next = LABS[lab.day];

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-4"><Brand /><span className="hidden font-mono text-xs text-muted-foreground md:inline">{mod.icon} {mod.nom}</span></div>
        <div className="flex items-center gap-2 font-mono text-sm">
          {prev && <Link to="/lab/$day" params={{ day: String(prev.day) }} className="rounded border border-border px-3 py-1 hover:border-primary">← J{prev.day}</Link>}
          {next && <Link to="/lab/$day" params={{ day: String(next.day) }} className="rounded border border-border px-3 py-1 hover:border-primary">J{next.day} →</Link>}
        </div>
      </header>
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(320px,420px)_1fr]">
        <aside className="overflow-y-auto border-r border-border p-6">
          <p className="font-mono text-xs text-primary">JOUR {lab.day} / 100 {done.includes(lab.day) && "· ✔ terminé"}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{lab.title}</h1>
          <div className="mt-4 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm"><span className="font-semibold text-accent">🎯 Mission : </span>{lab.objectif}</div>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Le concept</h2>
          <p className="mt-2 text-sm leading-relaxed">{lab.concept}</p>
          {lab.astuce && <p className="mt-3 rounded bg-muted p-3 text-sm text-muted-foreground">📌 {lab.astuce}</p>}
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Étapes</h2>
          <ol className="mt-3 space-y-3">
            {lab.steps.map((s, i) => {
              const state = i < cur ? "done" : i === cur ? "now" : "todo";
              return (
                <li key={i} className={`rounded-md border p-3 text-sm ${state === "now" ? "border-primary bg-primary/5" : "border-border"} ${state === "todo" ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2 font-semibold"><span className={`font-mono ${state === "done" ? "text-primary" : "text-muted-foreground"}`}>{state === "done" ? "✔" : i + 1}</span>{s.titre}</div>
                  {state !== "todo" && <p className="mt-1 text-muted-foreground">{s.explication}</p>}
                  {state === "done" && <code className="mt-2 block rounded bg-terminal px-2 py-1 font-mono text-xs text-terminal-foreground">{s.cmd}</code>}
                  {state === "now" && (showHint
                    ? <code className="mt-2 block rounded bg-terminal px-2 py-1 font-mono text-xs text-terminal-foreground">{s.cmd}</code>
                    : <button onClick={() => setShowHint(true)} className="mt-2 font-mono text-xs text-accent hover:underline">Afficher la solution</button>)}
                </li>
              );
            })}
          </ol>
          {finished && (
            <div className="mt-6 rounded-md border border-primary bg-primary/10 p-4 text-sm">
              <p className="font-semibold text-primary">🎉 Lab réussi !</p>
              {next && <Link to="/lab/$day" params={{ day: String(next.day) }} className="mt-3 inline-block rounded bg-primary px-4 py-2 font-semibold text-primary-foreground">Jour suivant →</Link>}
            </div>
          )}
          <button onClick={restart} className="mt-6 font-mono text-xs text-muted-foreground hover:text-destructive">↺ Réinitialiser le lab</button>
        </aside>
        <section className="flex min-h-0 flex-col bg-terminal p-2" onClick={() => inRef.current?.focus()}>
          <div className="flex items-center gap-2 border-b border-border px-3 pb-2 font-mono text-xs text-muted-foreground">
            <span className="h-3 w-3 rounded-full bg-destructive" /><span className="h-3 w-3 rounded-full bg-accent" /><span className="h-3 w-3 rounded-full bg-primary" />
            <span className="ml-2">Terminal — {sim.user}@{sim.host}</span>
            <span className="ml-auto">Étape {Math.min(cur + 1, lab.steps.length)}/{lab.steps.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto whitespace-pre-wrap p-3 font-mono text-sm text-terminal-foreground">
            {lines.map((l, i) => (
              <div key={i} className={l.kind === "ok" ? "font-semibold text-primary" : l.kind === "info" ? "text-accent" : l.kind === "out" ? "text-foreground/80" : ""}>{l.text}</div>
            ))}
            <div className="flex"><span className="shrink-0">{prompt(sim)}&nbsp;</span>
              <input ref={inRef} autoFocus value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} spellCheck={false} autoComplete="off" aria-label="Terminal" className="flex-1 bg-transparent caret-primary outline-none" />
            </div>
            <div ref={endRef} />
          </div>
        </section>
      </div>
    </div>
  );
}
