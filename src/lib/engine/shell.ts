// Interpréteur de shell : parsing (quotes, pipes, &&, ||, ;, redirections), sessions SSH/sudo, permissions.
import { type Ask, CMDS, type Ctx, type Frame, type G, type R, err, ok } from "./types";
import { type FNode, type Host, type World, base, children, isDir, mkdirp, norm, parent, readFile, writeFile } from "./world";

type Tok = { v: string; op?: boolean; q?: boolean };
const sequenceOperators = new Set(["&&", "||", ";", "&"]);
const redirectOperators = new Set([">", ">>", "<"]);

function syntaxError(tokens: Tok[]) {
  const unexpected = (token: string) => `bash: syntax error near unexpected token \`${token}'`;
  let needsCommand = true;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!token.op) { needsCommand = false; continue; }
    if (redirectOperators.has(token.v)) {
      const target = tokens[++i];
      if (!target || target.op || !target.v) return unexpected(target?.v ?? "newline");
      needsCommand = false;
    } else if (token.v === "|" || sequenceOperators.has(token.v)) {
      if (needsCommand) return unexpected(token.v);
      needsCommand = true;
    }
  }
  const last = tokens.at(-1);
  if (last?.op && ["|", "&&", "||"].includes(last.v)) return unexpected("newline");
  return undefined;
}
export function tokenize(s: string, env: Record<string, string>): Tok[] | string {
  const out: Tok[] = []; let cur = ""; let has = false; let quoted = false; let i = 0;
  const push = () => { if (has) out.push({ v: cur, q: quoted }); cur = ""; has = false; quoted = false; };
  const expand = (str: string) => str.replace(/\$\(date \+?%?([^)]*)\)/g, () => new Date().toISOString().slice(0, 10)).replace(/\$\{?(\w+)\}?/g, (_, n) => env[n] ?? "");
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === "'") { const j = s.indexOf("'", i + 1); if (j < 0) return "bash: unexpected EOF while looking for matching `''"; cur += s.slice(i + 1, j); has = true; quoted = true; i = j + 1; continue; }
    if (ch === '"') { let j = i + 1; let b = ""; while (j < s.length && s[j] !== '"') { if (s[j] === "\\" && j + 1 < s.length) { b += s[j + 1]; j += 2; } else b += s[j++]; } if (j >= s.length) return "bash: unexpected EOF while looking for matching `\"'"; cur += expand(b); has = true; quoted = true; i = j + 1; continue; }
    if (ch === "\\" && i + 1 < s.length) { cur += s[i + 1]; has = true; i += 2; continue; }
    if (ch === "#" && !has) break;
    if (/\s/.test(ch)) { push(); i++; continue; }
    const two = s.slice(i, i + 2);
    if (["&&", "||", ">>", "2>"].includes(two)) { push(); if (two === "2>") { const m = /^2>(&1|\s*\S+)/.exec(s.slice(i)); i += m ? m[0].length : 2; continue; } out.push({ v: two, op: true }); i += 2; continue; }
    if ("|;><&".includes(ch)) { push(); out.push({ v: ch, op: true }); i++; continue; }
    if (ch === "$" ) { const m = /^\$\(date[^)]*\)|^\$\{?\w+\}?/.exec(s.slice(i)); if (m) { cur += expand(m[0]); has = true; i += m[0].length; continue; } }
    if (ch === "~" && !has && (s[i + 1] === undefined || s[i + 1] === "/" || /\s/.test(s[i + 1]!))) { cur += env["HOME"] ?? "~"; has = true; i++; continue; }
    cur += ch; has = true; i++;
  }
  push();
  return out;
}

