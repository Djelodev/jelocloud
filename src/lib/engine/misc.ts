// Bases de données (mysql/psql), Gitea CLI (tea) et Jenkins CLI.
import { CMDS, type Ctx, type G, done, err, ok, opt } from "./types";
import { abs } from "./shell";
import { type Db, mkdirp, readFile, writeFile } from "./world";

const unq = (s: string) => s.replace(/^[`'"]|[`'"]$/g, "");
function sql(db: Db, stmt: string, pg: boolean): string {
  const s = stmt.trim().replace(/;$/, ""); if (!s) return "";
  let m: RegExpExecArray | null;
  if ((m = /^CREATE DATABASE\s+(?:IF NOT EXISTS\s+)?(\S+)(?:\s+OWNER\s+(\S+))?$/i.exec(s))) { const n = unq(m[1]!); if (db.databases.has(n)) return pg ? `ERROR:  database "${n}" already exists` : `ERROR 1007 (HY000): Can't create database '${n}'; database exists`; db.databases.add(n); if (m[2]) db.grants.push({ user: unq(m[2]), db: n }); return pg ? "CREATE DATABASE" : "Query OK, 1 row affected"; }
  if ((m = /^CREATE (?:USER|ROLE)\s+(\S+?)(?:@\S+)?\s+(?:WITH\s+)?(?:LOGIN\s+)?(?:ENCRYPTED\s+)?(?:IDENTIFIED BY|PASSWORD)\s+'([^']*)'$/i.exec(s))) { const n = unq(m[1]!).replace(/'$/, ""); if (db.users[n] !== undefined) return pg ? `ERROR:  role "${n}" already exists` : `ERROR 1396 (HY000): Operation CREATE USER failed for '${n}'`; db.users[n] = m[2]!; return pg ? "CREATE ROLE" : "Query OK, 0 rows affected"; }
  if ((m = /^GRANT ALL(?: PRIVILEGES)? ON (?:DATABASE\s+)?(\S+?)(?:\.\*)?\s+TO\s+(\S+?)(?:@\S+)?$/i.exec(s))) { const d = unq(m[1]!); const u = unq(m[2]!).replace(/'$/, ""); if (!db.databases.has(d)) return pg ? `ERROR:  database "${d}" does not exist` : `ERROR 1049 (42000): Unknown database '${d}'`; if (db.users[u] === undefined) return pg ? `ERROR:  role "${u}" does not exist` : `ERROR 1133 (28000): Can't find any matching row in the user table`; db.grants.push({ user: u, db: d }); return pg ? "GRANT" : "Query OK, 0 rows affected"; }
  if (/^FLUSH PRIVILEGES$/i.test(s)) return "Query OK, 0 rows affected";
  if (/^SHOW DATABASES$/i.test(s) || s === "\\l") return [...db.databases].map((d) => `| ${d.padEnd(20)} |`).join("\n");
  if (/^SELECT\s+user/i.test(s) || s === "\\du") return Object.keys(db.users).map((u) => `| ${u.padEnd(20)} |`).join("\n");
  if (/^SHOW GRANTS FOR\s+(\S+)/i.test(s)) { const u = unq(/FOR\s+(\S+?)(?:@|$)/i.exec(s)![1]!); return db.grants.filter((g) => g.user === u).map((g) => `GRANT ALL PRIVILEGES ON \`${g.db}\`.* TO \`${u}\`@\`%\``).join("\n"); }
  if (/^ALTER DATABASE\s+(\S+)\s+OWNER TO\s+(\S+)$/i.test(s)) { const m2 = /^ALTER DATABASE\s+(\S+)\s+OWNER TO\s+(\S+)$/i.exec(s)!; db.grants.push({ user: m2[2]!, db: m2[1]! }); return "ALTER DATABASE"; }
  if (/^(USE|SELECT 1)/i.test(s)) return pg ? "" : "Database changed";
  return pg ? `ERROR:  syntax error at or near "${s.split(/\s+/)[0]}"` : `ERROR 1064 (42000): You have an error in your SQL syntax; check the manual near '${s.slice(0, 30)}' at line 1`;
}
const runSql = (db: Db, text: string, pg: boolean) => text.split(";").map((x) => sql(db, x, pg)).filter(Boolean).join("\n");

