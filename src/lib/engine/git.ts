// Git réaliste : commits, branches, merge (fast-forward / 3-way / conflits), rebase, cherry-pick, revert, reset, stash, remotes, hooks.
import { triggerScmJobs } from "./misc";
import { CMDS, type Ctx, type G, err, ok, opt } from "./types";
import { abs, canWrite, runScript } from "./shell";
import { type Host, children, isDir, mkdirp, norm, parent, readFile, rmrf, writeFile } from "./world";

type Commit = { id: string; msg: string; parents: string[]; tree: Record<string, string>; author: string };
export type Repo = { path: string; bare: boolean; commits: Record<string, Commit>; branches: Record<string, string>; head: string; detached?: string; remotes: Record<string, string>; remoteRefs: Record<string, string>; index: Record<string, string>; stash: { tree: Record<string, string>; msg: string }[]; tags: Record<string, string>; merging?: string; unmerged: Set<string>; config: Record<string, string> };
const REPOS = new WeakMap<Host, Record<string, Repo>>();
export const repos = (h: Host) => { let r = REPOS.get(h); if (!r) { r = {}; REPOS.set(h, r); } return r; };
let ctr = 0;
const hash = (s: string) => { let x = 2166136261 ^ ++ctr; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return (x >>> 0).toString(16).padStart(8, "0") + ((x * 31) >>> 0).toString(16).padStart(8, "0") + "a1b2c3d4e5f60718293a4b5c"; };