export class Shell {
  w: World; stack: Frame[]; history: string[] = [];
  constructor(w: World, host = "jump_host", user = "thor") {
    const h = w.hosts[host]!;
    this.w = w; this.stack = [{ host: h, user, cwd: h.users[user]!.home, env: {} }];
  }
  get f() { return this.stack[this.stack.length - 1]!; }
  envFor(f: Frame) { const u = f.host.users[f.user]; return { HOME: u?.home ?? "/", USER: f.user, HOSTNAME: f.host.name, PWD: f.cwd, ...f.env }; }
  prompt(): string {
    const f = this.f;
    if (f.repl === "mysql") return "MariaDB [(none)]> ";
    if (f.repl === "psql") return "postgres=# ";
    const home = f.host.users[f.user]?.home;
    const d = f.cwd === home ? "~" : f.cwd === "/" ? "/" : base(f.cwd);
    if (f.container) return `root@${f.container.id.slice(0, 12)}:${f.cwd === "/root" ? "~" : f.cwd}# `;
    return `[${f.user}@${f.host.name} ${d}]${f.user === "root" ? "#" : "$"} `;
  }
  *line(input: string): G {
    const f = this.f;
    if (input.trim()) this.history.push(input);
    if (f.repl) { const r = yield* CMDS[`__${f.repl}`]!(this.ctx(f, ""), [input]); return r; }
    return yield* this.run(input, f);
  }
  ctx(f: Frame, stdin: string, userOverride?: string): Ctx {
    const user = userOverride ?? f.user;
    return { w: this.w, sh: this, f, h: f.host, user, stdin, root: user === "root" };
  }
  *run(input: string, f: Frame, asUser?: string): G {
    const interactive = this.f === f;
    const t = tokenize(input, this.envFor(f));
    if (typeof t === "string") return err(t, 2);
    const invalid = syntaxError(t);
    if (invalid) return err(invalid, 2);
    // séquence : liste [pipeline, opérateur précédent]
    const seq: { toks: Tok[]; op: string }[] = []; let cur: Tok[] = []; let op = ";";
    for (const x of t) { if (x.op && sequenceOperators.has(x.v)) { seq.push({ toks: cur, op }); cur = []; op = x.v === "&" ? ";" : x.v; } else cur.push(x); }
    seq.push({ toks: cur, op });
    let out: string[] = []; let code = 0;
    for (const s of seq) {
      if (!s.toks.length) continue;
      if (s.op === "&&" && code !== 0) continue;
      if (s.op === "||" && code === 0) continue;
      const r = yield* this.pipeline(s.toks, interactive ? this.f : f, asUser);
      if (r.out) out.push(r.out);
      code = r.code;
    }
    return { out: out.join("\n"), code };
  }
  *pipeline(toks: Tok[], f: Frame, asUser?: string): G {
    const parts: Tok[][] = [[]];
    for (const x of toks) { if (x.op && x.v === "|") parts.push([]); else parts[parts.length - 1]!.push(x); }
    let stdin = ""; let last: R = ok();
    for (const p of parts) {
      const args: string[] = []; let redir: { mode: ">" | ">>"; path: string } | undefined; let inFile: string | undefined;
      for (let i = 0; i < p.length; i++) {
        const x = p[i]!;
        if (x.op && redirectOperators.has(x.v)) {
          const path = p[++i];
          if (!path || path.op || !path.v) return err("bash: syntax error near unexpected token `newline'", 2);
          if (x.v === "<") inFile = path.v;
          else redir = { mode: x.v === ">>" ? ">>" : ">", path: path.v };
          continue;
        }
        if (!x.q && x.v.includes("*")) { args.push(...glob(f.host, f.cwd, x.v)); continue; }
        args.push(x.v);
      }
      const ctx = this.ctx(f, "", asUser);
      if (inFile !== undefined) {
        const path = abs(f, inFile);
        if (!canRead(ctx, path)) return err(`bash: ${inFile}: Permission denied`);
        const content = vread(ctx, path);
        if (content === undefined) return err(`bash: ${inFile}: No such file or directory`);
        stdin = content;
      }
      const outputPath = redir ? abs(f, redir.path) : undefined;
      if (outputPath && outputPath !== "/dev/null") {
        if (!isDir(f.host, parent(outputPath))) return err(`bash: ${redir!.path}: No such file or directory`);
        if (isDir(f.host, outputPath)) return err(`bash: ${redir!.path}: Is a directory`);
        if (!canWrite(ctx, outputPath)) return err(`bash: ${redir!.path}: Permission denied`);
        if (redir?.mode === ">" || !f.host.fs[outputPath]) writeFile(f.host, outputPath, "", ctx.user);
      }
      last = yield* this.exec(args, f, stdin, asUser);
      if (outputPath) {
        if (outputPath !== "/dev/null" && last.code === 0 && last.out) {
          writeFile(f.host, outputPath, (readFile(f.host, outputPath) ?? "") + last.out + "\n", ctx.user);
        }
        if (last.code === 0) last = { out: "", code: last.code };
      }
      stdin = last.out;
    }
    return last;
  }
  *exec(args: string[], f: Frame, stdin: string, asUser?: string): G {
    const [name, ...rest] = args;
    if (!name) return ok();
    if (/^\w+=/.test(name) && !rest.length) { const [k, ...v] = name.split("="); f.env[k!] = v.join("="); return ok(); }
    const ctx = this.ctx(f, stdin, asUser);
    if (name.includes("/")) return yield* runScript(ctx, abs(f, name), rest, true);
    const cmd = CMDS[name];
    if (!cmd || !available(ctx, name)) return err(`bash: ${name}: command not found`, 127);
    return yield* cmd(ctx, rest);
  }
}

