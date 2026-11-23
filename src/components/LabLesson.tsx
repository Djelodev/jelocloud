import { explainCommand } from "@/lib/labs/lessons/commands";
import type { Lesson } from "@/lib/labs/lessons/types";
import type { Step } from "@/lib/labs/scenario";
import { CopyCode } from "./CopyCode";

export function LabLesson({ lesson }: { lesson: Lesson }) {
  return (
    <>
      <section className="mt-4 rounded-md border border-border bg-card p-3 text-sm leading-relaxed">
        <h2 className="font-semibold text-foreground">Pourquoi cette approche ?</h2>
        <p className="mt-1 text-muted-foreground">{lesson.why}</p>
      </section>
      <details className="mt-3 rounded-md border border-border p-3 text-sm leading-relaxed">
        <summary className="cursor-pointer font-semibold">Alternatives et bonnes pratiques</summary>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="font-semibold text-foreground">Une autre approche</dt>
            <dd className="mt-1 text-muted-foreground">{lesson.alternative}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Bonne pratique</dt>
            <dd className="mt-1 text-muted-foreground">{lesson.practice}</dd>
          </div>
        </dl>
      </details>
    </>
  );
}

export function StepLesson({
  step,
  fileNote,
  index,
}: {
  step: Step;
  fileNote?: string;
  index: number;
}) {
  const { parts } = explainCommand(step.cmd);
  return (
    <li className="rounded-md border border-border p-3 text-sm leading-relaxed">
      <h3 className="font-semibold">
        {index + 1}. {step.titre}
      </h3>
      {step.explication && <p className="mt-1 text-muted-foreground">{step.explication}</p>}
      <details className="mt-2">
        <summary className="cursor-pointer py-1 text-sm font-semibold text-accent">
          Commande et explications
        </summary>
        <CopyCode text={step.cmd} label="Copier la commande" />
        <dl className="mt-3 space-y-2 border-l border-border pl-3">
          {parts.map(({ text, meaning }, partIndex) => (
            <div key={partIndex} className="break-words">
              <dt>
                <code className="font-mono text-xs text-accent">{text}</code>
              </dt>
              <dd className="text-muted-foreground">{meaning}</dd>
            </div>
          ))}
        </dl>
        {step.edit && (
          <div className="mt-4 border-t border-border pt-3">
            {fileNote && <p className="text-muted-foreground">{fileNote}</p>}
            <CopyCode text={step.edit.content} label="Copier le contenu du fichier" />
          </div>
        )}
      </details>
    </li>
  );
}
