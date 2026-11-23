import type { Container, Host, World } from "./world";
export type Ask = { kind: "confirm"; prompt: string } | { kind: "password"; prompt: string } | { kind: "edit"; path: string; content: string };
export type R = { out: string; code: number };
export type G = Generator<Ask, R, string | null>;
export type Frame = { host: Host; user: string; cwd: string; repl?: "mysql" | "psql"; sudoOk?: boolean; container?: Container; env: Record<string, string>; batch?: boolean; via?: string };
export type Ctx = { w: World; sh: import("./shell").Shell; f: Frame; h: Host; user: string; stdin: string; root: boolean };
export type Cmd = (c: Ctx, a: string[]) => G;
export const CMDS: Record<string, Cmd> = Object.create(null);
export const ok = (out = ""): R => ({ out, code: 0 });
export const err = (out: string, code = 1): R => ({ out, code });
// eslint-disable-next-line require-yield
export function* done(r: R): G { return r; }
export function flags(a: string[]) {
  const f = new Set<string>(); const pos: string[] = [];
  for (const x of a) { if (x.startsWith("--")) f.add(x); else if (x.startsWith("-") && x.length > 1) for (const ch of x.slice(1)) f.add("-" + ch); else pos.push(x); }
  return { f, pos };
}
export function opt(a: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    for (const n of names) { if (x === n) return a[i + 1]; if (n.startsWith("--") && x.startsWith(n + "=")) return x.slice(n.length + 1); }
  }
  return undefined;
}
