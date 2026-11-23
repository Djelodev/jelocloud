import { useEffect, useRef, useState } from "react";
import { Shell, type Ask, type G } from "@/lib/engine";
import { abs } from "@/lib/engine/shell";
import { CMDS } from "@/lib/engine/types";
import { children, isDir, type World } from "@/lib/engine/world";

type EditorRequest = Extract<Ask, { kind: "edit" }> & { submit: (text: string | null) => void };
type Props = { world: World; day: number; onChange: () => void };

function tokenColor(token: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!ctx || !value) return undefined;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
  return "#" + rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("");
}

function completion(shell: Shell, prefix: string) {
  if (!prefix.includes("/") && !prefix.startsWith("~")) {
    return [
      ...new Set([
        ...Object.keys(CMDS).filter((name) => !name.startsWith("__")),
        ...children(shell.f.host, shell.f.cwd),
      ]),
    ]
      .filter((name) => name.startsWith(prefix))
      .sort();
  }
  const at = prefix.lastIndexOf("/") + 1;
  const path = prefix.slice(0, at);
  const name = prefix.slice(at);
  const folder = abs(shell.f, path || ".");
  return children(shell.f.host, folder)
    .filter((item) => item.startsWith(name))
    .map((item) => path + item + (isDir(shell.f.host, folder + "/" + item) ? "/" : ""));
}

function FileEditor({ request }: { request: EditorRequest }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(request.content);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="m-auto w-[min(95vw,52rem)] rounded-lg border border-border bg-card p-4 text-foreground backdrop:bg-background/75"
      onCancel={(event) => {
        event.preventDefault();
        request.submit(null);
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          request.submit(text);
        }
      }}
      aria-labelledby="lab-editor-title"
    >
      <h2 id="lab-editor-title" className="mb-3 break-all font-mono text-sm text-primary">
        {request.path}
      </h2>
      <textarea
        autoFocus
        aria-label="Contenu du fichier"
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        className="min-h-64 w-full resize-y rounded border border-border bg-terminal p-3 font-mono text-sm text-terminal-foreground"
        onKeyDown={(event) => {
          if (event.key !== "Tab" || event.shiftKey) return;
          event.preventDefault();
          const { selectionStart, selectionEnd } = event.currentTarget;
          setText(text.slice(0, selectionStart) + "  " + text.slice(selectionEnd));
          const textarea = event.currentTarget;
          requestAnimationFrame(() =>
            textarea.setSelectionRange(selectionStart + 2, selectionStart + 2),
          );
        }}
      />
      <div className="mt-3 flex justify-end gap-2 text-sm">
        <button
          type="button"
          onClick={() => request.submit(null)}
          className="rounded border border-border px-3 py-2"
        >
          Annuler · Échap
        </button>
        <button
          type="button"
          onClick={() => request.submit(text)}
          className="rounded bg-primary px-3 py-2 font-semibold text-primary-foreground"
        >
          Enregistrer · Ctrl+S
        </button>
      </div>
    </dialog>
  );
}

