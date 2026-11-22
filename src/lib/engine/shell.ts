// Interpréteur de shell : parsing (quotes, pipes, &&, ||, ;, redirections), sessions SSH/sudo, permissions.
import { type Ask, CMDS, type Ctx, type Frame, type G, type R, err, ok } from "./types";
import { type Host, type World, base, children, isDir, mkdirp, norm, parent, readFile, writeFile } from "./world";

type Tok = { v: string; op?: boolean; q?: boolean };
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
    if (ch === "~" && !has && (s[i + 1] === undefined || s[i + 1] === "/" || /\s/.test(s[i + 1]!))) { cur += env.HOME ?? "~"; has = true; i++; continue; }
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
    const t = tokenize(input, this.envFor(f));
    if (typeof t === "string") return err(t, 2);
    // séquence : liste [pipeline, opérateur précédent]
    const seq: { toks: Tok[]; op: string }[] = []; let cur: Tok[] = []; let op = ";";
    for (const x of t) { if (x.op && ["&&", "||", ";", "&"].includes(x.v)) { seq.push({ toks: cur, op }); cur = []; op = x.v === "&" ? ";" : x.v; } else cur.push(x); }
    seq.push({ toks: cur, op });
    let out: string[] = []; let code = 0;
    for (const s of seq) {
      if (!s.toks.length) continue;
      if (s.op === "&&" && code !== 0) continue;
      if (s.op === "||" && code === 0) continue;
      const r = yield* this.pipeline(s.toks, this.f === f ? f : this.f, asUser);
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
        if (x.op && (x.v === ">" || x.v === ">>")) { redir = { mode: x.v, path: p[++i]?.v ?? "" }; continue; }
        if (x.op && x.v === "<") { inFile = p[++i]?.v; continue; }
        if (!x.q && x.v.includes("*")) { args.push(...glob(f.host, f.cwd, x.v)); continue; }
        args.push(x.v);
      }
      if (inFile !== undefined) { const c = readFile(f.host, abs(f, inFile)); if (c === undefined) return err(`bash: ${inFile}: No such file or directory`); stdin = c; }
      last = yield* this.exec(args, f, stdin, asUser);
      if (redir) {
        const path = abs(f, redir.path);
        if (path === "/dev/null") { stdin = ""; last = { out: "", code: last.code }; continue; }
        const ctx = this.ctx(f, "", asUser);
        if (!canWrite(ctx, path)) return err(`bash: ${redir.path}: Permission denied`);
        if (!isDir(f.host, parent(path))) return err(`bash: ${redir.path}: No such file or directory`);
        const prev = redir.mode === ">>" ? readFile(f.host, path) ?? "" : "";
        writeFile(f.host, path, prev + (last.out ? last.out + "\n" : ""), ctx.user);
        last = { out: "", code: last.code };
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
function nearest(h: Host, p: string) { let c = norm(p); while (!h.fs[c] && c !== "/") c = parent(c); return h.fs[c]!; }
export function canWrite(c: Ctx, p: string): boolean {
  if (c.root) return true;
  const n = c.h.fs[norm(p)] ?? nearest(c.h, parent(p));
  if (n.owner === c.user) return (n.mode & 0o200) !== 0;
  const grp = c.h.groups[n.group]?.members.includes(c.user);
  if (grp && n.mode & 0o020) return true;
  return (n.mode & 0o002) !== 0;
}
export function canRead(c: Ctx, p: string): boolean {
  if (c.root) return true;
  if (p === "/etc/shadow") return false;
  const n = c.h.fs[norm(p)]; if (!n) return true;
  if (n.owner === c.user) return (n.mode & 0o400) !== 0;
  if (c.h.groups[n.group]?.members.includes(c.user)) return (n.mode & 0o040) !== 0;
  return (n.mode & 0o004) !== 0;
}
export function canExec(c: Ctx, p: string): boolean {
  const n = c.h.fs[norm(p)]; if (!n) return false;
  if (c.root) return (n.mode & 0o111) !== 0;
  const bits = n.owner === c.user ? 0o500 : c.h.groups[n.group]?.members.includes(c.user) ? 0o050 : 0o005;
  return (n.mode & bits) === bits;
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
  if (c.f.container) { const ubuntuOk = ["apt", "apt-get", "service", "ls", "cat", "echo", "cd", "pwd", "mkdir", "touch", "rm", "cp", "mv", "sed", "grep", "exit", "head", "tail", "chmod", "chown", "whoami", "hostname", "curl", "printf", "wc", "id", "date", "env", "python3", "pip", "bash", "sh", "help", "clear", "ps", "vi", "nano", "vim", "apache2ctl", "nginx"]; if (!ubuntuOk.includes(name)) return false; }
  const pkg = CMD_PKG[name]; if (pkg) return c.h.pkgs.has(pkg);
  const bin = BIN[name]; if (bin) return !!c.h.fs["/usr/local/bin/" + bin] || !!c.h.fs[(c.h.users[c.user]?.home ?? "") + "/.local/bin/" + bin];
  if (c.f.container && (name === "apache2ctl")) return c.h.pkgs.has("apache2");
  return true;
}

export function* runScript(c: Ctx, path: string, args: string[], direct: boolean): G {
  const content = readFile(c.h, path);
  if (content === undefined) return err(`bash: ${path}: No such file or directory`, 127);
  if (!canRead(c, path)) return err(`bash: ${path}: Permission denied`, 126);
  if (direct && !canExec(c, path)) return err(`bash: ${path}: Permission denied`, 126);
  const out: string[] = [];
  const f: Frame = { ...c.f, env: { ...c.f.env, ...Object.fromEntries(args.map((a, i) => [String(i + 1), a])) }, batch: true };
  let code = 0;
  for (const raw of content.split("\n")) {
    const l = raw.trim(); if (!l || l.startsWith("#")) continue;
    if (/^set\s+-e/.test(l)) continue;
    const r = yield* c.sh.run(l, f, c.root ? "root" : undefined);
    if (r.out) out.push(r.out); code = r.code;
  }
  return { out: out.join("\n"), code };
}
export type { Ask };
export { mkdirp };
