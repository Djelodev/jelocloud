// Commandes Linux de base, utilisateurs, paquets, services, SSH, réseau.
import { CMDS, type Ctx, type G, done, err, flags, ok, opt } from "./types";
import { abs, canRead, canWrite, commandPath, runScript, vread } from "./shell";
import { http, listeners, nginxCheck, startSvc } from "./services";
import { CREDS, PKGS, PKG_ALIASES, addUser, base, children, copyTree, installPkg, isDir, mkdirp, norm, parent, readFile, resolveHost, rmrf, writeFile } from "./world";

const needRoot = (c: Ctx, what: string) => (c.root ? null : err(`${what}: Permission denied.`));
const P = (c: Ctx, p: string) => abs({ cwd: c.f.cwd, host: c.h, user: c.user }, p);

CMDS["help"] = () => done(ok(`Terminal Jelo Cloud — commandes Linux réelles simulées.
Fichiers : ls cd pwd cat echo printf touch mkdir rm cp mv chmod chown grep head tail wc sed vi/vim/nano
Système  : whoami id hostname sudo su ssh scp exit useradd usermod userdel passwd chage getent
Paquets  : yum dnf rpm apt pip3   Services : systemctl service journalctl ss ps kill
Sécurité : iptables sestatus setenforce ssh-keygen ssh-copy-id   Web : curl nginx httpd
DevOps   : git docker kubectl ansible ansible-playbook terraform tea jenkins-cli mysql psql
↑/↓ pour l’historique, Tab pour compléter.`));
CMDS["clear"] = () => done(ok("\x1bc"));
CMDS["echo"] = (c, a) => { const n = a[0] === "-n"; const e = a[0] === "-e"; const t = a.slice(n || e ? 1 : 0).join(" "); return done(ok(e ? t.replace(/\\n/g, "\n").replace(/\\t/g, "\t") : t)); };
CMDS["printf"] = (c, a) => done(ok((a[0] ?? "").replace(/\\n/g, "\n").replace(/%s/g, () => a.splice(1, 1)[0] ?? "").replace(/\n$/, "")));
CMDS["whoami"] = (c) => done(ok(c.user));
CMDS["hostname"] = (c, a) => done(ok(a.includes("-I") ? c.h.ip : c.f.container ? c.f.container.id.slice(0, 12) : c.h.name));
CMDS["pwd"] = (c) => done(ok(c.f.cwd));
CMDS["date"] = () => done(ok(new Date().toUTCString()));
CMDS["uname"] = (c, a) => done(ok(a.includes("-a") ? `Linux ${c.h.name} 5.14.0-362.el9.x86_64 #1 SMP x86_64 GNU/Linux` : "Linux"));
CMDS["env"] = (c) => done(ok(Object.entries(c.sh.envFor(c.f)).map(([k, v]) => `${k}=${v}`).join("\n")));
CMDS["export"] = (c, a) => { for (const x of a) { const [k, ...v] = x.split("="); if (k) c.f.env[k] = v.join("="); } return done(ok()); };
CMDS["history"] = (c) => done(ok(c.sh.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join("\n")));
CMDS["id"] = (c, a) => {
  const n = a[0] ?? c.user; const u = c.h.users[n]; if (!u) return done(err(`id: '${n}': no such user`));
  const gs = Object.entries(c.h.groups).filter(([g, v]) => v.members.includes(n) || g === n);
  return done(ok(`uid=${u.uid}(${n}) gid=${u.gid}(${n}) groups=${gs.map(([g, v]) => `${v.gid}(${g})`).join(",")}`));
};
CMDS["test"] = (c, a) => {
  const [first, operator, last] = a;
  if (a.length === 1) return done(first ? ok() : err(""));
  if ((first === "-f" || first === "-d" || first === "-e") && operator) {
    const node = c.h.fs[P(c, operator)];
    return done(node && (first === "-e" || node.type === first.slice(1)) ? ok() : err(""));
  }
  if (operator === "=" || operator === "==" || operator === "!=") {
    return done((first === last) === (operator !== "!=") ? ok() : err(""));
  }
  return done(err("test: invalid expression", 2));
};
CMDS["which"] = (c, a) => {
  if (!a.length) return done(err("Usage: which COMMAND"));
  const results = a.map((name) => {
    const path = commandPath(c, name);
    return path ? ok(path) : err(`which: no ${name} in (/usr/local/bin:/usr/bin)`);
  });
  return done({ out: results.map((result) => result.out).join("\n"), code: results.some((result) => result.code) ? 1 : 0 });
};
CMDS["cd"] = (c, a) => {
  const p = a[0] ? (a[0] === "-" ? c.f.cwd : P(c, a[0])) : c.h.users[c.user]?.home ?? "/";
  if (!c.h.fs[p]) return done(err(`bash: cd: ${a[0]}: No such file or directory`));
  if (!isDir(c.h, p)) return done(err(`bash: cd: ${a[0]}: Not a directory`));
  c.f.cwd = p; return done(ok());
};
const modeStr = (m: number, d: boolean) => (d ? "d" : "-") + [6, 3, 0].map((s) => ((m >> s) & 4 ? "r" : "-") + ((m >> s) & 2 ? "w" : "-") + ((m >> s) & 1 ? "x" : "-")).join("") + (m & 0o1000 ? "" : "");
CMDS["ls"] = (c, a) => {
  const { f, pos } = flags(a); const targets = pos.length ? pos : ["."]; const out: string[] = [];
  for (const t of targets) {
    const p = P(c, t); const n = c.h.fs[p];
    if (!n) { out.push(`ls: cannot access '${t}': No such file or directory`); continue; }
    if (!canRead(c, p) && n.type === "d") { out.push(`ls: cannot open directory '${t}': Permission denied`); continue; }
    let names = n.type === "d" && !f.has("-d") ? children(c.h, p) : [t];
    if (!f.has("-a")) names = names.filter((x) => !x.startsWith("."));
    else names = [".", "..", ...names];
    if (targets.length > 1) out.push(`${t}:`);
    if (f.has("-l")) {
      if (n.type === "d" && !f.has("-d")) out.push(`total ${names.length * 4}`);
      for (const nm of names) { const fp = n.type === "d" && !f.has("-d") ? norm(p + "/" + nm) : p; const x = c.h.fs[fp] ?? n; out.push(`${modeStr(x.mode, x.type === "d")}. 1 ${x.owner.padEnd(6)} ${x.group.padEnd(6)} ${String(x.type === "d" ? 4096 : x.content.length).padStart(5)} Nov 22 20:22 ${nm}`); }
    } else if (names.length) out.push(names.join("  "));
  }
  return done(ok(out.join("\n")));
};
CMDS["cat"] = (c, a) => {
  if (!a.length || a[0] === "-") return done(ok(c.stdin));
  const out: string[] = [];
  for (const x of a.filter((x) => !x.startsWith("-"))) {
    const p = P(c, x);
    if (isDir(c.h, p)) return done(err(`cat: ${x}: Is a directory`));
    if (!canRead(c, p)) return done(err(`cat: ${x}: Permission denied`));
    const v = vread(c, p); if (v === undefined) return done(err(`cat: ${x}: No such file or directory`));
    out.push(v.replace(/\n$/, ""));
  }
  return done(ok(out.join("\n")));
};
CMDS["touch"] = (c, a) => { for (const x of a) { const p = P(c, x); if (!isDir(c.h, parent(p))) return done(err(`touch: cannot touch '${x}': No such file or directory`)); if (!canWrite(c, p)) return done(err(`touch: cannot touch '${x}': Permission denied`)); if (!c.h.fs[p]) writeFile(c.h, p, "", c.user); } return done(ok()); };
CMDS["mkdir"] = (c, a) => { const { f, pos } = flags(a); for (const x of pos) { const p = P(c, x); if (c.h.fs[p] && !f.has("-p")) return done(err(`mkdir: cannot create directory '${x}': File exists`)); if (!f.has("-p") && !isDir(c.h, parent(p))) return done(err(`mkdir: cannot create directory '${x}': No such file or directory`)); if (!canWrite(c, p)) return done(err(`mkdir: cannot create directory '${x}': Permission denied`)); mkdirp(c.h, p, c.user); } return done(ok()); };
CMDS["rm"] = (c, a) => { const { f, pos } = flags(a); for (const x of pos) { const p = P(c, x); const n = c.h.fs[p]; if (!n) { if (f.has("-f")) continue; return done(err(`rm: cannot remove '${x}': No such file or directory`)); } if (n.type === "d" && !f.has("-r") && !f.has("-R")) return done(err(`rm: cannot remove '${x}': Is a directory`)); if (!canWrite(c, parent(p))) return done(err(`rm: cannot remove '${x}': Permission denied`)); rmrf(c.h, p); } return done(ok()); };
function cpmv(c: Ctx, a: string[], mv: boolean) {
  const { f, pos } = flags(a); const nm = mv ? "mv" : "cp"; if (pos.length < 2) return err(`${nm}: missing file operand`);
  const dst = P(c, pos[pos.length - 1]!); const srcs = pos.slice(0, -1);
  for (const s of srcs) {
    const sp = P(c, s); const n = c.h.fs[sp]; if (!n) return err(`${nm}: cannot stat '${s}': No such file or directory`);
    if (n.type === "d" && !mv && !f.has("-r") && !f.has("-R") && !f.has("-a")) return err(`cp: -r not specified; omitting directory '${s}'`);
    const target = isDir(c.h, dst) ? norm(dst + "/" + base(sp)) : dst;
    if (!isDir(c.h, parent(target))) return err(`${nm}: cannot create regular file '${pos[pos.length - 1]}': No such file or directory`);
    if (!canWrite(c, target)) return err(`${nm}: cannot create regular file '${target}': Permission denied`);
    copyTree(c.h, sp, c.h, target);
    if (!mv) for (const k of Object.keys(c.h.fs)) if (k === target || k.startsWith(target + "/")) { c.h.fs[k]!.owner = c.user; c.h.fs[k]!.group = c.user; }
    if (mv) rmrf(c.h, sp);
  }
  return ok();
}
CMDS["cp"] = (c, a) => done(cpmv(c, a, false));
CMDS["mv"] = (c, a) => done(cpmv(c, a, true));
function applyMode(cur: number, spec: string): number | null {
  if (/^[0-7]{3,4}$/.test(spec)) return parseInt(spec, 8);
  let m = cur;
  for (const part of spec.split(",")) {
    const r = /^([ugoa]*)([+\-=])([rwxst]*)$/.exec(part); if (!r) return null;
    const who = r[1] || "a"; const bits = r[3]!;
    let mask = 0; for (const w of who) for (const b of bits) { const v = b === "r" ? 4 : b === "w" ? 2 : b === "x" ? 1 : 0; if (w === "u" || w === "a") mask |= v << 6; if (w === "g" || w === "a") mask |= v << 3; if (w === "o" || w === "a") mask |= v; }
    if (r[2] === "+") m |= mask; else if (r[2] === "-") m &= ~mask; else m = (m & ~0o777) | mask;
  }
  return m;
}
CMDS["chmod"] = (c, a) => {
  const { f, pos } = flags(a.filter((x) => !/^[+-][rwx]+$/.test(x) || false)); const spec = a.find((x) => !x.startsWith("-") || /^-[rwx]+$/.test(x))!; const files = pos.filter((x) => x !== spec);
  if (!spec || !files.length) return done(err("chmod: missing operand"));
  for (const x of files) {
    const p = P(c, x); const n = c.h.fs[p]; if (!n) return done(err(`chmod: cannot access '${x}': No such file or directory`));
    if (!c.root && n.owner !== c.user) return done(err(`chmod: changing permissions of '${x}': Operation not permitted`));
    const targets = f.has("-R") ? Object.keys(c.h.fs).filter((k) => k === p || k.startsWith(p + "/")) : [p];
    for (const t of targets) { const m = applyMode(c.h.fs[t]!.mode, spec); if (m === null) return done(err(`chmod: invalid mode: '${spec}'`)); c.h.fs[t]!.mode = m; }
  }
  return done(ok());
};
CMDS["chown"] = (c, a) => {
  const { f, pos } = flags(a); const [spec, ...files] = pos; if (!spec || !files.length) return done(err("chown: missing operand"));
  const [u, g] = spec.split(/[:.]/); if (u && !c.h.users[u]) return done(err(`chown: invalid user: '${spec}'`));
  if (!c.root) return done(err(`chown: changing ownership of '${files[0]}': Operation not permitted`));
  for (const x of files) { const p = P(c, x); if (!c.h.fs[p]) return done(err(`chown: cannot access '${x}': No such file or directory`)); for (const k of Object.keys(c.h.fs)) if (k === p || (f.has("-R") && k.startsWith(p + "/"))) { if (u) c.h.fs[k]!.owner = u; if (g !== undefined) c.h.fs[k]!.group = g || u!; } }
  return done(ok());
};
function input(c: Ctx, files: string[]): { text: string } | { e: string } {
  if (!files.length) return { text: c.stdin };
  let t = ""; for (const x of files) { const p = P(c, x); if (!canRead(c, p)) return { e: `${x}: Permission denied` }; const v = vread(c, p); if (v === undefined) return { e: `${x}: No such file or directory` }; t += v; }
  return { text: t };
}
CMDS["grep"] = (c, a) => {
  const { f, pos } = flags(a.filter((x) => x !== "-E")); const [pat, ...files] = pos; if (pat === undefined) return done(err("Usage: grep [OPTION]... PATTERNS [FILE]..."));
  const inp = input(c, files); if ("e" in inp) return done(err(`grep: ${inp.e}`, 2));
  let re: RegExp; try { re = new RegExp(pat, f.has("-i") ? "i" : ""); } catch { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); }
  const lines = inp.text.split("\n").map((l, i) => ({ l, i })).filter(({ l }) => l !== "" && re.test(l) !== f.has("-v"));
  if (f.has("-c")) return done(ok(String(lines.length)));
  return done(lines.length ? ok(lines.map(({ l, i }) => (f.has("-n") ? `${i + 1}:` : "") + l).join("\n")) : err("", 1));
};
const headTail = (tail: boolean) => (c: Ctx, a: string[]) => { const n = Number(opt(a, "-n") ?? (a.find((x) => /^-\d+$/.test(x))?.slice(1)) ?? 10); const files = a.filter((x, i) => !x.startsWith("-") && a[i - 1] !== "-n"); const inp = input(c, files); if ("e" in inp) return done(err(`${tail ? "tail" : "head"}: ${inp.e}`)); const l = inp.text.replace(/\n$/, "").split("\n"); return done(ok((tail ? l.slice(-n) : l.slice(0, n)).join("\n"))); };
CMDS["head"] = headTail(false); CMDS["tail"] = headTail(true);
CMDS["wc"] = (c, a) => { const { f, pos } = flags(a); const inp = input(c, pos); if ("e" in inp) return done(err(`wc: ${inp.e}`)); const l = inp.text ? inp.text.replace(/\n$/, "").split("\n").length : 0; return done(ok(f.has("-l") ? String(l) : `${l} ${inp.text.split(/\s+/).filter(Boolean).length} ${inp.text.length}`)); };
CMDS["sort"] = (c, a) => { const inp = input(c, a.filter((x) => !x.startsWith("-"))); return done("e" in inp ? err(inp.e) : ok(inp.text.split("\n").filter(Boolean).sort().join("\n"))); };
CMDS["awk"] = (c, a) => { const F = opt(a, "-F") ?? (a.find((x) => x.startsWith("-F"))?.slice(2)); const prog = a.find((x) => x.includes("print")) ?? ""; const files = a.filter((x) => !x.startsWith("-F") && x !== prog && x !== F); const inp = input(c, files); if ("e" in inp) return done(err(inp.e)); const idx = [...prog.matchAll(/\$(\d+)/g)].map((m) => +m[1]!); return done(ok(inp.text.split("\n").filter(Boolean).map((l) => { const p = F ? l.split(F) : l.trim().split(/\s+/); return idx.map((i) => (i === 0 ? l : p[i - 1] ?? "")).join(" "); }).join("\n"))); };
CMDS["sed"] = (c, a) => {
  const inplace = a.includes("-i"); const rest = a.filter((x) => x !== "-i" && x !== "-e");
  const [script, ...files] = rest; if (!script) return done(err("Usage: sed [OPTION]... {script} [input-file]..."));
  const apply = (text: string): string | null => {
    let t = text;
    for (const sc of script.split(/;(?=\s*[s\/\d])/)) {
      const s = sc.trim();
      const m = /^(?:\/(.+?)\/)?s(.)(.*?)\2(.*?)\2([gI]*)$/.exec(s);
      const d = /^\/(.+)\/d$/.exec(s); const ap = /^\$a\\?\s?(.*)$/.exec(s); const ins = /^(\d+)i\\?\s?(.*)$/.exec(s);
      if (m) { const [, addr, , from, to, fl] = m; const re = new RegExp(from!.replace(/\\\?/g, "?").replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\|/g, "|"), (fl!.includes("g") ? "g" : "") + (fl!.includes("I") ? "i" : "")); t = t.split("\n").map((l) => (!addr || new RegExp(addr).test(l) ? l.replace(re, to!.replace(/\\\//g, "/").replace(/\\(\d)/g, "$$$1").replace(/&/g, "$$&")) : l)).join("\n"); }
      else if (d) t = t.split("\n").filter((l) => !new RegExp(d[1]!).test(l)).join("\n");
      else if (ap) t = t.replace(/\n?$/, "\n" + ap[1] + "\n");
      else if (ins) { const l = t.split("\n"); l.splice(+ins[1]! - 1, 0, ins[2]!); t = l.join("\n"); }
      else return null;
    }
    return t;
  };
  if (!files.length) { const r = apply(c.stdin); return done(r === null ? err(`sed: -e expression #1, char 1: unknown command`) : ok(r)); }
  const outs: string[] = [];
  for (const x of files) {
    const p = P(c, x); const v = readFile(c.h, p); if (v === undefined) return done(err(`sed: can't read ${x}: No such file or directory`, 2));
    if (!canRead(c, p)) return done(err(`sed: couldn't open file ${x}: Permission denied`, 4));
    const r = apply(v); if (r === null) return done(err(`sed: -e expression #1, char ${script.length}: unknown option to \`s'`));
    if (inplace) { if (!canWrite(c, parent(p))) return done(err(`sed: couldn't open temporary file ${parent(p)}/sedXXXX: Permission denied`, 4)); writeFile(c.h, p, r); } else outs.push(r.replace(/\n$/, ""));
  }
  return done(ok(outs.join("\n")));
};
function* editor(c: Ctx, a: string[]): G {
  const file = a.filter((x) => !x.startsWith("-") && !x.startsWith("+"))[0]; if (!file) return err("Précise un fichier : vi /chemin/fichier");
  const p = P(c, file);
  if (isDir(c.h, p)) return err(`"${file}" is a directory`);
  if (!canRead(c, p)) return err(`"${file}" [Permission Denied]`);
  const res = yield { kind: "edit", path: p, content: vread(c, p) ?? "" };
  if (res === null) return ok();
  if (!isDir(c.h, parent(p))) return err(`"${file}" E212: Can't open file for writing (le dossier n'existe pas)`);
  if (!canWrite(c, p)) return err(`"${file}" E212: Can't open file for writing (Permission denied — utilise sudo)`);
  writeFile(c.h, p, res, c.user);
  return ok(`"${file}" ${res.split("\n").length}L, ${res.length}B written`);
}
CMDS["vi"] = editor; CMDS["vim"] = editor; CMDS["nano"] = editor;
CMDS["bash"] = (c, a) => (a[0] === "-c" ? c.sh.run(a[1] ?? "", c.f, c.root ? "root" : undefined) : a[0] ? runScript(c, P(c, a.find((x) => !x.startsWith("-"))!), a.slice(1), false) : done(ok()));
CMDS["sh"] = CMDS["bash"];
CMDS["base64"] = (c, a) => done(ok(a.includes("-d") || a.includes("--decode") ? atob(c.stdin.trim()) : btoa(c.stdin.trim())));
CMDS["ping"] = (c, a) => { const t = a.find((x) => !x.startsWith("-") && !/^\d+$/.test(x)); const h = t && resolveHost(c.w, t, c.h); return done(h ? ok(`PING ${t} (${h.ip}) 56(84) bytes of data.\n64 bytes from ${h.ip}: icmp_seq=1 ttl=64 time=0.08 ms\n--- ${t} ping statistics ---\n1 packets transmitted, 1 received, 0% packet loss`) : err(`ping: ${t}: Name or service not known`, 2)); };
CMDS["ip"] = (c) => done(ok(`1: lo: <LOOPBACK,UP> inet 127.0.0.1/8\n2: eth0: <BROADCAST,MULTICAST,UP> inet ${c.h.ip}/24`));
CMDS["zip"] = (c, a) => { const { pos } = flags(a); const [z, ...src] = pos; if (!z || !src.length) return done(err("zip error: Nothing to do!", 12)); const zp = P(c, z.endsWith(".zip") ? z : z + ".zip"); for (const s of src) if (!c.h.fs[P(c, s)]) return done(err(`\tzip warning: name not matched: ${s}\nzip error: Nothing to do! (${z})`, 12)); if (!canWrite(c, zp)) return done(err(`zip I/O error: Permission denied\nzip error: Could not create output file (${z})`, 15)); writeFile(c.h, zp, "PK-ZIP:" + src.map((s) => P(c, s)).join(","), c.user); return done(ok(src.map((s) => `  adding: ${s.replace(/^\//, "")}/ (stored 0%)`).join("\n"))); };

// ---------- Utilisateurs ----------
CMDS["useradd"] = (c, a) => {
  const no = needRoot(c, "useradd"); if (no) return done(err("useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.", 1));
  const name = a.filter((x, i) => !x.startsWith("-") && !(a[i - 1] ?? "").match(/^-[sedugGc]$|^--(shell|expiredate|home-dir|uid|gid|groups|comment)$/)).pop();
  if (!name) return done(err("Usage: useradd [options] LOGIN"));
  if (c.h.users[name]) return done(err(`useradd: user '${name}' already exists`, 9));
  const exp = opt(a, "-e", "--expiredate"); if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) return done(err(`useradd: invalid date '${exp}'`, 3));
  const shell = opt(a, "-s", "--shell"); const home = opt(a, "-d", "--home-dir"); const uid = opt(a, "-u", "--uid");
  const groups = opt(a, "-G", "--groups"); for (const g of groups?.split(",") ?? []) if (!c.h.groups[g]) return done(err(`useradd: group '${g}' does not exist`, 6));
  if (uid && Object.values(c.h.users).some((u) => u.uid === +uid)) return done(err(`useradd: UID ${uid} is not unique`, 4));
  const u = addUser(c.h, name, { ...(shell ? { shell } : {}), ...(home ? { home } : {}), ...(uid ? { uid: +uid, gid: +uid } : {}), ...(exp ? { expire: exp } : {}) });
  for (const g of groups?.split(",") ?? []) c.h.groups[g]!.members.push(name);
  if (!a.includes("-M")) mkdirp(c.h, u.home, name);
  return done(ok());
};
CMDS["adduser"] = CMDS["useradd"];
CMDS["userdel"] = (c, a) => { if (!c.root) return done(err("userdel: Permission denied.")); const n = a.filter((x) => !x.startsWith("-"))[0]!; if (!c.h.users[n]) return done(err(`userdel: user '${n}' does not exist`, 6)); if (a.includes("-r")) rmrf(c.h, c.h.users[n]!.home); delete c.h.users[n]; return done(ok()); };
CMDS["usermod"] = (c, a) => {
  if (!c.root) return done(err("usermod: Permission denied."));
  const n = a[a.length - 1]!; const u = c.h.users[n]; if (!u) return done(err(`usermod: user '${n}' does not exist`, 6));
  const s = opt(a, "-s"); if (s) u.shell = s; const e = opt(a, "-e"); if (e) u.expire = e; else if (e === "") delete u.expire;
  const g = opt(a, "-G", "-aG"); if (g) for (const x of g.split(",")) { if (!c.h.groups[x]) return done(err(`usermod: group '${x}' does not exist`, 6)); if (!c.h.groups[x]!.members.includes(n)) c.h.groups[x]!.members.push(n); }
  return done(ok());
};
CMDS["groupadd"] = (c, a) => { if (!c.root) return done(err("groupadd: Permission denied.")); const n = a.filter((x) => !x.startsWith("-"))[0]!; if (c.h.groups[n]) return done(err(`groupadd: group '${n}' already exists`, 9)); c.h.groups[n] = { gid: 1500 + Object.keys(c.h.groups).length, members: [] }; return done(ok()); };
CMDS["passwd"] = function* (c, a) {
  const n = a.filter((x) => !x.startsWith("-"))[0] ?? c.user; const u = c.h.users[n]; if (!u) return err(`passwd: Unknown user name '${n}'.`);
  if (n !== c.user && !c.root) return err("passwd: Only root can specify a user name.");
  if (a.includes("--stdin")) { u.password = c.stdin.trim(); return ok(`Changing password for user ${n}.\npasswd: all authentication tokens updated successfully.`); }
  const p1 = yield { kind: "password", prompt: "New password: " }; const p2 = yield { kind: "password", prompt: "Retype new password: " };
  if (p1 !== p2) return err("Sorry, passwords do not match.\npasswd: Authentication token manipulation error");
  if (p1 === null) return err("passwd: cancelled");
  u.password = p1; return ok("passwd: all authentication tokens updated successfully.");
};
CMDS["chage"] = (c, a) => {
  const n = a[a.length - 1]!; const u = c.h.users[n]; if (!u) return done(err(`chage: user '${n}' does not exist in /etc/passwd`));
  if (!c.root && !(a.includes("-l") && n === c.user)) return done(err("chage: Permission denied."));
  const e = opt(a, "-E"); if (e) { if (e === "-1") delete u.expire; else u.expire = e; return done(ok()); }
  const exp = u.expire ? new Date(u.expire + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }) : "never";
  return done(ok(`Last password change\t\t\t\t\t: Nov 22, 2026\nPassword expires\t\t\t\t\t: never\nPassword inactive\t\t\t\t\t: never\nAccount expires\t\t\t\t\t\t: ${exp}\nMinimum number of days between password change\t\t: 0\nMaximum number of days between password change\t\t: 99999`));
};
CMDS["getent"] = (c, a) => { const db = a[0]; const k = a[1]; const v = vread(c, db === "group" ? "/etc/group" : "/etc/passwd") ?? ""; const l = v.split("\n").filter((x) => x && (!k || x.startsWith(k + ":"))); return done(l.length ? ok(l.join("\n")) : err("", 2)); };

// ---------- sudo / su / exit ----------
function* auth(c: Ctx, prompt: string, pass: string): Generator<import("./types").Ask, boolean, string | null> {
  for (let i = 0; i < 3; i++) { const p = yield { kind: "password", prompt }; if (p === pass) return true; if (i < 2) prompt = "Sorry, try again.\n" + prompt; }
  return false;
}
CMDS["sudo"] = function* (c, a) {
  const u = c.h.users[c.user]!;
  if (!c.root) {
    const allowed = c.h.groups["wheel"]?.members.includes(c.user) || readFile(c.h, "/etc/sudoers")?.includes(c.user);
    const passwordless = readFile(c.h, "/etc/sudoers")?.split("\n").some((line) => {
      const [user, , marker, ...commands] = line.trim().split(/\s+/);
      return user === c.user && marker === "NOPASSWD:" && commands.some((cmd) => cmd === "ALL" || base(cmd) === a[0]);
    });
    if (!allowed) return err(`${c.user} is not in the sudoers file.  This incident will be reported.`);
    if (!c.f.sudoOk && !passwordless) {
      const okk = yield* auth(c, `[sudo] password for ${c.user}: `, u.password);
      if (!okk) return err("sudo: 3 incorrect password attempts");
      c.f.sudoOk = true;
    }
  }
  let args = a; let target = "root";
  const ui = args.indexOf("-u"); if (ui >= 0) { target = args[ui + 1] ?? "root"; args = [...args.slice(0, ui), ...args.slice(ui + 2)]; }
  if (args[0] === "-i" || (args[0] === "su" && (args[1] === "-" || args[1] === undefined || args[1] === "root" || args[1] === "-i")) || (args[0] === "-s")) {
    c.sh.stack.push({ host: c.h, user: "root", cwd: "/root", env: {}, sudoOk: true }); return ok();
  }
  if (args[0] === "su" && args[1] === "-" && args[2]) args = ["su", args[2]];
  if (!args.length) return err("usage: sudo -h | -K | -k | -V\nusage: sudo [-u user] command");
  if (!c.h.users[target]) return err(`sudo: unknown user ${target}`);
  return yield* c.sh.exec(args, c.f, c.stdin, target);
};
CMDS["su"] = function* (c, a) {
  const n = a.filter((x) => x !== "-" && x !== "-l")[0] ?? "root"; const ci = a.indexOf("-c");
  const u = c.h.users[n]; if (!u) return err(`su: user ${n} does not exist`);
  if (!c.root) { const okk = yield* auth(c, "Password: ", u.password); if (!okk) return err("su: Authentication failure"); }
  if (u.shell.includes("nologin")) return err("This account is currently not available.");
  if (ci >= 0) return yield* c.sh.run(a[ci + 1] ?? "", c.f, n);
  c.sh.stack.push({ host: c.h, user: n, cwd: u.home, env: {} }); return ok();
};
CMDS["exit"] = (c) => {
  const st = c.sh.stack; if (st.length === 1) return done(ok("logout — tu es sur le jump host (rien à quitter)."));
  const f = st.pop()!; const msg = f.container ? "exit" : f.host !== st[st.length - 1]!.host ? `logout\nConnection to ${f.host.name} closed.` : "logout";
  return done(ok(msg));
};
CMDS["logout"] = CMDS["exit"];

// ---------- SSH ----------
const pubOf = (h: import("./world").Host, user: string) => readFile(h, `${h.users[user]?.home}/.ssh/id_rsa.pub`)?.trim();
function* sshLogin(c: Ctx, target: string): Generator<import("./types").Ask, { h: import("./world").Host; user: string } | string, string | null> {
  const at = target.includes("@") ? target.split("@") : [c.user, target];
  const user = at[0]!; const hostName = at[1]!;
  const h = resolveHost(c.w, hostName, c.h);
  if (!h) return `ssh: Could not resolve hostname ${hostName}: Name or service not known`;
  if (!h.svcs["sshd"]?.active) return `ssh: connect to host ${hostName} port 22: Connection refused`;
  const conf = h.svcs["sshd"].config ?? "";
  const u = Object.hasOwn(h.users, user) ? h.users[user] : undefined;
  const rootDenied = user === "root" && /^\s*PermitRootLogin\s+no/m.test(conf);
  const pub = pubOf(c.h, c.user);
  const keyOk = !/^\s*PubkeyAuthentication\s+no/m.test(conf) && !!u && !!pub && (readFile(h, `${u.home}/.ssh/authorized_keys`) ?? "").includes(pub) && !rootDenied;
  if (!keyOk) {
    if (c.f.batch || /^\s*PasswordAuthentication\s+no/m.test(conf)) return `${user}@${hostName}: Permission denied (publickey,gssapi-keyex,gssapi-with-mic,password).`;
    for (let i = 0; i < 3; i++) {
      const p = yield { kind: "password", prompt: `${user}@${hostName}'s password: ` };
      if (u && !rootDenied && u.password !== "!" && p === u.password) break;
      if (i === 2) return `${user}@${hostName}: Permission denied (publickey,gssapi-keyex,gssapi-with-mic,password).`;
    }
  }
  if (u!.expire && Date.parse(u!.expire) < Date.now()) return "Your account has expired; please contact your system administrator.\nConnection closed.";
  if (u!.shell.includes("nologin") || u!.shell.includes("false")) return "This account is currently not available.\nConnection to " + hostName + " closed.";
  return { h, user };
}
CMDS["ssh"] = function* (c, a) {
  const pos = a.filter((x, i) => !x.startsWith("-") && !["-i", "-p", "-o"].includes(a[i - 1] ?? ""));
  const [target, ...cmd] = pos; if (!target) return err("usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] destination [command]", 255);
  const r = yield* sshLogin(c, target); if (typeof r === "string") return err(r, 255);
  const frame = { host: r.h, user: r.user, cwd: r.h.users[r.user]!.home, env: {}, via: c.h.name };
  if (cmd.length) return yield* c.sh.run(cmd.join(" "), { ...frame, batch: c.f.batch ?? false });
  c.sh.stack.push(frame);
  return ok(`Last login: Sun Nov 22 20:22:01 2026 from ${c.h.ip}`);
};
CMDS["scp"] = function* (c, a) {
  const pos = a.filter((x) => !x.startsWith("-")); const dst = pos.pop(); if (!dst || !pos.length) return err("usage: scp [-r] source ... [[user@]host1:]file2");
  for (const s of pos) {
    const remote = (x: string) => /^[^/]*:/.test(x);
    if (remote(dst)) {
      const [t, rp = ""] = dst.split(":"); const sp = P(c, s); if (!c.h.fs[sp]) return err(`scp: ${s}: No such file or directory`);
      const r = yield* sshLogin(c, t!); if (typeof r === "string") return err(r);
      const home = r.h.users[r.user]!.home; let tp = rp ? (rp.startsWith("/") ? rp : home + "/" + rp) : home;
      if (isDir(r.h, tp)) tp = norm(tp + "/" + base(sp));
      const fake: Ctx = { ...c, h: r.h, user: r.user, root: r.user === "root" };
      if (!isDir(r.h, parent(tp))) return err(`scp: ${parent(tp)}: No such file or directory`);
      if (!canWrite(fake, tp)) return err(`scp: ${tp}: Permission denied`);
      copyTree(c.h, sp, r.h, tp);
      for (const k of Object.keys(r.h.fs)) if (k === tp || k.startsWith(tp + "/")) { r.h.fs[k]!.owner = r.user; r.h.fs[k]!.group = r.user; }
    } else if (remote(s)) {
      const [t, rp = ""] = s.split(":"); const r = yield* sshLogin(c, t!); if (typeof r === "string") return err(r);
      const sp = norm(rp.startsWith("/") ? rp : r.h.users[r.user]!.home + "/" + rp); if (!r.h.fs[sp]) return err(`scp: ${rp}: No such file or directory`);
      let tp = P(c, dst); if (isDir(c.h, tp)) tp = norm(tp + "/" + base(sp)); copyTree(r.h, sp, c.h, tp);
    } else return err("scp: utilise user@hôte:/chemin pour la destination");
  }
  return ok(pos.map((s) => `${base(s)}                    100%   1KB   1.0MB/s   00:00`).join("\n"));
};
CMDS["ssh-keygen"] = function* (c, a) {
  const home = c.h.users[c.user]!.home; const file = opt(a, "-f")?.replace(/^~/, home) ?? `${home}/.ssh/id_rsa`;
  if (c.h.fs[file] && !a.includes("-N")) { /* écrasement */ }
  if (!a.includes("-N")) { yield { kind: "password", prompt: `Enter file in which to save the key (${file}): ` }; yield { kind: "password", prompt: "Enter passphrase (empty for no passphrase): " }; yield { kind: "password", prompt: "Enter same passphrase again: " }; }
  mkdirp(c.h, parent(file), c.user); c.h.fs[parent(file)]!.mode = 0o700;
  const id = Math.random().toString(36).slice(2, 10);
  writeFile(c.h, file, `-----BEGIN OPENSSH PRIVATE KEY-----\n${id}\n-----END OPENSSH PRIVATE KEY-----\n`, c.user, 0o600);
  writeFile(c.h, file + ".pub", `ssh-rsa AAAAB3Nza${id}C1yc2E ${c.user}@${c.h.name}\n`, c.user, 0o644);
  return ok(`Generating public/private rsa key pair.\nYour identification has been saved in ${file}\nYour public key has been saved in ${file}.pub\nThe key fingerprint is:\nSHA256:${id}${id} ${c.user}@${c.h.name}`);
};
CMDS["ssh-copy-id"] = function* (c, a) {
  const target = a.filter((x) => !x.startsWith("-") && !x.endsWith(".pub"))[0]; if (!target) return err("Usage: ssh-copy-id [-i [identity_file]] [user@]hostname");
  const pub = pubOf(c.h, c.user); if (!pub) return err("/usr/bin/ssh-copy-id: ERROR: No identities found");
  const r = yield* sshLogin(c, target); if (typeof r === "string") return err(r);
  const ak = `${r.h.users[r.user]!.home}/.ssh/authorized_keys`; mkdirp(r.h, parent(ak), r.user);
  const prev = readFile(r.h, ak) ?? ""; if (!prev.includes(pub)) writeFile(r.h, ak, prev + pub + "\n", r.user, 0o600);
  return ok(`\nNumber of key(s) added: 1\n\nNow try logging into the machine, with:   "ssh '${target}'"\nand check to make sure that only the key(s) you wanted were added.`);
};

// ---------- Paquets ----------
function* yum(c: Ctx, a: string[]): G {
  const { pos } = flags(a); const [sub, ...pk] = pos;
  if (sub === "list" || sub === "info") return ok([...c.h.pkgs].map((p) => `${p.padEnd(30)} installed`).join("\n"));
  if (!c.root) return err("Error: This command has to be run with superuser privileges (under the root user on most systems).");
  if (sub === "install") {
    if (!pk.length) return err("Error: Need to pass a list of pkgs to install");
    const bad = pk.filter((p) => { const r = PKG_ALIASES[p.split(/[-=]\d/)[0]!] ?? p; if (!PKGS[r]) return true; if (r.startsWith("docker-ce") || r === "containerd.io" || r === "docker-compose-plugin") return !c.h.fs["/etc/yum.repos.d/docker-ce.repo"]; if (r === "jenkins") return !c.h.fs["/etc/yum.repos.d/jenkins.repo"]; return false; });
    if (bad.length) return err(bad.map((b) => `No match for argument: ${b}`).join("\n") + `\nError: Unable to find a match: ${bad.join(" ")}`);
    const fresh = pk.filter((p) => !c.h.pkgs.has(PKG_ALIASES[p] ?? p));
    for (const p of pk) installPkg(c.h, p);
    if (!fresh.length) return ok(`Package ${pk.join(" ")} is already installed.\nDependencies resolved.\nNothing to do.\nComplete!`);
    return ok(`Last metadata expiration check: 0:01:12 ago.\nDependencies resolved.\n${"=".repeat(60)}\n Package            Arch     Version\nInstalling:\n${fresh.map((p) => ` ${p.padEnd(18)} x86_64   1.0-1.el9`).join("\n")}\n\nTransaction Summary\nInstall  ${fresh.length} Package(s)\nRunning transaction\n${fresh.map((p) => `  Installing       : ${p}`).join("\n")}\n\nComplete!`);
  }
  if (sub === "remove" || sub === "erase") { for (const p of pk) c.h.pkgs.delete(p); return ok("Removed.\nComplete!"); }
  if (sub === "update" || sub === "makecache") return ok("Dependencies resolved.\nNothing to do.\nComplete!");
  return err(`No such command: ${sub}. Please use /usr/bin/yum --help`);
}
CMDS["yum"] = yum; CMDS["dnf"] = yum;
CMDS["yum-config-manager"] = (c, a) => { if (!c.root) return done(err("This command has to be run under the root user.")); const u = opt(a, "--add-repo"); if (!u) return done(err("Usage: yum-config-manager --add-repo URL")); if (!/docker|jenkins/.test(u)) return done(err(`Curl error (6): Couldn't resolve host name for ${u}`)); writeFile(c.h, `/etc/yum.repos.d/${/jenkins/.test(u) ? "jenkins" : "docker-ce"}.repo`, `[repo]\nbaseurl=${u}\n`); return done(ok(`Adding repo from: ${u}`)); };
CMDS["rpm"] = (c, a) => { const p = a.filter((x) => !x.startsWith("-"))[0]; if (a.includes("--import")) return done(ok()); return done(p && c.h.pkgs.has(p) ? ok(`${p}-1.0-1.el9.x86_64`) : err(`package ${p} is not installed`)); };
function* apt(c: Ctx, a: string[]): G {
  const { pos } = flags(a); const [sub, ...pk] = pos;
  if (!c.root) return err("E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock, are you root?");
  if (sub === "update") { writeFile(c.h, "/var/lib/apt/lists/ready", "1"); return ok("Get:1 http://archive.ubuntu.com/ubuntu jammy InRelease [270 kB]\nFetched 25.4 MB in 3s\nReading package lists... Done"); }
  if (sub === "install") {
    if (!c.h.fs["/var/lib/apt/lists/ready"]) return err(`Reading package lists... Done\nE: Unable to locate package ${pk[0]}\n(astuce : lance d'abord apt update)`, 100);
    const bad = pk.filter((p) => !PKGS[p]); if (bad.length) return err(`E: Unable to locate package ${bad[0]}`, 100);
    for (const p of pk) installPkg(c.h, p);
    return ok(`Reading package lists... Done\nThe following NEW packages will be installed:\n  ${pk.join(" ")}\nSetting up ${pk.join(" ")} ...`);
  }
  return err(`E: Invalid operation ${sub}`);
}
CMDS["apt"] = apt; CMDS["apt-get"] = apt;
CMDS["pip"] = (c, a) => {
  if (!c.h.pkgs.has("python-runtime")) return done(err("bash: pip: command not found", 127));
  if (a[0] !== "install") return done(err("Usage: pip install [-r requirements.txt] PACKAGE"));
  const requirements = opt(a, "-r", "--requirement");
  const text = requirements ? readFile(c.h, P(c, requirements)) : a.slice(1).join("\n");
  if (text === undefined) return done(err(`ERROR: Could not open requirements file: ${requirements}`));
  const packages = text.split(/\r?\n/).map((line) => line.split("#")[0]!.trim()).filter(Boolean);
  if (!packages.length) return done(err("ERROR: You must give at least one requirement to install"));
  for (const item of packages) {
    if (!/^(?:flask|requests|gunicorn|django|pyyaml)(?:==[\d.]+)?$/i.test(item)) {
      return done(err(`ERROR: No matching distribution found for ${item}`));
    }
  }
  for (const item of packages) c.h.pkgs.add("pip:" + item.toLowerCase().split("==")[0]);
  return done(ok(`Successfully installed ${packages.join(" ")}`));
};
CMDS["pip3"] = (c, a) => {
  if (a[0] !== "install") return done(ok(a[0] === "list" ? (c.h.fs["/usr/local/bin/ansible"] ? "ansible 4.8.0" : "") : "pip 21.3.1"));
  const spec = a.filter((x) => !x.startsWith("-"))[1] ?? ""; const [name, ver = "latest"] = spec.split("==");
  if (name !== "ansible") return done(ok(`Successfully installed ${spec}`));
  const target = c.root ? "/usr/local/bin/ansible" : `${c.h.users[c.user]!.home}/.local/bin/ansible`;
  writeFile(c.h, target, `ansible ${ver}`, c.user, 0o755);
  return done(ok(`Collecting ${spec}\n  Downloading ansible-${ver}.tar.gz (36.1 MB)\nInstalling collected packages: ansible-core, ansible\n${c.root ? "" : "WARNING: The scripts ansible are installed in '" + target.replace("/ansible", "") + "' which is not on PATH.\n"}Successfully installed ansible-${ver}`));
};

// ---------- Services ----------
const svcName = (s: string) => s.replace(/\.service$/, "").replace(/^mysqld?$/, "mariadb").replace(/^postgresql-.*/, "postgresql").replace(/^ssh$/, "sshd");
function statusText(c: Ctx, n: string) {
  const s = c.h.svcs[n]; if (!s) return `Unit ${n}.service could not be found.`;
  const st = s.active ? "\x1b[32mactive (running)\x1b[0m since Sun 2026-11-22 20:22:00 UTC" : s.failed ? "\x1b[31mfailed\x1b[0m (Result: exit-code)" : "inactive (dead)";
  return `● ${n}.service\n     Loaded: loaded (/usr/lib/systemd/system/${n}.service; ${s.enabled ? "enabled" : "disabled"}; preset: disabled)\n     Active: ${st}${s.failed ? "\n\n" + s.failed : ""}`;
}
function* systemctl(c: Ctx, a: string[]): G {
  const { pos, f } = flags(a); const [sub, ...units] = pos;
  if (sub === "daemon-reload") return c.root ? ok() : err("Failed to reload daemon: Access denied");
  if (sub === "list-units") return ok(Object.entries(c.h.svcs).map(([n, s]) => `${(n + ".service").padEnd(24)} loaded ${s.active ? "active   running" : "inactive dead"}`).join("\n"));
  if (!sub || !units.length) return err("Too few arguments.");
  const out: string[] = [];
  for (const raw of units) {
    const n = svcName(raw); const s = c.h.svcs[n];
    if (sub === "status") { out.push(statusText(c, n)); if (!s?.active) return { out: out.join("\n"), code: 3 }; continue; }
    if (sub === "is-active") return s?.active ? ok("active") : err(s?.failed ? "failed" : "inactive", 3);
    if (sub === "is-enabled") return s?.enabled ? ok("enabled") : err(s ? "disabled" : `Failed to get unit file state for ${n}.service: No such file or directory`, 1);
    if (!c.root) return err(`==== AUTHENTICATING FOR org.freedesktop.systemd1.manage-units ====\nAuthentication is required to ${sub} '${n}.service'.\nFailed to ${sub} ${n}.service: Access denied`);
    if (!s) return err(`Failed to ${sub} ${n}.service: Unit ${n}.service not found.`);
    if (sub === "start" || sub === "restart" || sub === "reload") { if (sub !== "start") s.active = false; const e = startSvc(c.w, c.h, n); if (e) return err(e); }
    else if (sub === "stop") s.active = false;
    else if (sub === "enable") { s.enabled = true; out.push(`Created symlink /etc/systemd/system/multi-user.target.wants/${n}.service → /usr/lib/systemd/system/${n}.service.`); if (f.has("--now")) { const e = startSvc(c.w, c.h, n); if (e) return err(e); } }
    else if (sub === "disable") { s.enabled = false; if (f.has("--now")) s.active = false; out.push(`Removed "/etc/systemd/system/multi-user.target.wants/${n}.service".`); }
    else return err(`Unknown command verb ${sub}.`);
  }
  return ok(out.join("\n"));
}
CMDS["systemctl"] = systemctl;
CMDS["service"] = function* (c, a) {
  const [n, act] = a;
  if (n === "iptables" && act === "save") { if (!c.h.pkgs.has("iptables-services")) return err("The service command supports only basic LSB actions (start, stop, restart, try-restart, reload, force-reload, status). For other actions, please try to use systemctl."); if (!c.root) return err("iptables: Saving firewall rules to /etc/sysconfig/iptables: Permission denied"); writeFile(c.h, "/etc/sysconfig/iptables", c.h.iptables.map((r) => `-A ${r.chain} ${r.spec}`).join("\n") + "\n"); c.h.iptSaved = true; return ok("iptables: Saving firewall rules to /etc/sysconfig/iptables: [  OK  ]"); }
  if (c.f.container) { const s = c.h.svcs[n!]; if (!s) return err(`${n}: unrecognized service`); if (act === "start" || act === "restart") { s.active = false; const e = startSvc(c.w, c.h, n!); if (e) return err(e); return ok(` * Starting ${n} ...  [ OK ]`); } if (act === "stop") { s.active = false; return ok(` * Stopping ${n} [ OK ]`); } return ok(s.active ? ` * ${n} is running` : ` * ${n} is not running`); }
  return yield* systemctl(c, [act ?? "status", n ?? ""]);
};
CMDS["journalctl"] = (c, a) => { const u = opt(a, "-u", "--unit"); const n = u ? svcName(u) : ""; const j = n ? c.h.journal[n] ?? [] : Object.values(c.h.journal).flat(); if (!c.root) return done(ok("Hint: You are currently not seeing messages from other users and the system.\n-- No entries --")); return done(ok(j.length ? j.map((l) => `Nov 22 20:22:00 ${c.h.name} ${n || "systemd"}[812]: ${l}`).join("\n") : "-- No entries --")); };
CMDS["ss"] = (c) => done(ok("State   Recv-Q Send-Q  Local Address:Port   Peer Address:Port  Process\n" + listeners(c.h).map((l, i) => `LISTEN  0      128     0.0.0.0:${String(l.port).padEnd(13)} 0.0.0.0:*          ${c.root ? `users:(("${l.proc}",pid=${800 + i},fd=4))` : ""}`).join("\n")));
CMDS["netstat"] = (c) => done(ok("Proto Local Address           State       PID/Program name\n" + listeners(c.h).map((l, i) => `tcp   0.0.0.0:${String(l.port).padEnd(17)} LISTEN      ${c.root ? `${800 + i}/${l.proc}` : "-"}`).join("\n")));
const procs = (c: Ctx) => listeners(c.h).map((l, i) => ({ pid: 800 + i, ...l }));
CMDS["ps"] = (c) => done(ok("USER       PID %CPU %MEM COMMAND\nroot         1  0.0  0.1 /usr/lib/systemd/systemd\n" + procs(c).map((p) => `root     ${String(p.pid).padStart(5)}  0.0  0.4 /usr/sbin/${p.proc}`).join("\n")));
CMDS["kill"] = (c, a) => { const pid = +(a.filter((x) => !x.startsWith("-"))[0] ?? 0); const p = procs(c).find((x) => x.pid === pid); if (!p) return done(err(`bash: kill: (${pid}) - No such process`)); if (!c.root) return done(err(`bash: kill: (${pid}) - Operation not permitted`)); const ex = c.h.extraListeners.findIndex((l) => l.proc === p.proc); if (ex >= 0) c.h.extraListeners.splice(ex, 1); else if (c.h.svcs[p.proc]) c.h.svcs[p.proc]!.active = false; return done(ok()); };
CMDS["pkill"] = (c, a) => { const n = a[a.length - 1]!; if (!c.root) return done(err("pkill: killing pid failed: Operation not permitted")); if (c.h.svcs[n]) c.h.svcs[n]!.active = false; c.h.extraListeners = c.h.extraListeners.filter((l) => l.proc !== n); return done(ok()); };

// ---------- SELinux / iptables ----------
CMDS["sestatus"] = (c) => { const mode = /^SELINUX=(\w+)/m.exec(readFile(c.h, "/etc/selinux/config") ?? "")?.[1] ?? "enforcing"; return done(ok(c.h.selinuxRuntime === "disabled" ? "SELinux status:                 disabled" : `SELinux status:                 enabled\nCurrent mode:                   ${c.h.selinuxRuntime}\nMode from config file:          ${mode}\nPolicy from config file:        targeted`)); };
CMDS["getenforce"] = (c) => done(ok(c.h.selinuxRuntime[0]!.toUpperCase() + c.h.selinuxRuntime.slice(1)));
CMDS["setenforce"] = (c, a) => { if (!c.root) return done(err("setenforce: setenforce() failed")); c.h.selinuxRuntime = a[0] === "0" || a[0] === "Permissive" ? "permissive" : "enforcing"; return done(ok()); };
CMDS["iptables"] = (c, a) => {
  if (!c.root) return done(err("iptables v1.8.8 (nf_tables): Could not fetch rule set generation id: Permission denied (you must be root)", 4));
  const i = a.findIndex((x) => ["-A", "-I", "-D", "-L", "-F", "-S", "--list"].includes(x)); const act = a[i]; const chain = a[i + 1] && !a[i + 1]!.startsWith("-") ? a[i + 1]! : "INPUT";
  const spec = a.filter((_, j) => j !== i && j !== i + 1 && !(act === "-I" && /^\d+$/.test(a[j]!) && j === i + 2)).join(" ");
  if (act === "-A" || act === "-I") { if (!/-j\s+(ACCEPT|DROP|REJECT|LOG)/.test(spec)) return done(err("iptables v1.8.8: Bad argument: missing -j target", 2)); const r = { chain, spec }; if (act === "-I") { const pos = /^\d+$/.test(a[i + 2] ?? "") ? +a[i + 2]! - 1 : 0; c.h.iptables.splice(pos, 0, r); } else c.h.iptables.push(r); c.h.iptSaved = false; return done(ok()); }
  if (act === "-D") { const idx = /^\d+$/.test(a[i + 2] ?? "") ? +a[i + 2]! - 1 : c.h.iptables.findIndex((r) => r.chain === chain && r.spec === spec); if (idx < 0 || !c.h.iptables[idx]) return done(err("iptables: Bad rule (does a matching rule exist in that chain?).")); c.h.iptables.splice(idx, 1); return done(ok()); }
  if (act === "-F") { c.h.iptables = []; return done(ok()); }
  if (act === "-S") return done(ok(["-P INPUT ACCEPT", ...c.h.iptables.map((r) => `-A ${r.chain} ${r.spec}`)].join("\n")));
  const rows = c.h.iptables.filter((r) => r.chain === chain);
  return done(ok(`Chain ${chain} (policy ACCEPT)\n${a.includes("--line-numbers") ? "num  " : ""}target     prot opt source               destination\n` + rows.map((r, n) => `${a.includes("--line-numbers") ? String(n + 1).padEnd(5) : ""}${(/-j\s+(\S+)/.exec(r.spec)?.[1] ?? "").padEnd(10)} tcp  --  ${(/-s\s+(\S+)/.exec(r.spec)?.[1] ?? "0.0.0.0/0").padEnd(20)} 0.0.0.0/0            ${/--dport\s+(\d+)/.test(r.spec) ? "tcp dpt:" + /--dport\s+(\d+)/.exec(r.spec)![1] : ""}`).join("\n")));
};
CMDS["iptables-save"] = (c) => done(ok(c.h.iptables.map((r) => `-A ${r.chain} ${r.spec}`).join("\n")));

// ---------- Cron ----------
CMDS["crontab"] = function* (c, a) {
  const u = opt(a, "-u") ?? c.user; if (u !== c.user && !c.root) return err("must be privileged to use -u");
  if (a.includes("-l")) { const t = c.h.crontabs[u]; return t ? ok(t.replace(/\n$/, "")) : err(`no crontab for ${u}`); }
  if (a.includes("-r")) { delete c.h.crontabs[u]; return ok(); }
  const check = (t: string) => { for (const l of t.split("\n")) { const s = l.trim(); if (!s || s.startsWith("#") || /^\w+=/.test(s)) continue; const p = s.split(/\s+/); if (p.length < 6 || !p.slice(0, 5).every((x) => /^[\d*/,\-]+$/.test(x))) return `"-":${t.split("\n").indexOf(l) + 1}: bad minute\nerrors in crontab file, can't install.`; } return null; };
  if (a.includes("-e")) { const r = yield { kind: "edit", path: `/var/spool/cron/${u}`, content: c.h.crontabs[u] ?? "" }; if (r === null) return ok("crontab: no changes made to crontab"); const e = check(r); if (e) return err(e); c.h.crontabs[u] = r; return ok("crontab: installing new crontab"); }
  const file = a.filter((x) => !x.startsWith("-") && x !== u)[0]; const text = a.includes("-") || !file ? c.stdin : readFile(c.h, P(c, file)); if (text === undefined) return err(`${file}: No such file or directory`);
  const e = check(text); if (e) return err(e); c.h.crontabs[u] = text.endsWith("\n") ? text : text + "\n"; return ok();
};

// ---------- Web / curl ----------
CMDS["curl"] = (c, a) => {
  const url = a.filter((x, i) => !x.startsWith("-") && !["-o", "-H", "-X", "-d", "-u", "--data"].includes(a[i - 1] ?? ""))[0]; if (!url) return done(err("curl: try 'curl --help' for more information", 2));
  const r = http(c.w, c.h, url);
  if (!r.ok) return done(err(r.err!, 7));
  if (url.startsWith("https") && !a.includes("-k") && !a.includes("--insecure")) return done(err("curl: (60) SSL certificate problem: self-signed certificate\nMore details here: https://curl.se/docs/sslcerts.html\n(astuce : -k pour accepter un certificat auto-signé)", 60));
  if (a.includes("-I") || a.includes("--head")) return done(ok(`HTTP/1.1 ${r.status} ${r.status === 200 ? "OK" : r.status === 404 ? "Not Found" : "Bad Gateway"}\nServer: simulated\nContent-Length: ${r.body.length}`));
  return done(ok(r.body.replace(/\n$/, "")));
};
CMDS["nginx"] = (c, a) => { if (a.includes("-t")) { const e = nginxCheck(c.h); return done(e ? err(e) : ok("nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful")); } if (a.includes("-v")) return done(ok("nginx version: nginx/1.20.1")); return done(err("utilise systemctl start nginx")); };
CMDS["httpd"] = (c, a) => done(a.includes("-t") ? ok("Syntax OK") : ok("Server version: Apache/2.4.57"));
CMDS["apachectl"] = (c, a) => done(a.includes("configtest") || a.includes("-t") ? ok("Syntax OK") : err("utilise systemctl"));
CMDS["java"] = () => done(ok('openjdk version "17.0.9" 2023-10-17 LTS'));
export { CREDS };