export function LabTerminal({ world, day, onChange }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tryNumber, setTryNumber] = useState(0);
  const focusInput = useRef<(() => void) | undefined>(undefined);
  const interrupt = useRef<(() => void) | undefined>(undefined);
  const [awaitingInput, setAwaitingInput] = useState(false);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = mount.current;
    if (!container) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
      import("@xterm/xterm/css/xterm.css"),
    ])
      .then(([{ Terminal }, { FitAddon }]) => {
        if (disposed) return;
        const tokens = [
          ["background", "--terminal"],
          ["foreground", "--terminal-foreground"],
          ["cursor", "--primary"],
          ["selectionBackground", "--muted"],
          ["black", "--background"],
          ["red", "--destructive"],
          ["green", "--primary"],
          ["yellow", "--accent"],
          ["blue", "--muted-foreground"],
          ["white", "--foreground"],
        ] as const;
        const theme = Object.fromEntries(
          tokens.flatMap(([key, token]) => {
            const color = tokenColor(token);
            return color ? [[key, color]] : [];
          }),
        );
        const terminal = new Terminal({
          convertEol: true,
          cursorBlink: true,
          screenReaderMode: true,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 13,
          scrollback: 3000,
          theme,
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(container);
        terminal.textarea?.setAttribute("aria-label", "Terminal du lab");
        fit.fit();

        const shell = new Shell(world);
        let pending: G | undefined;
        let kind: Ask["kind"] | undefined;
        let prompt = shell.prompt();
        let line = "";
        let cursor = 0;
        let drawnRow = 0;
        let historyAt = shell.history.length;
        let draft = "";
        let pastedLines: string[] = [];

        const columns = () => Math.max(1, terminal.cols);
        const redraw = () => {
          const visible = kind === "password" ? "" : line;
          const end = prompt.length + visible.length;
          const position = prompt.length + (kind === "password" ? 0 : cursor);
          const row = Math.floor(position / columns());
          const endRow = Math.floor(end / columns());
          terminal.write(
            "\r" +
              (drawnRow ? `\x1b[${drawnRow}A` : "") +
              "\x1b[J" +
              prompt +
              visible +
              " \r" +
              (endRow > row ? `\x1b[${endRow - row}A` : "") +
              (position % columns() ? `\x1b[${position % columns()}C` : ""),
          );
          drawnRow = row;
        };
        const newPrompt = (value: string, initialInput = "") => {
          const lines = value.split("\n");
          for (const text of lines.slice(0, -1)) terminal.writeln(text);
          prompt = lines.at(-1) ?? "";
          line = initialInput;
          cursor = line.length;
          drawnRow = 0;
          redraw();
        };
        const advance = (value: string | null) => {
          try {
            const result = pending?.next(value);
            if (!result || result.done) {
              pending = undefined;
              kind = undefined;
              setAwaitingInput(false);
              if (result?.value.out === "\x1bc") terminal.reset();
              else if (result?.value.out) terminal.writeln(result.value.out);
              historyAt = shell.history.length;
              draft = "";
              onChangeRef.current();
              newPrompt(shell.prompt(), pastedLines.shift());
              return;
            }
            kind = result.value.kind;
            setAwaitingInput(kind !== "edit");
            if (result.value.kind === "edit") {
              setEditor({
                ...result.value,
                submit: (text) => {
                  setEditor(null);
                  advance(text);
                  requestAnimationFrame(() => {
                    if (!disposed) terminal.focus();
                  });
                },
              });
            } else newPrompt(result.value.prompt);
          } catch (error) {
            pending = undefined;
            kind = undefined;
            pastedLines = [];
            setAwaitingInput(false);
            terminal.writeln(
              error instanceof Error
                ? "Erreur du simulateur · " + error.message
                : "Erreur du simulateur",
            );
            onChangeRef.current();
            newPrompt(shell.prompt());
          }
        };

        const resize = new ResizeObserver(() => {
          if (!container.clientWidth || !container.clientHeight) return;
          const before = terminal.cols;
          fit.fit();
          if (before !== terminal.cols && kind !== "edit") {
            terminal.writeln("");
            drawnRow = 0;
            redraw();
          }
        });
        resize.observe(container);
        terminal.writeln(`Jour ${day} · Tape help pour découvrir les commandes.`);
        redraw();
        function cancel() {
          pastedLines = [];
          pending?.return({ out: "", code: 130 });
          pending = undefined;
          kind = undefined;
          setAwaitingInput(false);
          cursor = line.length;
          redraw();
          terminal.writeln("^C");
          historyAt = shell.history.length;
          newPrompt(shell.prompt());
        }
        interrupt.current = cancel;
        terminal.attachCustomKeyEventHandler((event) => {
          if (event.type !== "keydown" || kind === "edit") return true;
          const ctrlC =
            event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "c";
          if (
            (ctrlC && (pending || !terminal.hasSelection())) ||
            (event.key === "Escape" && pending)
          ) {
            event.preventDefault();
            cancel();
            return false;
          }
          return true;
        });
        const keys = terminal.onData((data) => {
          if (kind === "edit") return;
          if (data === "\x03" && (pending || !terminal.hasSelection())) {
            cancel();
          } else if (data === "\x0c") {
            terminal.reset();
            drawnRow = 0;
            redraw();
          } else if (data === "\r" || data === "\n") {
            cursor = line.length;
            redraw();
            terminal.writeln("");
            if (!pending) pending = shell.line(line);
            advance(line);
          } else if ((data === "\x1b[A" || data === "\x1b[B") && !pending) {
            if (historyAt === shell.history.length) draft = line;
            historyAt = Math.max(
              0,
              Math.min(shell.history.length, historyAt + (data.endsWith("A") ? -1 : 1)),
            );
            line = shell.history[historyAt] ?? draft;
            cursor = line.length;
            redraw();
          } else if (data === "\x1b[D" || data === "\x1b[C") {
            cursor = Math.max(0, Math.min(line.length, cursor + (data.endsWith("D") ? -1 : 1)));
            redraw();
          } else if (data === "\x01" || data === "\x1b[H" || data === "\x05" || data === "\x1b[F") {
            cursor = data === "\x01" || data.endsWith("H") ? 0 : line.length;
            redraw();
          } else if (data === "\x7f" || data === "\x08" || data === "\x1b[3~") {
            const at = data === "\x1b[3~" ? cursor : cursor - 1;
            if (at >= 0) {
              line = line.slice(0, at) + line.slice(at + 1);
              cursor = at;
              redraw();
            }
          } else if (data === "\t" && !pending) {
            const start = line.slice(0, cursor).search(/\S*$/);
            const prefix = line.slice(start, cursor);
            const matches = prefix ? completion(shell, prefix) : [];
            const first = matches[0];
            if (first) {
              const mismatch = Array.from(first).findIndex((_, i) =>
                matches.some((match) => match[i] !== first[i]),
              );
              const common = mismatch < 0 ? first : first.slice(0, mismatch);
              const next = matches.length === 1 ? first + (first.endsWith("/") ? "" : " ") : common;
              if (next.length > prefix.length) {
                line = line.slice(0, start) + next + line.slice(cursor);
                cursor = start + next.length;
                redraw();
              } else {
                terminal.writeln("");
                terminal.writeln(matches.join("  "));
                drawnRow = 0;
                redraw();
              }
            }
          } else {
            const pieces = data.split(/\r\n|\r|\n/);
            if (pieces.length > 1 && pending) return;
            const inserted = (pieces.shift() ?? "").replace(/[\x00-\x1f\x7f]/g, "");
            if (pieces.length)
              pastedLines = pieces
                .map((part) => part.replace(/[\x00-\x1f\x7f]/g, ""))
                .filter((part) => part.trim());
            if (!inserted && !pieces.length) return;
            line = line.slice(0, cursor) + inserted + line.slice(cursor);
            cursor += inserted.length;
            redraw();
          }
        });
        focusInput.current = () => terminal.textarea?.focus({ preventScroll: true });
        setStatus("ready");
        cleanup = () => {
          focusInput.current = undefined;
          interrupt.current = undefined;
          resize.disconnect();
          keys.dispose();
          terminal.dispose();
        };
      })
      .catch(() => {
        if (!disposed) setStatus("error");
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [world, day, tryNumber]);

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 pt-2 text-xs text-muted-foreground">
        <span className="hidden sm:inline">↑ ↓ Historique · Tab Compléter · Ctrl+C Annuler</span>
        {awaitingInput && (
          <button
            type="button"
            onClick={() => {
              interrupt.current?.();
              focusInput.current?.();
            }}
            className="rounded-md border border-border px-3 py-2 text-accent hover:border-accent"
          >
            Annuler la commande
          </button>
        )}
        <button
          type="button"
          disabled={status !== "ready"}
          onClick={() => focusInput.current?.()}
          className="rounded-md border border-border px-3 py-2 text-foreground hover:border-primary disabled:opacity-50"
        >
          Saisir une commande
        </button>
      </div>
      {status === "loading" && (
        <p role="status" className="p-3 text-sm text-muted-foreground">
          Chargement du terminal…
        </p>
      )}
      <div ref={mount} className="min-h-0 min-w-0 flex-1 overflow-hidden p-2" />
      {status === "error" && (
        <div className="p-3">
          <p role="alert" className="text-destructive">
            Le terminal n’a pas pu se charger.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setTryNumber((value) => value + 1);
            }}
            className="mt-2 rounded border border-border px-3 py-2"
          >
            Réessayer
          </button>
        </div>
      )}
      {editor && <FileEditor request={editor} />}
    </>
  );
}