CMDS["mysql"] = function* (c, a) {
  const hostOpt = opt(a, "-h"); const h = hostOpt ? Object.values(c.w.hosts).find((x) => x.name === hostOpt || x.ip === hostOpt) : c.h;
  if (!h || !h.svcs["mariadb"]?.active) return err(`ERROR 2002 (HY000): Can't connect to ${hostOpt ? `server on '${hostOpt}'` : "local server through socket '/var/lib/mysql/mysql.sock'"} (111)`);
  const user = opt(a, "-u") ?? a.find((x) => x.startsWith("-u") && x.length > 2)?.slice(2) ?? c.user;
  const pw = a.find((x) => x.startsWith("-p") && x.length > 2)?.slice(2);
  if (user !== "root" || !c.root) { if (h.db.users[user] === undefined || (h.db.users[user] && pw !== h.db.users[user])) return err(`ERROR 1045 (28000): Access denied for user '${user}'@'localhost' (using password: ${pw ? "YES" : "NO"})`); }
  const e = opt(a, "-e");
  if (e) return ok(runSql(h.db, e, false));
  if (c.stdin) return ok(runSql(h.db, c.stdin, false));
  c.sh.stack.push({ ...c.f, repl: "mysql", env: { ...c.f.env } });
  return ok("Welcome to the MariaDB monitor.  Commands end with ; or \\g.\nServer version: 10.5.22-MariaDB MariaDB Server\nType 'help;' or '\\h' for help.");
};
CMDS["__mysql"] = (c, a) => { const l = a[0]!.trim(); if (/^(exit|quit|\\q)$/i.test(l)) { c.sh.stack.pop(); return done(ok("Bye")); } return done(ok(runSql(c.h.db, l, false))); };
CMDS["psql"] = function* (c, a) {
  if (!c.h.svcs["postgresql"]?.active) return err('psql: error: connection to server on socket "/run/postgresql/.s.PGSQL.5432" failed: No such file or directory\n\tIs the server running locally and accepting connections on that socket?');
  const role = opt(a, "-U") ?? c.user; if (c.h.pg.users[role] === undefined) return err(`psql: error: FATAL:  role "${role}" does not exist`);
  const e = opt(a, "-c"); if (e) return ok(runSql(c.h.pg, e, true));
  c.sh.stack.push({ ...c.f, repl: "psql", env: { ...c.f.env } });
  return ok('psql (13.14)\nType "help" for help.');
};
CMDS["__psql"] = (c, a) => { const l = a[0]!.trim(); if (/^(\\q|exit|quit)$/.test(l)) { c.sh.stack.pop(); return done(ok()); } return done(ok(runSql(c.h.pg, l, true))); };
CMDS["postgresql-setup"] = (c, a) => { if (!c.root) return done(err("postgresql-setup: Permission denied")); if (!a.includes("--initdb") && !a.includes("initdb")) return done(err("Usage: postgresql-setup --initdb")); if (readFile(c.h, "/var/lib/pgsql/data/PG_VERSION")) return done(err('Data directory "/var/lib/pgsql/data" is not empty!')); writeFile(c.h, "/var/lib/pgsql/data/PG_VERSION", "13\n", "postgres"); writeFile(c.h, "/var/lib/pgsql/data/postgresql.conf", "#listen_addresses = 'localhost'\n", "postgres"); writeFile(c.h, "/var/lib/pgsql/data/pg_hba.conf", "local all all peer\nhost all all 127.0.0.1/32 ident\n", "postgres"); return done(ok(" * Initializing database in '/var/lib/pgsql/data'\n * Initialized, logs are in /var/lib/pgsql/initdb_postgresql.log")); };

