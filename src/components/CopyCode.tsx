import { useRef, useState } from "react";

export function CopyCode({ text, label }: { text: string; label: string }) {
  const code = useRef<HTMLElement>(null);
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copié");
    } catch {
      if (code.current) {
        const range = document.createRange();
        range.selectNodeContents(code.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setStatus("Texte sélectionné. Copie-le avec ton clavier.");
    }
  }
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-9 rounded-md border border-border px-2 text-xs font-semibold hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          {label}
        </button>
        <span role="status" className="text-xs text-muted-foreground">
          {status}
        </span>
      </div>
      <pre
        className="mt-2 max-h-72 overflow-auto rounded-md border border-border bg-terminal p-3 text-xs text-terminal-foreground"
        tabIndex={0}
        aria-label={label === "Copier la commande" ? "Commande" : "Contenu du fichier"}
      >
        <code ref={code}>{text}</code>
      </pre>
    </div>
  );
}