export function findRepo(h: Host, cwd: string): Repo | undefined {
  let p = norm(cwd); const rs = repos(h);
  for (;;) { if (rs[p]) return rs[p]; if (p === "/") return undefined; p = parent(p); }
}
export function newRepo(h: Host, path: string, bare: boolean, owner: string): Repo {
  const r: Repo = { path, bare, commits: {}, branches: {}, head: "master", remotes: {}, remoteRefs: {}, index: {}, stash: [], tags: {}, unmerged: new Set(), config: {} };
  repos(h)[path] = r; mkdirp(h, path, owner);
  if (bare) { mkdirp(h, path + "/hooks", owner); writeFile(h, path + "/HEAD", "ref: refs/heads/master\n", owner); writeFile(h, path + "/config", "[core]\n\tbare = true\n", owner); for (const s of ["post-update", "pre-commit", "pre-push", "update"]) writeFile(h, `${path}/hooks/${s}.sample`, s === "post-update" ? "#!/bin/sh\n# An example hook script to prepare a packed repository for use over\n# dumb transports.\nexec git update-server-info\n" : "#!/bin/sh\n", owner, 0o755); mkdirp(h, path + "/refs/heads", owner); mkdirp(h, path + "/objects", owner); }
  else { mkdirp(h, path + "/.git", owner); writeFile(h, path + "/.git/HEAD", "ref: refs/heads/master\n", owner); mkdirp(h, path + "/.git/hooks", owner); }
  return r;
}
const headId = (r: Repo) => r.detached ?? r.branches[r.head];
const tree = (r: Repo, id?: string) => (id ? r.commits[id]?.tree ?? {} : {});
export function workTree(h: Host, r: Repo): Record<string, string> {
  const out: Record<string, string> = {}; const pre = r.path + "/";
  for (const [k, n] of Object.entries(h.fs)) if (n.type === "f" && k.startsWith(pre) && !k.startsWith(pre + ".git/") && !k.slice(pre.length).split("/").some((s) => s === ".git")) out[k.slice(pre.length)] = n.content;
  return out;
}
function setWork(h: Host, r: Repo, t: Record<string, string>, owner: string) {
  for (const k of Object.keys(workTree(h, r))) delete h.fs[r.path + "/" + k];
  for (const [k, v] of Object.entries(t)) writeFile(h, r.path + "/" + k, v, owner);
}
export function mkCommit(r: Repo, msg: string, t: Record<string, string>, parents: string[], author = "admin"): string {
  const id = hash(msg + JSON.stringify(t) + parents.join());
  r.commits[id] = { id, msg, parents, tree: { ...t }, author };
  return id;
}
function ancestors(r: Repo, id?: string): Set<string> { const s = new Set<string>(); const st = id ? [id] : []; while (st.length) { const x = st.pop()!; if (s.has(x)) continue; s.add(x); st.push(...(r.commits[x]?.parents ?? [])); } return s; }
function mergeBase(r: Repo, a?: string, b?: string) { const A = ancestors(r, a); const order: string[] = []; const st = b ? [b] : []; const seen = new Set<string>(); while (st.length) { const x = st.shift()!; if (seen.has(x)) continue; seen.add(x); order.push(x); st.push(...(r.commits[x]?.parents ?? [])); } return order.find((x) => A.has(x)); }
export function resolve(r: Repo, ref: string): string | undefined {
  const m = /^(.+?)~(\d+)$/.exec(ref) ?? /^(.+?)(\^+)$/.exec(ref);
  if (m) { let id = resolve(r, m[1]!); const n = /^\d+$/.test(m[2]!) ? +m[2]! : m[2]!.length; for (let i = 0; i < n && id; i++) id = r.commits[id]?.parents[0]; return id; }
  if (ref === "HEAD") return headId(r);
  if (r.branches[ref]) return r.branches[ref];
  if (r.tags[ref]) return r.tags[ref];
  if (r.remoteRefs[ref]) return r.remoteRefs[ref];
  if (/^[0-9a-f]{4,40}$/.test(ref)) return Object.keys(r.commits).find((k) => k.startsWith(ref));
  return undefined;
}
function copyCommits(src: Repo, dst: Repo, id?: string) { for (const x of ancestors(src, id)) if (!dst.commits[x]) dst.commits[x] = src.commits[x]!; }
function remoteRepo(c: Ctx, r: Repo, name: string): Repo | string {
  const url = r.remotes[name]; if (!url) return `fatal: '${name}' does not appear to be a git repository\nfatal: Could not read from remote repository.`;
  const rr = repos(c.h)[norm(url.replace(/^file:\/\//, ""))]; return rr ?? `fatal: '${url}' does not appear to be a git repository`;
}
const short = (id: string) => id.slice(0, 7);
function threeWay(b: Record<string, string>, o: Record<string, string>, t: Record<string, string>, otherName: string) {
  const out: Record<string, string> = {}; const conflicts: string[] = [];
  for (const k of new Set([...Object.keys(b), ...Object.keys(o), ...Object.keys(t)])) {
    const B = b[k], O = o[k], T = t[k];
    if (O === T) { if (O !== undefined) out[k] = O; } else if (O === B) { if (T !== undefined) out[k] = T; } else if (T === B) { if (O !== undefined) out[k] = O; }
    else { conflicts.push(k); out[k] = `<<<<<<< HEAD\n${O ?? ""}=======\n${T ?? ""}>>>>>>> ${otherName}\n`; }
  }
  return { out, conflicts };
}
function* runHook(c: Ctx, remote: Repo, hook: string, refs: string[]): G {
  const p = `${remote.path}/hooks/${hook}`; const n = c.h.fs[p]; if (!n || !(n.mode & 0o100)) return ok();
  const r = yield* runScript({ ...c, f: { ...c.f, cwd: remote.path } }, p, refs, false);
  return { out: r.out ? r.out.split("\n").map((l) => "remote: " + l).join("\n") : "", code: 0 };
}

CMDS["git"] = function* (c, a) {
  const [sub, ...rest] = a; const h = c.h;
  if (!sub || sub === "--version" || sub === "version") return ok("git version 2.43.0");
  if (sub === "init") {
    const bare = rest.includes("--bare"); const p = abs(c.f, rest.filter((x) => !x.startsWith("-"))[0] ?? ".");
    if (!canWrite(c, p)) return err(`fatal: cannot mkdir ${p}: Permission denied`);
    if (repos(h)[p]) return ok(`Reinitialized existing Git repository in ${p}${bare ? "" : "/.git"}/`);
    newRepo(h, p, bare, c.user); return ok(`Initialized empty Git repository in ${p}${bare ? "" : "/.git"}/`);
  }
  if (sub === "config") { const k = rest.filter((x) => !x.startsWith("--"))[0]; const v = rest.filter((x) => !x.startsWith("--"))[1]; const r = findRepo(h, c.f.cwd); if (r && k && v) r.config[k] = v; return ok(k && !v ? r?.config[k] ?? "" : ""); }
  if (sub === "clone") {
    const pos = rest.filter((x) => !x.startsWith("-")); const src = pos[0]; if (!src) return err("fatal: You must specify a repository to clone.");
    const sp = norm(src.replace(/^file:\/\//, "").replace(/^[^@]+@[^:]+:/, "")); const sr = repos(h)[sp] ?? repos(h)[abs(c.f, src)];
    if (!sr) return err(`fatal: repository '${src}' does not exist`);
    const dst = abs(c.f, pos[1] ?? sp.split("/").pop()!.replace(/\.git$/, ""));
    if (h.fs[dst] && children(h, dst).length) return err(`fatal: destination path '${pos[1] ?? dst.split("/").pop()}' already exists and is not an empty directory.`);
    if (!canWrite(c, dst)) return err(`fatal: could not create work tree dir '${dst}': Permission denied`);
    const r = newRepo(h, dst, false, c.user); copyCommits(sr, r, undefined); Object.assign(r.commits, sr.commits);
    r.remotes["origin"] = sp; for (const [b, id] of Object.entries(sr.branches)) r.remoteRefs[`origin/${b}`] = id;
    const def = sr.branches[sr.head] ? sr.head : Object.keys(sr.branches)[0];
    if (def) { r.head = def; r.branches[def] = sr.branches[def]!; r.index = { ...tree(r, r.branches[def]) }; setWork(h, r, r.index, c.user); }
    return ok(`Cloning into '${dst.split("/").pop()}'...\n${def ? "done." : "warning: You appear to have cloned an empty repository."}`);
  }
  const r = findRepo(h, c.f.cwd);
  if (!r) return err("fatal: not a git repository (or any of the parent directories): .git", 128);
  if (r.bare && !["log", "branch", "tag", "show", "update-server-info", "rev-parse"].includes(sub)) return err("fatal: this operation must be run in a work tree", 128);
  const wt = () => workTree(h, r); const owner = c.user;
  const doCommit = (msg: string, parents: string[]) => { const id = mkCommit(r, msg, r.index, parents, owner); if (r.detached) r.detached = id; else r.branches[r.head] = id; return id; };
  switch (sub) {
    case "status": {
      const w = wt(); const hd = tree(r, headId(r)); const lines = [`On branch ${r.head}`];
      if (r.merging) lines.push("You have unmerged paths.\n  (fix conflicts and run \"git commit\")");
      const staged = Object.keys({ ...r.index, ...hd }).filter((k) => r.index[k] !== hd[k]);
      const mod = Object.keys(r.index).filter((k) => w[k] !== undefined && w[k] !== r.index[k] && !r.unmerged.has(k));
      const del = Object.keys(r.index).filter((k) => w[k] === undefined);
      const untracked = Object.keys(w).filter((k) => r.index[k] === undefined);
      if (staged.length) lines.push("Changes to be committed:\n" + staged.map((k) => `\t\x1b[32m${hd[k] === undefined ? "new file" : r.index[k] === undefined ? "deleted" : "modified"}:   ${k}\x1b[0m`).join("\n"));
      if (r.unmerged.size) lines.push("Unmerged paths:\n" + [...r.unmerged].map((k) => `\t\x1b[31mboth modified:   ${k}\x1b[0m`).join("\n"));
      if (mod.length || del.length) lines.push("Changes not staged for commit:\n" + [...mod.map((k) => `\t\x1b[31mmodified:   ${k}\x1b[0m`), ...del.map((k) => `\t\x1b[31mdeleted:    ${k}\x1b[0m`)].join("\n"));
      if (untracked.length) lines.push("Untracked files:\n" + untracked.map((k) => `\t\x1b[31m${k}\x1b[0m`).join("\n"));
      if (!staged.length && !mod.length && !untracked.length && !del.length && !r.unmerged.size) lines.push("nothing to commit, working tree clean");
      return ok(lines.join("\n"));
    }
    case "add": {
      const w = wt(); const ps = rest.filter((x) => !x.startsWith("-") || x === "."); if (!ps.length && !rest.includes("-A")) return err("Nothing specified, nothing added.");
      const all = rest.includes("-A") || rest.includes("--all") || ps.includes(".");
      const rel = (p: string) => abs(c.f, p).slice(r.path.length + 1);
      for (const p of all ? Object.keys({ ...w, ...r.index }) : ps.map(rel)) {
        const matches = Object.keys({ ...w, ...r.index }).filter((k) => k === p || k.startsWith(p + "/"));
        if (!matches.length) return err(`fatal: pathspec '${p}' did not match any files`, 128);
        for (const k of matches) { if (w[k] === undefined) delete r.index[k]; else r.index[k] = w[k]!; r.unmerged.delete(k); }
      }
      return ok();
    }
    case "rm": { for (const p of rest.filter((x) => !x.startsWith("-"))) { const k = abs(c.f, p).slice(r.path.length + 1); delete r.index[k]; if (!rest.includes("--cached")) delete h.fs[r.path + "/" + k]; } return ok(); }
    case "commit": {
      const m = opt(rest, "-m") ?? opt(rest, "-am"); if (rest.includes("-a") || rest.includes("-am")) { const w = wt(); for (const k of Object.keys(r.index)) { if (w[k] === undefined) delete r.index[k]; else r.index[k] = w[k]!; } }
      if (r.unmerged.size) return err("error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nfatal: Exiting because of an unresolved conflict.", 128);
      if (!r.config["user.email"] && !c.w.meta["gitIdentityOk"]) { /* identité implicite acceptée */ }
      const hid = headId(r); const msg = m ?? (r.merging ? `Merge branch '${r.merging}'` : undefined);
      if (!msg) return err("Aborting commit due to empty commit message. (utilise -m \"message\")");
      if (!r.merging && hid && JSON.stringify(r.index) === JSON.stringify(tree(r, hid))) return err(`On branch ${r.head}\nnothing to commit, working tree clean`);
      const parents = hid ? [hid] : []; if (r.merging) { const o = resolve(r, r.merging); if (o) parents.push(o); delete r.merging; }
      const id = doCommit(msg, parents); return ok(`[${r.head}${hid ? "" : " (root-commit)"} ${short(id)}] ${msg}\n ${Object.keys(r.index).length} file(s) changed`);
    }
    case "log": {
      const ref = rest.filter((x) => !x.startsWith("-"))[0]; let id = ref ? resolve(r, ref) : headId(r);
      if (!id) return err(`fatal: your current branch '${r.head}' does not have any commits yet`, 128);
      const out: string[] = []; const n = Number(opt(rest, "-n") ?? (rest.find((x) => /^-\d+$/.test(x))?.slice(1)) ?? 50);
      const decor = (x: string) => { const d = [...(headId(r) === x ? [`HEAD -> ${r.head}`] : []), ...Object.entries(r.branches).filter(([b, v]) => v === x && b !== r.head).map(([b]) => b), ...Object.entries(r.remoteRefs).filter(([, v]) => v === x).map(([b]) => b), ...Object.entries(r.tags).filter(([, v]) => v === x).map(([t]) => "tag: " + t)]; return d.length ? ` \x1b[33m(${d.join(", ")})\x1b[0m` : ""; };
      while (id && out.length < n) { const cm: Commit = r.commits[id]!; out.push(rest.includes("--oneline") ? `\x1b[33m${short(id)}\x1b[0m${decor(id)} ${cm.msg}` : `\x1b[33mcommit ${id}\x1b[0m${decor(id)}\nAuthor: ${cm.author} <${cm.author}@stratos.xfusioncorp.com>\n\n    ${cm.msg}\n`); id = cm.parents[0]; }
      return ok(out.join("\n"));
    }
    case "show": { const id = resolve(r, rest[0] ?? "HEAD"); if (!id) return err("fatal: bad revision"); const cm = r.commits[id]!; const p = tree(r, cm.parents[0]); return ok(`commit ${id}\n\n    ${cm.msg}\n\n` + Object.keys({ ...p, ...cm.tree }).filter((k) => p[k] !== cm.tree[k]).map((k) => `diff --git a/${k} b/${k}\n-${p[k] ?? ""}\n+${cm.tree[k] ?? ""}`).join("\n")); }
    case "branch": {
      const pos = rest.filter((x) => !x.startsWith("-"));
      if (rest.includes("-d") || rest.includes("-D")) { const b = pos[0]!; if (!r.branches[b]) return err(`error: branch '${b}' not found.`); if (b === r.head) return err(`error: Cannot delete branch '${b}' checked out`); delete r.branches[b]; return ok(`Deleted branch ${b}.`); }
      if (pos[0]) { const hid = resolve(r, pos[1] ?? "HEAD"); if (!hid) return err(`fatal: not a valid object name: '${pos[1] ?? r.head}'.`, 128); if (r.branches[pos[0]]) return err(`fatal: a branch named '${pos[0]}' already exists`, 128); r.branches[pos[0]] = hid; return ok(); }
      const bs = Object.keys(r.branches).map((b) => (b === r.head ? `* \x1b[32m${b}\x1b[0m` : `  ${b}`));
      if (rest.includes("-a")) bs.push(...Object.keys(r.remoteRefs).map((b) => `  \x1b[31mremotes/${b}\x1b[0m`));
      return ok(bs.join("\n"));
    }
    case "checkout": case "switch": {
      const create = rest.includes("-b") || rest.includes("-c"); const pos = rest.filter((x) => !x.startsWith("-")); const name = pos[0]; if (!name) return err("fatal: missing branch or commit argument");
      if (pos[0] === "--" || (sub === "checkout" && !create && !resolve(r, name) && wt()[name] !== undefined)) { const f = pos[pos.length - 1]!; const v = r.index[f]; if (v !== undefined) writeFile(h, r.path + "/" + f, v, owner); return ok(`Updated 1 path from the index`); }
      if (create) { if (r.branches[name]) return err(`fatal: a branch named '${name}' already exists`, 128); const from = resolve(r, pos[1] ?? "HEAD"); r.branches[name] = from!; r.head = name; delete r.detached; if (from) { r.index = { ...tree(r, from) }; setWork(h, r, { ...wt(), ...r.index }, owner); } return ok(`Switched to a new branch '${name}'`); }
      let target = r.branches[name];
      if (!target && r.remoteRefs[`origin/${name}`]) { r.branches[name] = target = r.remoteRefs[`origin/${name}`]!; }
      if (!target) return err(`error: pathspec '${name}' did not match any file(s) known to git`);
      const w = wt(); const cur = tree(r, headId(r)); const dirty = Object.keys(cur).filter((k) => w[k] !== cur[k] && tree(r, target)[k] !== cur[k]);
      if (dirty.length) return err(`error: Your local changes to the following files would be overwritten by checkout:\n\t${dirty.join("\n\t")}\nPlease commit your changes or stash them before you switch branches.\nAborting`);
      const untracked = Object.fromEntries(Object.entries(w).filter(([k]) => cur[k] === undefined && r.index[k] === undefined));
      r.head = name; delete r.detached; r.index = { ...tree(r, target) }; setWork(h, r, { ...r.index, ...untracked }, owner);
      return ok(`Switched to branch '${name}'`);
    }
    case "merge": {
      const name = rest.filter((x) => !x.startsWith("-"))[0]; if (!name) return err("fatal: No remote for the current branch.");
      if (rest.includes("--abort")) { delete r.merging; r.unmerged.clear(); r.index = { ...tree(r, headId(r)) }; setWork(h, r, r.index, owner); return ok(); }
      const o = resolve(r, name); if (!o) return err(`merge: ${name} - not something we can merge`);
      return yield* mergeInto(c, r, o, name);
    }
    case "remote": {
      if (rest[0] === "add") { const [, n, u] = rest; if (!n || !u) return err("usage: git remote add <name> <url>"); if (r.remotes[n]) return err(`error: remote ${n} already exists.`, 3); r.remotes[n] = u; return ok(); }
      if (rest[0] === "remove" || rest[0] === "rm") { delete r.remotes[rest[1] ?? ""]; return ok(); }
      if (rest[0] === "set-url") { r.remotes[rest[1]!] = rest[2]!; return ok(); }
      return ok(Object.entries(r.remotes).map(([n, u]) => (rest.includes("-v") ? `${n}\t${u} (fetch)\n${n}\t${u} (push)` : n)).join("\n"));
    }
    case "fetch": { const rem = rest.filter((x) => !x.startsWith("-"))[0] ?? "origin"; const rr = remoteRepo(c, r, rem); if (typeof rr === "string") return err(rr, 128); Object.assign(r.commits, rr.commits); for (const [b, id] of Object.entries(rr.branches)) r.remoteRefs[`${rem}/${b}`] = id; return ok(); }
    case "pull": {
      const pos = rest.filter((x) => !x.startsWith("-")); const rem = pos[0] ?? "origin"; const br = pos[1] ?? r.head;
      const rr = remoteRepo(c, r, rem); if (typeof rr === "string") return err(rr, 128);
      Object.assign(r.commits, rr.commits); for (const [b, id] of Object.entries(rr.branches)) r.remoteRefs[`${rem}/${b}`] = id;
      const o = rr.branches[br]; if (!o) return err(`fatal: couldn't find remote ref ${br}`, 1);
      if (rest.includes("--rebase")) return yield* rebaseOnto(c, r, o, `${rem}/${br}`);
      return yield* mergeInto(c, r, o, `${rem}/${br}`);
    }
    case "push": {
      const pos = rest.filter((x) => !x.startsWith("-")); const rem = pos[0] ?? "origin"; const force = rest.includes("-f") || rest.includes("--force");
      const rr = remoteRepo(c, r, rem); if (typeof rr === "string") return err(rr, 128);
      if (!canWrite(c, rr.path)) return err(`error: remote unpack failed: unable to create temporary object directory\nTo ${r.remotes[rem]}\n ! [remote rejected] (unpacker error)\nerror: failed to push some refs to '${r.remotes[rem]}'`);
      const branches = rest.includes("--all") ? Object.keys(r.branches) : [pos[1]?.split(":")[0] ?? r.head];
      const out: string[] = []; const updated: string[] = []; const tagsOnly = rest.includes("--tags");
      if (tagsOnly) { Object.assign(rr.tags, r.tags); copyCommits(r, rr, undefined); Object.assign(rr.commits, r.commits); return ok(`To ${r.remotes[rem]}\n${Object.keys(r.tags).map((t) => ` * [new tag]         ${t} -> ${t}`).join("\n")}`); }
      for (const b of branches) {
        const loc = r.branches[b]; if (!loc) return err(`error: src refspec ${b} does not match any\nerror: failed to push some refs to '${r.remotes[rem]}'`);
        const remId = rr.branches[b];
        if (remId === loc) { out.push("Everything up-to-date"); continue; }
        if (remId && !ancestors(r, loc).has(remId) && !force) return err(`To ${r.remotes[rem]}\n ! [rejected]        ${b} -> ${b} (fetch first)\nerror: failed to push some refs to '${r.remotes[rem]}'\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally. Integrate the remote changes (e.g. 'git pull ...') before pushing again.`);
        Object.assign(rr.commits, r.commits); rr.branches[b] = loc; updated.push(b); r.remoteRefs[`${rem}/${b}`] = loc;
        if (!rr.branches[rr.head]) rr.head = b;
        out.push(`To ${r.remotes[rem]}\n ${remId ? (force && !ancestors(r, loc).has(remId) ? "+ " : "  ") + short(remId) + (force ? "..." : "..") + short(loc) : "* [new branch]     "} ${b} -> ${b}${force && remId ? " (forced update)" : ""}`);
      }
      if (updated.length) {
        const hk = yield* runHook(c, rr, "post-update", updated.map((b) => "refs/heads/" + b));
        if (hk.out) out.unshift(hk.out);
        if (updated.includes("master")) yield* triggerScmJobs(c, rr.path);
      }
      return ok(`Enumerating objects: 5, done.\nWriting objects: 100% (3/3), done.\n${out.join("\n")}`);
    }
    case "revert": {
      const ref = rest.filter((x) => !x.startsWith("-"))[0] ?? "HEAD"; const id = resolve(r, ref); if (!id) return err(`fatal: bad revision '${ref}'`, 128);
      const cm = r.commits[id]!; const p = tree(r, cm.parents[0]); const t = { ...tree(r, headId(r)) };
      for (const k of Object.keys({ ...p, ...cm.tree })) if (p[k] !== cm.tree[k]) { if (p[k] === undefined) delete t[k]; else t[k] = p[k]!; }
      r.index = t; setWork(h, r, t, owner); const nid = doCommit(`Revert "${cm.msg}"`, [headId(r)!]);
      return ok(`[${r.head} ${short(nid)}] Revert "${cm.msg}"\n 1 file changed`);
    }
    case "cherry-pick": {
      const ref = rest.filter((x) => !x.startsWith("-"))[0]; const id = ref ? resolve(r, ref) : undefined; if (!id) return err(`fatal: bad revision '${ref}'`, 128);
      const cm = r.commits[id]!; const p = tree(r, cm.parents[0]); const t = { ...tree(r, headId(r)) };
      for (const k of Object.keys({ ...p, ...cm.tree })) if (p[k] !== cm.tree[k]) { if (cm.tree[k] === undefined) delete t[k]; else t[k] = cm.tree[k]!; }
      r.index = t; setWork(h, r, t, owner); const nid = doCommit(cm.msg, [headId(r)!]);
      return ok(`[${r.head} ${short(nid)}] ${cm.msg}\n 1 file changed`);
    }
    case "reset": {
      const ref = rest.filter((x) => !x.startsWith("-"))[0] ?? "HEAD"; const id = resolve(r, ref); if (!id) return err(`fatal: ambiguous argument '${ref}': unknown revision`, 128);
      if (r.detached) r.detached = id; else r.branches[r.head] = id;
      r.index = { ...tree(r, id) }; if (rest.includes("--hard")) { setWork(h, r, r.index, owner); return ok(`HEAD is now at ${short(id)} ${r.commits[id]!.msg}`); }
      return ok("Unstaged changes after reset:");
    }
    case "stash": {
      const act = rest[0] ?? "push";
      if (act === "list") return ok(r.stash.map((s, i) => `stash@{${i}}: ${s.msg}`).join("\n"));
      if (act === "push" || act === "save") { const w = wt(); const hd = tree(r, headId(r)); if (JSON.stringify(w) === JSON.stringify(hd)) return ok("No local changes to save"); r.stash.unshift({ tree: w, msg: `WIP on ${r.head}: ${short(headId(r)!)} ${r.commits[headId(r)!]!.msg}` }); r.index = { ...hd }; setWork(h, r, hd, owner); return ok(`Saved working directory and index state ${r.stash[0]!.msg}`); }
      if (act === "apply" || act === "pop") { const m = /stash@\{(\d+)\}/.exec(rest[1] ?? "stash@{0}"); const i = m ? +m[1]! : 0; const s = r.stash[i]; if (!s) return err(`error: stash@{${i}} is not a valid reference`); setWork(h, r, { ...wt(), ...s.tree }, owner); if (act === "pop") r.stash.splice(i, 1); return ok(`On branch ${r.head}\nChanges not staged for commit:\n${Object.keys(s.tree).map((k) => `\tmodified:   ${k}`).join("\n")}`); }
      if (act === "drop") { r.stash.splice(0, 1); return ok("Dropped stash@{0}"); }
      return err(`error: unknown subcommand: ${act}`);
    }
    case "rebase": { const ref = rest.filter((x) => !x.startsWith("-"))[0]; const id = ref ? resolve(r, ref) : undefined; if (!id) return err(`fatal: invalid upstream '${ref}'`, 128); return yield* rebaseOnto(c, r, id, ref!); }
    case "tag": { const n = rest.filter((x) => !x.startsWith("-"))[0]; if (!n) return ok(Object.keys(r.tags).join("\n")); const id = resolve(r, rest.filter((x) => !x.startsWith("-"))[1] ?? (r.bare ? r.branches["master"] ?? Object.values(r.branches)[0] ?? "" : "HEAD")); if (!id) return err("fatal: Failed to resolve 'HEAD' as a valid ref.", 128); if (r.tags[n] && !rest.includes("-f") && !rest.includes("--force")) return err(`fatal: tag '${n}' already exists`, 128); r.tags[n] = id; return ok(); }
    case "diff": { const w = wt(); return ok(Object.keys(r.index).filter((k) => w[k] !== r.index[k]).map((k) => `diff --git a/${k} b/${k}\n--- a/${k}\n+++ b/${k}\n\x1b[31m-${(r.index[k] ?? "").trim()}\x1b[0m\n\x1b[32m+${(w[k] ?? "").trim()}\x1b[0m`).join("\n")); }
    case "update-server-info": case "rev-parse": return ok(sub === "rev-parse" ? headId(r) ?? "" : "");
    default: return err(`git: '${sub}' is not a git command. See 'git --help'.`, 1);
  }
};
function* mergeInto(c: Ctx, r: Repo, o: string, name: string): G {
  const hid = headId(r); const owner = c.user;
  if (!hid) { r.branches[r.head] = o; r.index = { ...tree(r, o) }; setWork(c.h, r, r.index, owner); return ok(`Fast-forward`); }
  if (ancestors(r, hid).has(o)) return ok("Already up to date.");
  if (ancestors(r, o).has(hid)) { r.branches[r.head] = o; r.index = { ...tree(r, o) }; setWork(c.h, r, r.index, owner); return ok(`Updating ${short(hid)}..${short(o)}\nFast-forward\n ${Object.keys(r.index).length} file(s) changed`); }
  const b = mergeBase(r, hid, o); const { out, conflicts } = threeWay(tree(r, b), tree(r, hid), tree(r, o), name);
  setWork(c.h, r, out, owner);
  if (conflicts.length) { r.merging = name; r.index = { ...tree(r, hid) }; for (const k of conflicts) r.unmerged.add(k); for (const k of Object.keys(out)) if (!conflicts.includes(k)) r.index[k] = out[k]!; return err(conflicts.map((k) => `Auto-merging ${k}\nCONFLICT (content): Merge conflict in ${k}`).join("\n") + "\nAutomatic merge failed; fix conflicts and then commit the result.", 1); }
  r.index = out; const id = mkCommit(r, `Merge branch '${name}' into ${r.head}`, out, [hid, o], owner); r.branches[r.head] = id;
  return ok(`Merge made by the 'ort' strategy.\n ${Object.keys(out).length} file(s) changed`);
}
function* rebaseOnto(c: Ctx, r: Repo, onto: string, name: string): G {
  const hid = headId(r); if (!hid) return err("fatal: no commits");
  if (ancestors(r, hid).has(onto)) return ok(`Current branch ${r.head} is up to date.`);
  const b = mergeBase(r, hid, onto); const mine: string[] = []; let x: string | undefined = hid;
  while (x && x !== b) { mine.unshift(x); x = r.commits[x]!.parents[0]; }
  let cur = onto;
  for (const id of mine) { const cm = r.commits[id]!; const p = tree(r, cm.parents[0]); const t = { ...tree(r, cur) }; for (const k of Object.keys({ ...p, ...cm.tree })) if (p[k] !== cm.tree[k]) { if (cm.tree[k] === undefined) delete t[k]; else t[k] = cm.tree[k]!; } cur = mkCommit(r, cm.msg, t, [cur], cm.author); }
  r.branches[r.head] = cur; r.index = { ...tree(r, cur) }; setWork(c.h, r, r.index, c.user);
  return ok(`Successfully rebased and updated refs/heads/${r.head}. (sur ${name})`);
}
export { isDir, rmrf, readFile };