export const abs = (f: { cwd: string; host: Host; user: string }, p: string) => {
  if (p === "~" || p.startsWith("~/")) p = (f.host.users[f.user]?.home ?? "/") + p.slice(1);
  return norm(p.startsWith("/") ? p : f.cwd + "/" + p);
};
function glob(h: Host, cwd: string, pat: string): string[] {
  const full = pat.startsWith("/") ? pat : cwd + "/" + pat;
  const dir = parent(full); const re = new RegExp("^" + base(full).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  const m = children(h, dir).filter((c) => re.test(c)).map((c) => (pat.startsWith("/") ? norm(dir + "/" + c) : norm(dir + "/" + c).replace(norm(cwd) + "/", "")));
  return m.length ? m : [pat];
}

// ---------- Permissions ----------
function nearest(h: Host, p: string) { let c = norm(p); while (!h.fs[c] && c !== "/") c = parent(c); return h.fs[c]; }
function permissions(c: Ctx, node: FNode) {
  if (node.owner === c.user) return node.mode >> 6 & 7;
  const bits = (value: string) => (value.includes("r") ? 4 : 0) | (value.includes("w") ? 2 : 0) | (value.includes("x") ? 1 : 0);
  const named = node.acl?.[`user:${c.user}`];
  if (named !== undefined) return bits(named);
  const member = (group: string) => {
    const assigned = c.h.groups[group];
    return !!assigned && (c.h.users[c.user]?.gid === assigned.gid || assigned.members.includes(c.user));
  };
  const groupValues = Object.entries(node.acl ?? {}).filter(([key]) => key.startsWith("group:") && member(key.slice(6)));
  if (member(node.group) || groupValues.length) {
    return groupValues.reduce((p, [, acl]) => p | bits(acl), member(node.group) ? node.mode >> 3 & 7 : 0);
  }
  return node.mode & 7;
}

export function canWrite(c: Ctx, p: string): boolean {
  if (c.root) return true;
  const n = c.h.fs[norm(p)] ?? nearest(c.h, parent(p));
  return !!n && (permissions(c, n) & 2) !== 0;
}
export function canRead(c: Ctx, p: string): boolean {
  if (c.root) return true;
  if (p === "/etc/shadow") return false;
  const n = c.h.fs[norm(p)];
  return !n || (permissions(c, n) & 4) !== 0;
}
export function canExec(c: Ctx, p: string): boolean {
  const n = c.h.fs[norm(p)];
  if (!n) return false;
  if (c.root) return (n.mode & 0o111) !== 0;
  return (permissions(c, n) & 5) === 5;
}
// lecture des fichiers virtuels (/etc/passwd, /etc/group...)
export function vread(c: Ctx, p: string): string | undefined {
  const h = c.h;
  if (p === "/etc/passwd") return Object.values(h.users).sort((a, b) => a.uid - b.uid).map((u) => `${u.name}:x:${u.uid}:${u.gid}::${u.home}:${u.shell}`).join("\n") + "\n";
  if (p === "/etc/group") return Object.entries(h.groups).map(([g, v]) => `${g}:x:${v.gid}:${v.members.join(",")}`).join("\n") + "\n";
  if (p === "/etc/shadow") return Object.values(h.users).map((u) => `${u.name}:${u.password === "!" ? "!!" : "$6$rounds$hash"}:20414:0:99999:7::${u.expire ? Math.floor(Date.parse(u.expire) / 86400000) : ""}:`).join("\n") + "\n";
  if (p.startsWith("/var/spool/cron/")) return h.crontabs[base(p)];
  return readFile(h, p);
}

const CMD_PKG: Record<string, string> = { git: "git", docker: "docker-ce", nginx: "nginx", httpd: "httpd", apachectl: "httpd", mysql: "mariadb", psql: "postgresql", "postgresql-setup": "postgresql-server", crontab: "cronie", sestatus: "policycoreutils", getenforce: "policycoreutils", setenforce: "policycoreutils", pip3: "python3-pip", java: "java-17-openjdk", zip: "zip", unzip: "unzip", sshpass: "sshpass", setfacl: "acl", getfacl: "acl", php: "php-fpm" };
const BIN: Record<string, string> = { ansible: "ansible", "ansible-playbook": "ansible", "ansible-inventory": "ansible", terraform: "terraform", kubectl: "kubectl", tea: "tea", "jenkins-cli": "jenkins-cli" };
function available(c: Ctx, name: string): boolean {
  if (c.f.container) { const ubuntuOk = ["apt", "apt-get", "service", "which", "ls", "cat", "echo", "cd", "pwd", "mkdir", "touch", "rm", "cp", "mv", "sed", "grep", "exit", "head", "tail", "chmod", "chown", "whoami", "hostname", "curl", "printf", "wc", "id", "date", "env", "python3", "pip", "bash", "sh", "help", "clear", "ps", "vi", "nano", "vim", "apache2ctl", "nginx"]; if (!ubuntuOk.includes(name)) return false; }
  const pkg = CMD_PKG[name]; if (pkg) return c.h.pkgs.has(pkg);
  const bin = BIN[name]; if (bin) return !!c.h.fs["/usr/local/bin/" + bin] || !!c.h.fs[(c.h.users[c.user]?.home ?? "") + "/.local/bin/" + bin];
  if (c.f.container && (name === "apache2ctl")) return c.h.pkgs.has("apache2");
  return true;
}

export function commandPath(c: Ctx, name: string) {
  if (!CMDS[name] || name.startsWith("__") || !available(c, name)) return undefined;
  const bin = BIN[name];
  if (!bin) return "/usr/bin/" + name;
  if (c.h.fs["/usr/local/bin/" + bin]) return "/usr/local/bin/" + name;
  return (c.h.users[c.user]?.home ?? "") + "/.local/bin/" + name;
}

export function* runScript(c: Ctx, path: string, args: string[], direct: boolean): G {
  const content = readFile(c.h, path);
  if (content === undefined) return err(`bash: ${path}: No such file or directory`, 127);
  if (!canRead(c, path)) return err(`bash: ${path}: Permission denied`, 126);
  if (direct && !canExec(c, path)) return err(`bash: ${path}: Permission denied`, 126);
  const out: string[] = [];
  const f: Frame = { ...c.f, env: { ...c.f.env, ...Object.fromEntries(args.map((a, i) => [String(i + 1), a])) }, batch: true };
  let code = 0;
  let failFast = false;
  for (const raw of content.split("\n")) {
    const l = raw.trim(); if (!l || l.startsWith("#")) continue;
    if (/^set\s+-e$/.test(l)) { failFast = true; continue; }
    const r = yield* c.sh.run(l, f, c.root ? "root" : undefined);
    if (r.out) out.push(r.out); code = r.code;
    if (code && failFast) break;
  }
  return { out: out.join("\n"), code };
}
export type { Ask };
export { mkdirp };