// ---------- Gitea CLI (tea) ----------
CMDS["tea"] = (c, a) => {
  const g = c.w.gitea; const [s1, s2] = a;
  if (s1 === "login") { const u = opt(a, "--user", "-u") ?? a[a.length - 1]!; const p = opt(a, "--password", "-p"); const pw: Record<string, string> = { jon: "Jon_pass123", max: "Max_pass123", tom: "Tom_pass123", sarah: "Sarah_pass123" }; if (pw[u] !== p) return done(err(`Error: Login failed: user ${u}: wrong password (utilise --user ${u} --password <mot de passe>)`)); g.loggedIn = u; return done(ok(`Login as ${u} on http://git.stratos.xfusioncorp.com succeeded.`)); }
  if (!g.loggedIn) return done(err("Error: No gitea login configured. To start using tea, first run\n  tea login add"));
  const me = g.loggedIn;
  if (s1 === "repos" && s2 === "fork" || s1 === "repo" && s2 === "fork") { const r = a[2]!; if (!g.repos[r]) return done(err(`Error: repository ${r} not found`)); const n = `${me}/${r.split("/")[1]}`; g.repos[n] = { owner: me, name: r.split("/")[1]!, forkOf: r }; return done(ok(`Forked ${r} → ${n}`)); }
  if (s1 === "repos" && (!s2 || s2 === "ls")) return done(ok(Object.keys(g.repos).join("\n")));
  if (s1 === "pulls" || s1 === "pr") {
    const repo = opt(a, "--repo", "-r") ?? "sarah/story-blog";
    if (s2 === "create") { const head = opt(a, "--head"); const baseB = opt(a, "--base") ?? "master"; const title = opt(a, "--title", "-t"); if (!head || !title) return done(err("Error: --head et --title sont requis")); const id = g.prs.length + 1; g.prs.push({ id, repo, head, base: baseB, title, reviewers: [], merged: false }); return done(ok(`#${id} ${title} (${head} → ${baseB}) créé par ${me}`)); }
    if (s2 === "review-request" || s2 === "assign") { const id = +a[2]!; const r = opt(a, "--reviewer") ?? a[3]; const pr = g.prs.find((p) => p.id === id); if (!pr || !r) return done(err("Error: PR introuvable")); pr.reviewers.push(r); return done(ok(`Reviewer ${r} ajouté à #${id}`)); }
    if (s2 === "merge") { const id = +a[2]!; const pr = g.prs.find((p) => p.id === id); if (!pr) return done(err("Error: PR introuvable")); if (!pr.reviewers.includes(me)) return done(err(`Error: ${me} n'est pas reviewer de cette PR`)); pr.merged = true; return done(ok(`#${id} merged into ${pr.base}`)); }
    return done(ok(g.prs.map((p) => `#${p.id}  ${p.title}  ${p.head}→${p.base}  ${p.merged ? "merged" : "open"}  reviewers: ${p.reviewers.join(",")}`).join("\n") || "Aucune PR"));
  }
  if (s1 === "whoami") return done(ok(me));
  return done(err("Commandes : tea login, tea repos fork, tea pulls create|review-request|merge|ls"));
};

