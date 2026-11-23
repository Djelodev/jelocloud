import { CREDS, Shell, type R } from "../lib/engine";
import type { Lab } from "../lib/labs";
import { worldFor } from "../lib/labs/scenario";

export function runLine(shell: Shell, cmd: string, editor?: string, password?: string): R {
  const process = shell.line(cmd);
  let result = process.next();
  for (let i = 0; !result.done && i < 20; i++) {
    const ask = result.value;
    if (ask.kind === "edit") {
      if (editor === undefined) throw new Error("Contenu d’éditeur manquant pour " + cmd);
      result = process.next(editor);
      continue;
    }
    if (ask.kind === "confirm") { result = process.next("yes"); continue; }
    const remote = /(\w+)@([\w.-]+)'s password/.exec(ask.prompt);
    const host = shell.w.hosts[remote?.[2] ?? shell.f.host.name];
    const account = remote?.[1] ?? /password for (\w+)/.exec(ask.prompt)?.[1] ?? shell.f.user;
    const pass = password ?? host?.users[account]?.password ?? CREDS[shell.f.host.name]?.pass ?? "";
    result = process.next(pass);
  }
  if (!result.done) throw new Error("Trop d’invites pour " + cmd);
  return result.value;
}

export function runSolution(lab: Lab) {
  const world = worldFor(lab);
  const shell = new Shell(world);
  const results = lab.steps.map((step) => ({ step, ...runLine(shell, step.cmd, step.edit?.content) }));
  return { world, results };
}