// ---------- Jenkins CLI ----------
export type Job = { name: string; type: "freestyle" | "pipeline"; script: string; params: Record<string, { type: string; default: string; choices?: string[] }>; trigger?: string; scmRepo?: string; node?: string; downstream?: string[]; builds: { n: number; ok: boolean; log: string; params: Record<string, string> }[] };
function* runJob(c: Ctx, name: string, params: Record<string, string>, ancestors: string[] = []): G {
  if (ancestors.includes(name)) return err("ERROR: circular downstream jobs");
  const j = c.w.jenkins.jobs[name]!; const log: string[] = [`Started by user admin`, `Running as SYSTEM`];
  const p = { ...Object.fromEntries(Object.entries(j.params).map(([k, v]) => [k, v.default])), ...params };
  for (const [k, v] of Object.entries(j.params)) if (v.choices && !v.choices.includes(p[k]!)) return err(`ERROR: Illegal choice for parameter ${k}: ${p[k]}`);
  const jh = c.w.hosts["jenkins"]!;
  const node = j.node ? c.w.jenkins.nodes[Object.keys(c.w.jenkins.nodes).find((n) => c.w.jenkins.nodes[n]!.label === j.node || n === j.node) ?? ""] : undefined;
  if (j.node && !node?.online) return err(`ERROR: Il n'existe aucun agent avec le label '${j.node}' — la build reste en attente.`);
  const host = node ? c.w.hosts[node.host]! : jh; const user = node ? Object.keys(host.users).find((u) => host.users[u]!.groups.includes("wheel")) ?? "root" : "jenkins";
  if (!host.users[user]) return err("ERROR: utilisateur jenkins absent");
  let script = j.script;
  if (j.type === "pipeline") {
    const stages = [...script.matchAll(/\bstage\s*\(\s*['"]([^'"]+)['"]\s*\)\s*{([\s\S]*?)(?=\bstage\s*\(|$)/g)];
    if (!stages.length) return err("WorkflowScript: 1: Expected a stage @ line 1\n1 error\nFinished: FAILURE");
    script = stages.map(([, stage, fragment]) => {
      const body = fragment ?? "";
      const cond = /when\s*{\s*expression\s*{\s*(?:params\.)?(\w+)\s*==\s*['"]([^'"]+)['"]/.exec(body);
      if (cond && p[cond[1]!] !== cond[2]) return `echo "[Pipeline] stage ${stage} — skipped due to when conditional"`;
      return [`echo "[Pipeline] { (${stage})"`, ...[...body.matchAll(/\bsh\s+(['"]{1,3})([\s\S]*?)\1(?=\s|$)/g)].map((m) => m[2])].join("\n");
    }).join("\n");
  }
  const frame = { host, user, cwd: node?.remoteFs ?? "/var/lib/jenkins/workspace/" + name, env: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v])), batch: true, sudoOk: true };
  mkdirp(host, frame.cwd, user);
  let okk = true;
  for (const raw of script.split("\n")) {
    const l = raw.trim(); if (!l || l.startsWith("#") || l.startsWith("//")) continue;
    const r = yield* c.sh.run(l, frame);
    log.push("+ " + l); if (r.out) log.push(r.out);
    if (r.code !== 0) { okk = false; break; }
  }
  log.push(okk ? "Finished: SUCCESS" : "Finished: FAILURE");
  j.builds.push({ n: j.builds.length + 1, ok: okk, log: log.join("\n"), params: p });
  if (okk) for (const d of j.downstream ?? []) if (c.w.jenkins.jobs[d]) { log.push(`Triggering a new build of ${d}`); yield* runJob(c, d, {}, [...ancestors, name]); }
  return { out: log.join("\n"), code: okk ? 0 : 1 };
}
export function* triggerScmJobs(c: Ctx, repo: string): G {
  if (!c.w.hosts["jenkins"]?.svcs["jenkins"]?.active) return ok();
  for (const job of Object.values(c.w.jenkins.jobs)) {
    if (job.trigger === "scm" && job.scmRepo === repo) yield* runJob(c, job.name, {});
  }
  return ok();
}

CMDS["mysqldump"] = (c, a) => {
  if (!c.h.svcs["mariadb"]?.active) return done(err("mysqldump: Can't connect to local server"));
  const names = a.includes("--all-databases") ? [...c.h.db.databases] : a.filter((arg) => !arg.startsWith("-"));
  if (!names.length || names.some((name) => !c.h.db.databases.has(name))) return done(err("mysqldump: Unknown database"));
  return done(ok(names.map((name) => "CREATE DATABASE `" + name + "`;").join("\n")));
};

CMDS["jenkins-cli"] = function* (c, a) {
  const J = c.w.jenkins; const [sub, ...rest] = a;
  if (!c.w.hosts["jenkins"]!.svcs["jenkins"]?.active) return err("java.net.ConnectException: Connection refused — le service Jenkins ne tourne pas sur le serveur jenkins.");
  const file = (n: string) => { const v = opt(rest, "--file", "-f"); return v ? readFile(c.h, abs(c.f, v)) : c.stdin || undefined; void n; };
  switch (sub) {
    case "install-plugin": { const ps = rest.filter((x) => !x.startsWith("-")); const known = ["git", "gitlab-plugin", "workflow-aggregator", "ssh-slaves", "matrix-auth", "role-strategy", "publish-over-ssh", "parameterized-trigger", "build-pipeline-plugin", "ssh-agent", "credentials-binding"]; for (const p of ps) { if (!known.includes(p)) return err(`ERROR: Plugin ${p} n'existe pas dans l'update center. Plugins connus : ${known.join(", ")}`); J.plugins.add(p); } return ok(ps.map((p) => `Installing ${p} from update center`).join("\n")); }
    case "list-plugins": return ok([...J.plugins].join("\n"));
    case "safe-restart": case "restart": return ok("Jenkins redémarre…");
    case "create-user": { const [u, p] = rest; if (!u || !p) return err("Usage: jenkins-cli create-user USER PASSWORD"); J.users[u] = { pass: p, perms: [] }; return ok(`Utilisateur ${u} créé`); }
    case "enable-matrix": if (!J.plugins.has("matrix-auth")) return err("ERROR: installe d'abord le plugin matrix-auth"); J.matrix = true; return ok("Matrix-based security activée");
    case "grant": { const [u, ...perms] = rest; if (!u || !J.users[u]) return err(`ERROR: utilisateur ${u} inconnu`); if (!J.matrix) return err("ERROR: active d'abord la Matrix-based security (jenkins-cli enable-matrix)"); J.users[u]!.perms.push(...perms); return ok(`${u} : ${perms.join(", ")}`); }
    case "grant-job": { const [job, u, ...perms] = rest; if (!job || !J.jobs[job]) return err(`ERROR: No such job '${job}'`); if (!u || !J.users[u]) return err(`ERROR: utilisateur ${u} inconnu`); ((J.jobPerms[job] ??= {})[u] ??= []).push(...perms); return ok(`${job} → ${u} : ${perms.join(", ")}`); }
    case "create-job": {
      const n = rest.filter((x) => !x.startsWith("-") && x !== opt(rest, "--file", "-f") && x !== opt(rest, "--type"))[0]; if (!n) return err("Usage: jenkins-cli create-job NAME [--type pipeline] --file Jenkinsfile");
      if (J.jobs[n]) return err(`ERROR: Job '${n}' already exists`);
      const type = (opt(rest, "--type") ?? "freestyle") as "freestyle" | "pipeline"; const script = file(n) ?? "";
      const params: Job["params"] = {};
      for (const m of script.matchAll(/(string|choice)\s*\(\s*name:\s*['"](\w+)['"](?:,\s*(?:defaultValue|choices):\s*(\[[^\]]*\]|['"][^'"]*['"]))?/g)) { const v = m[3] ?? ""; const ch = v.startsWith("[") ? [...v.matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]!) : undefined; params[m[2]!] = { type: m[1]!, default: ch ? ch[0]! : v.replace(/['"]/g, ""), ...(ch ? { choices: ch } : {}) }; }
      for (const pspec of [opt(rest, "--param")].filter(Boolean)) { const [k, v] = pspec!.split("="); params[k!] = { type: "string", default: v ?? "" }; }
      const label = opt(rest, "--node") ?? /agent\s*{\s*label\s+['"]([^'"]+)['"]/.exec(script)?.[1];
      J.jobs[n] = { name: n, type, script, params, builds: [], ...(label ? { node: label } : {}) };
      return ok(`Job '${n}' (${type}) créé${Object.keys(params).length ? ` avec paramètres : ${Object.keys(params).join(", ")}` : ""}`);
    }
    case "add-param": { const [job, name, def = ""] = rest; const j = job ? J.jobs[job] : undefined; if (!j || !name) return err("Usage: jenkins-cli add-param JOB NAME DEFAULT [--choices a,b]"); const ch = opt(rest, "--choices")?.split(","); j.params[name] = { type: ch ? "choice" : "string", default: ch ? ch[0]! : def, ...(ch ? { choices: ch } : {}) }; return ok(`Paramètre ${name} ajouté à ${job}`); }
    case "set-trigger": { const [job, spec] = rest; const j = job ? J.jobs[job] : undefined; if (!j) return err(`ERROR: No such job '${job}'`); if (!spec || (spec !== "scm" && spec.split(/\s+/).length !== 5)) return err("ERROR: spécification cron invalide (5 champs, ex : 'H/10 * * * *') ou 'scm'"); const repo = opt(rest, "--repo"); if (spec === "scm" && !repo) return err("Usage: set-trigger JOB scm --repo /path/to/repository"); j.trigger = spec; if (repo) j.scmRepo = repo; else delete j.scmRepo; return ok(`Trigger de ${job} : ${spec}`); }
    case "link": { const [up, down] = rest; if (!up || !J.jobs[up] || !down || !J.jobs[down]) return err("ERROR: les deux jobs doivent exister"); (J.jobs[up]!.downstream ??= []).push(down); return ok(`${down} sera déclenché après un succès de ${up}`); }
    case "create-node": { const n = rest.find((x) => !x.startsWith("-")); const host = opt(rest, "--host"); const label = opt(rest, "--label") ?? ""; const fs = opt(rest, "--remote-fs") ?? "/home/jenkins"; if (!n || !host) return err("Usage: jenkins-cli create-node NAME --host stapp01 --label LABEL --remote-fs /chemin"); const h = c.w.hosts[host]; if (!h) return err(`ERROR: hôte ${host} introuvable`); if (!h.pkgs.has("java-17-openjdk")) { J.nodes[n] = { host, label, remoteFs: fs, online: false }; return err(`Agent ${n} créé mais OFFLINE : java est absent sur ${host} (installe java-17-openjdk)`); } J.nodes[n] = { host, label, remoteFs: fs, online: true }; return ok(`Agent ${n} connecté (${host}) — label: ${label}`); }
    case "list-nodes": return ok(Object.entries(J.nodes).map(([n, v]) => `${n.padEnd(20)} ${v.host.padEnd(10)} ${v.label.padEnd(12)} ${v.online ? "online" : "OFFLINE"}`).join("\n") || "(aucun agent)");
    case "build": { const job = rest[0]; if (!job || !J.jobs[job]) return err(`ERROR: No such job '${job}'`); const ps: Record<string, string> = {}; rest.forEach((x, i) => { if (x === "-p") { const [k, v] = (rest[i + 1] ?? "").split("="); ps[k!] = v ?? ""; } }); for (const k of Object.keys(ps)) if (!J.jobs[job]!.params[k]) return err(`ERROR: '${k}' n'est pas un paramètre défini pour ${job}`); return yield* runJob(c, job, ps); }
    case "console": { const j = J.jobs[rest[0] ?? ""]; const b = j?.builds[j.builds.length - 1]; return b ? ok(b.log) : err("ERROR: aucune build"); }
    case "list-jobs": return ok(Object.keys(J.jobs).join("\n"));
    case "get-job": { const j = J.jobs[rest[0] ?? ""]; return j ? ok(j.script) : err("ERROR: No such job"); }
    default: return err("Commandes : install-plugin, create-user, enable-matrix, grant, grant-job, create-job, add-param, set-trigger, link, create-node, list-nodes, build, console, list-jobs");
  }
};
