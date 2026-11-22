// Docker réaliste : images, conteneurs (chacun avec son propre système), ports, réseaux, build de Dockerfile, compose.
import YAML from "yaml";
import { CMDS, type Ctx, type G, err, ok, opt } from "./types";
import { abs } from "./shell";
import { type Container, type Host, type Image, children, installPkg, isDir, makeHost, mkdirp, norm, parent, readFile, writeFile, copyTree } from "./world";
import { startSvc } from "./services";

const KNOWN = ["nginx", "httpd", "ubuntu", "busybox", "python", "mysql", "mariadb", "redis", "node", "alpine", "centos", "php", "grafana/grafana", "tomcat", "jenkins/jenkins", "postgres", "wordpress", "kodekloud/webapp-color", "debian"];
let n = 0;
const rid = () => { n++; return (Math.abs(Math.sin(n) * 1e16).toString(16) + "f3a9c2e1b7d4").slice(0, 12) + "a7c9e2f41b3d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7"; };
const ref = (s: string) => (s.includes(":") ? s : s + ":latest");
function baseImage(r: string): Image | null {
  const [name] = r.split(":"); if (!KNOWN.includes(name!)) return null;
  const fs: Image["fs"] = {}; const t = makeHost("tmp", "0.0.0.0", "ubuntu", "container");
  let cmd = "bash"; const pkgs: string[] = []; const expose: number[] = []; let workdir = "/";
  if (name === "nginx") { installPkg(t, "nginx"); writeFile(t, "/usr/share/nginx/html/index.html", "<!DOCTYPE html>\n<html><head><title>Welcome to nginx!</title></head><body><h1>Welcome to nginx!</h1></body></html>\n"); pkgs.push("nginx"); cmd = "nginx -g 'daemon off;'"; expose.push(80); }
  if (name === "httpd") { installPkg(t, "httpd"); writeFile(t, "/etc/httpd/conf/httpd.conf", 'Listen 80\nDocumentRoot "/usr/local/apache2/htdocs"\n'); writeFile(t, "/usr/local/apache2/htdocs/index.html", "<html><body><h1>It works!</h1></body></html>\n"); pkgs.push("httpd"); cmd = "httpd-foreground"; expose.push(80); }
  if (name === "python") { cmd = "python3"; workdir = "/"; }
  if (name === "mysql" || name === "mariadb") { cmd = "mysqld"; expose.push(3306); }
  if (name === "redis") { cmd = "redis-server"; expose.push(6379); }
  if (name === "tomcat") { cmd = "catalina.sh run"; expose.push(8080); }
  Object.assign(fs, t.fs);
  return { ref: r, id: rid(), fs, pkgs, cmd, expose, env: {}, workdir };
}
function getImage(h: Host, r: string, pull: boolean): Image | string {
  r = ref(r); if (h.docker.images[r]) return h.docker.images[r]!;
  if (!pull) return `Error: No such image: ${r}`;
  const b = baseImage(r); if (!b) return `Error response from daemon: pull access denied for ${r.split(":")[0]}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`;
  h.docker.images[r] = b; return b;
}
function svcFor(cmd: string): string | null {
  if (/nginx/.test(cmd)) return "nginx"; if (/apache2/.test(cmd)) return "apache2"; if (/httpd/.test(cmd)) return "httpd"; if (/python/.test(cmd)) return "python"; if (/mysqld|mariadbd/.test(cmd)) return "mysqld"; if (/redis/.test(cmd)) return "redis"; if (/catalina/.test(cmd)) return "tomcat"; if (/sleep|tail -f|bash|sh$/.test(cmd)) return "idle"; return null;
}
function boot(c: Ctx, ct: Container, img: Image, interactive: boolean): void {
  const s = svcFor(ct.cmd);
  const hh = ct.host;
  if (s === "nginx" || s === "apache2" || s === "httpd") { installPkg(hh, s); hh.svcs[s]!.active = false; const e = startSvc(c.w, hh, s); ct.running = !e; if (e) (hh.journal.main ??= []).push(e); return; }
  if (s === "python") { const file = /python3?\s+(\S+\.py)/.exec(ct.cmd)?.[1]; const src = file ? readFile(hh, norm((img.workdir || "/") + "/" + file)) ?? readFile(hh, file) : undefined; if (!src) { ct.running = interactive; if (file) (hh.journal.main ??= []).push(`python3: can't open file '${file}': [Errno 2] No such file or directory`); return; } const port = +(/port\s*=\s*(\d+)/.exec(src)?.[1] ?? 5000); const msg = /return\s+["'](.+?)["']/.exec(src)?.[1] ?? "Hello"; hh.extraListeners = [{ port, proc: "app:" + msg }]; ct.running = true; (hh.journal.main ??= []).push(` * Running on http://0.0.0.0:${port}`); return; }
  if (s === "mysqld") { if (!ct.env.MYSQL_ROOT_PASSWORD && !ct.env.MYSQL_ALLOW_EMPTY_PASSWORD && !ct.env.MARIADB_ROOT_PASSWORD) { ct.running = false; (hh.journal.main ??= []).push("error: database is uninitialized and password option is not specified\n  You need to specify one of MYSQL_ROOT_PASSWORD, MYSQL_ALLOW_EMPTY_PASSWORD and MYSQL_RANDOM_ROOT_PASSWORD"); return; } hh.extraListeners = [{ port: 3306, proc: "mysqld" }]; ct.running = true; return; }
  if (s === "redis" || s === "tomcat") { hh.extraListeners = [{ port: s === "redis" ? 6379 : 8080, proc: s }]; ct.running = true; return; }
  ct.running = interactive || /sleep|tail -f/.test(ct.cmd);
}
function makeContainer(c: Ctx, img: Image, o: { name?: string; ports: { h: number; c: number }[]; network: string; env: Record<string, string>; cmd?: string; vols: [string, string][]; interactive: boolean }): Container | string {
  const h = c.h; const d = h.docker;
  const name = o.name ?? ["quirky_turing", "eager_hopper", "zen_lovelace", "brave_curie"][d.containers.length % 4]! + d.containers.length;
  if (d.containers.some((x) => x.name === name)) return `docker: Error response from daemon: Conflict. The container name "/${name}" is already in use by container "${d.containers.find((x) => x.name === name)!.id}". You have to remove (or rename) that container to be able to reuse that name.`;
  if (!d.networks[o.network]) return `docker: Error response from daemon: network ${o.network} not found.`;
  for (const p of o.ports) { if (d.containers.some((x) => x.running && x.ports.some((q) => q.h === p.h)) || Object.values(h.svcs).some(() => false)) return `docker: Error response from daemon: driver failed programming external connectivity on endpoint ${name}: Bind for 0.0.0.0:${p.h} failed: port is already allocated.`; }
  const id = rid(); const hh = makeHost(id.slice(0, 12), "172.17.0." + (d.containers.length + 2), "ubuntu", "container");
  Object.assign(hh.fs, structuredClone(img.fs)); for (const p of img.pkgs) hh.pkgs.add(p);
  for (const p of img.pkgs) { const def = p === "nginx" ? "nginx" : p; if (!hh.svcs[def] && ["nginx", "httpd", "apache2"].includes(def)) hh.svcs[def] = { active: false, enabled: false }; }
  for (const [hp, cp] of o.vols) { if (h.fs[hp]) copyTree(h, hp, hh, cp); else mkdirp(hh, cp); }
  const ct: Container = { id, name, image: img.ref, running: false, ports: o.ports, network: o.network, host: hh, env: { ...img.env, ...o.env }, cmd: o.cmd ?? img.cmd };
  boot(c, ct, img, o.interactive);
  d.containers.push(ct); return ct;
}
const findC = (h: Host, x: string) => h.docker.containers.find((c) => c.name === x || c.id.startsWith(x));
function parseRun(a: string[]) {
  const o = { name: undefined as string | undefined, ports: [] as { h: number; c: number }[], network: "bridge", env: {} as Record<string, string>, vols: [] as [string, string][], detach: false, interactive: false, rm: false };
  let i = 0;
  for (; i < a.length; i++) {
    const x = a[i]!; if (!x.startsWith("-")) break;
    const val = () => (x.includes("=") ? x.split("=").slice(1).join("=") : a[++i] ?? "");
    if (x === "--name" || x.startsWith("--name=")) o.name = val();
    else if (x === "-p" || x === "--publish") { const [hp, cp] = val().split(":"); o.ports.push({ h: +hp!, c: +(cp ?? hp)! }); }
    else if (x === "-e" || x === "--env") { const [k, ...v] = val().split("="); o.env[k!] = v.join("="); }
    else if (x === "-v" || x === "--volume") { const [hp, cp] = val().split(":"); o.vols.push([hp!, cp!]); }
    else if (x === "--network" || x === "--net" || x.startsWith("--network=")) o.network = val();
    else if (x === "--rm") o.rm = true;
    else if (/^-[dit]+$/.test(x)) { if (x.includes("d")) o.detach = true; if (x.includes("i") || x.includes("t")) o.interactive = true; }
    else if (x === "--detach") o.detach = true; else if (x === "-w" || x === "--workdir" || x === "--restart" || x === "-h" || x === "--hostname") i++;
  }
  return { o, image: a[i], cmd: a.slice(i + 1).join(" ") };
}
function* build(c: Ctx, tag: string, ctxDir: string, file: string): G {
  const h = c.h; const df = readFile(h, file); if (df === undefined) return err(`ERROR: failed to solve: failed to read dockerfile: open ${file.split("/").pop()}: no such file or directory`);
  const lines: string[] = []; let buf = "";
  for (const raw of df.split("\n")) { const l = raw.trim(); if (!l || l.startsWith("#")) continue; if (l.endsWith("\\")) { buf += l.slice(0, -1) + " "; continue; } lines.push(buf + l); buf = ""; }
  const log: string[] = [`[+] Building 3.2s (${lines.length + 1}/${lines.length + 1}) FINISHED`, ` => [internal] load build definition from ${file.split("/").pop()}`];
  let img: Image | undefined; let tmp: Host | undefined;
  const VALID = ["FROM", "RUN", "CMD", "COPY", "ADD", "EXPOSE", "ENV", "WORKDIR", "ENTRYPOINT", "LABEL", "USER", "ARG", "VOLUME"];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!; const sp = l.indexOf(" "); const ins = (sp < 0 ? l : l.slice(0, sp)).toUpperCase(); const arg = sp < 0 ? "" : l.slice(sp + 1).trim();
    if (!VALID.includes(ins)) return err(`ERROR: failed to solve: dockerfile parse error on line ${i + 1}: unknown instruction: ${l.slice(0, sp < 0 ? undefined : sp)}`);
    if (!img && ins !== "FROM" && ins !== "ARG") return err(`ERROR: failed to solve: no build stage in current context (la 1re instruction doit être FROM)`);
    log.push(` => [${i + 1}/${lines.length}] ${ins} ${arg}`);
    if (ins === "FROM") { const b = getImage(h, arg.split(/\s+/)[0]!, true); if (typeof b === "string") return err(`ERROR: failed to solve: ${arg}: ${b}`); img = { ...structuredClone({ ...b, fs: b.fs }), ref: tag, id: rid(), pkgs: [...b.pkgs], expose: [...b.expose], env: { ...b.env } }; tmp = makeHost("build", "0.0.0.0", "ubuntu", "container"); tmp.fs = structuredClone(b.fs); for (const p of b.pkgs) tmp.pkgs.add(p); continue; }
    const t = tmp!; const im = img!;
    if (ins === "RUN") {
      const cmd = arg.startsWith("[") ? (JSON.parse(arg) as string[]).join(" ") : arg;
      const r = yield* c.sh.run(cmd, { host: t, user: "root", cwd: im.workdir, env: { ...im.env }, batch: true, container: { id: "build", name: "build", image: tag, running: true, ports: [], network: "bridge", host: t, env: {}, cmd: "" } });
      if (r.out) log.push(r.out.split("\n").slice(-3).map((x) => "#" + (i + 1) + " " + x).join("\n"));
      if (r.code !== 0) return err(log.join("\n") + `\nERROR: failed to solve: process "/bin/sh -c ${cmd}" did not complete successfully: exit code: ${r.code}`);
    } else if (ins === "COPY" || ins === "ADD") { const parts = arg.split(/\s+/); const dst = parts.pop()!; for (const s of parts) { const sp2 = norm(ctxDir + "/" + s); if (!h.fs[sp2]) return err(`ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref: "/${s}": not found`); const target = dst.endsWith("/") || isDir(t, dst) ? norm((dst.startsWith("/") ? dst : im.workdir + "/" + dst) + "/" + (isDir(h, sp2) && s === "." ? "" : s.split("/").pop())) : norm(dst.startsWith("/") ? dst : im.workdir + "/" + dst); if (isDir(h, sp2)) { for (const ch of children(h, sp2)) copyTree(h, sp2 + "/" + ch, t, norm(target + "/" + ch)); } else copyTree(h, sp2, t, target); } }
    else if (ins === "WORKDIR") { im.workdir = norm(arg.startsWith("/") ? arg : im.workdir + "/" + arg); mkdirp(t, im.workdir); }
    else if (ins === "ENV") { const [k, ...v] = arg.includes("=") ? arg.split("=") : arg.split(/\s+/); im.env[k!] = v.join(" ").replace(/^["']|["']$/g, ""); }
    else if (ins === "EXPOSE") im.expose.push(...arg.split(/\s+/).map((x) => parseInt(x)));
    else if (ins === "CMD" || ins === "ENTRYPOINT") { try { im.cmd = arg.startsWith("[") ? (JSON.parse(arg) as string[]).join(" ") : arg; } catch { return err(`ERROR: failed to solve: dockerfile parse error on line ${i + 1}: invalid JSON in ${ins}`); } }
  }
  if (!img || !tmp) return err("ERROR: failed to solve: the Dockerfile cannot be empty");
  img.fs = tmp.fs; img.pkgs = [...tmp.pkgs]; h.docker.images[ref(tag)] = img;
  log.push(` => exporting to image`, ` => => naming to docker.io/library/${ref(tag)}`);
  return ok(log.join("\n"));
}
function table(rows: string[][]) { const w = rows[0]!.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)) + 3); return rows.map((r) => r.map((x, i) => x.padEnd(w[i]!)).join("").trimEnd()).join("\n"); }
function* compose(c: Ctx, a: string[]): G {
  const file = opt(a, "-f") ?? ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].find((f) => readFile(c.h, abs(c.f, f)) !== undefined);
  const sub = a.filter((x, i) => !x.startsWith("-") && a[i - 1] !== "-f")[0];
  if (!file) return err("no configuration file provided: not found");
  const path = abs(c.f, file); const dir = parent(path);
  let doc: { services?: Record<string, { image?: string; build?: string | { context: string }; container_name?: string; ports?: (string | number)[]; volumes?: string[]; environment?: Record<string, string> | string[]; command?: string }> };
  try { doc = YAML.parse(readFile(c.h, path) ?? "") ?? {}; } catch (e) { return err(`yaml: ${(e as Error).message.split("\n")[0]}`); }
  if (!doc.services) return err(`services must be a mapping`);
  const project = dir.split("/").pop()!;
  if (sub === "down") { const names = Object.entries(doc.services).map(([k, s]) => s.container_name ?? `${project}-${k}-1`); c.h.docker.containers = c.h.docker.containers.filter((x) => !names.includes(x.name)); return ok(names.map((n) => ` ✔ Container ${n}  Removed`).join("\n")); }
  if (sub === "ps") return CMDS.docker!(c, ["ps"]).next().value as never;
  if (sub !== "up") return err(`unknown docker compose command: ${sub}`);
  const out: string[] = [];
  for (const [k, s] of Object.entries(doc.services)) {
    let imgRef = s.image;
    if (s.build) { const ctxd = norm(dir + "/" + (typeof s.build === "string" ? s.build : s.build.context)); imgRef = imgRef ?? `${project}-${k}`; const r = yield* build(c, imgRef, ctxd, ctxd + "/Dockerfile"); if (r.code) return r; }
    if (!imgRef) return err(`service "${k}" has neither an image nor a build context specified: invalid compose project`);
    const img = getImage(c.h, imgRef, true); if (typeof img === "string") return err(img);
    const name = s.container_name ?? `${project}-${k}-1`;
    c.h.docker.containers = c.h.docker.containers.filter((x) => x.name !== name);
    const env = Array.isArray(s.environment) ? Object.fromEntries(s.environment.map((e) => e.split("="))) : s.environment ?? {};
    const ct = makeContainer(c, img, { name, ports: (s.ports ?? []).map((p) => { const [h2, c2] = String(p).split(":"); return { h: +h2!, c: +(c2 ?? h2)! }; }), network: "bridge", env, ...(s.command ? { cmd: s.command } : {}), vols: (s.volumes ?? []).map((v) => { const [hp, cp] = v.split(":"); return [norm(hp!.startsWith("/") ? hp! : dir + "/" + hp), cp!] as [string, string]; }), interactive: false });
    if (typeof ct === "string") return err(ct);
    out.push(` ✔ Container ${name}  ${ct.running ? "Started" : "Exited"}`);
  }
  return ok(`[+] Running ${out.length}/${out.length}\n${out.join("\n")}`);
}
CMDS["docker-compose"] = function* (c, a) { return yield* CMDS.docker!(c, ["compose", ...a]); };
CMDS.docker = function* (c, a) {
  const h = c.h; const d = h.docker; const [sub, ...rest] = a;
  if (!sub || sub === "--version") return ok("Docker version 27.3.1, build ce12230");
  if (!h.svcs.docker?.active) return err("Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?");
  if (!c.root && !h.groups.docker?.members.includes(c.user)) return err(`permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/${sub}": dial unix /var/run/docker.sock: connect: permission denied`);
  const pos = rest.filter((x) => !x.startsWith("-"));
  switch (sub) {
    case "version": case "info": return ok("Client: Docker Engine - Community\n Version:           27.3.1\nServer: Docker Engine - Community\n Engine:\n  Version:          27.3.1\n  OS/Arch:          linux/amd64");
    case "compose": return yield* compose(c, rest);
    case "images": return ok(table([["REPOSITORY", "TAG", "IMAGE ID", "CREATED", "SIZE"], ...Object.values(d.images).map((i) => [i.ref.split(":")[0]!, i.ref.split(":")[1]!, i.id.slice(0, 12), "2 minutes ago", "187MB"])]));
    case "pull": { const r = pos[0]; if (!r) return err('"docker pull" requires exactly 1 argument.'); const had = !!d.images[ref(r)]; const i = getImage(h, r, true); if (typeof i === "string") return err(i); return ok(had ? `${ref(r).split(":")[1]}: Pulling from library/${r.split(":")[0]}\nStatus: Image is up to date for ${ref(r)}` : `${ref(r).split(":")[1]}: Pulling from library/${r.split(":")[0]}\n2d429b9e73a6: Pull complete\nDigest: sha256:${i.id}\nStatus: Downloaded newer image for ${ref(r)}\ndocker.io/library/${ref(r)}`); }
    case "tag": { const [s, t] = pos; if (!s || !t) return err('"docker tag" requires exactly 2 arguments.'); const i = d.images[ref(s)]; if (!i) return err(`Error response from daemon: No such image: ${ref(s)}`); d.images[ref(t)] = { ...i, ref: ref(t) }; return ok(); }
    case "rmi": { for (const r of pos) { if (!d.images[ref(r)]) return err(`Error response from daemon: No such image: ${ref(r)}`); if (d.containers.some((x) => x.image === ref(r)) && !rest.includes("-f")) return err(`Error response from daemon: conflict: unable to remove repository reference "${r}" - container is using its referenced image`); delete d.images[ref(r)]; } return ok(pos.map((p) => `Untagged: ${ref(p)}`).join("\n")); }
    case "run": case "create": {
      const { o, image, cmd } = parseRun(rest); if (!image) return err('"docker run" requires at least 1 argument.');
      const had = !!d.images[ref(image)]; const img = getImage(h, image, true); if (typeof img === "string") return err(`Unable to find image '${ref(image)}' locally\ndocker: ${img}`);
      const ct = makeContainer(c, img, { ...(o.name ? { name: o.name } : {}), ports: o.ports, network: o.network, env: o.env, ...(cmd ? { cmd } : {}), vols: o.vols.map(([hp, cp]) => [abs(c.f, hp), cp]), interactive: o.interactive });
      if (typeof ct === "string") return err(ct);
      if (sub === "create") ct.running = false;
      if (o.rm && !ct.running) d.containers.splice(d.containers.indexOf(ct), 1);
      const pre = had ? "" : `Unable to find image '${ref(image)}' locally\n${ref(image).split(":")[1]}: Pulling from library/${image.split(":")[0]}\nStatus: Downloaded newer image for ${ref(image)}\n`;
      if (!o.detach && o.interactive && ct.running) { c.sh.stack.push({ host: ct.host, user: "root", cwd: "/", env: {}, container: ct }); return ok(pre.trimEnd()); }
      if (!o.detach) { const out = (ct.host.journal.main ?? []).join("\n") || (/^echo\s/.test(ct.cmd) ? ct.cmd.slice(5).replace(/['"]/g, "") : ""); return ok(pre + out); }
      return ok(pre + ct.id);
    }
    case "ps": { const all = rest.includes("-a") || rest.includes("--all"); const rows = d.containers.filter((x) => all || x.running).map((x) => [x.id.slice(0, 12), x.image.replace(/:latest$/, ""), `"${x.cmd.slice(0, 18)}…"`, "2 minutes ago", x.running ? "Up 2 minutes" : "Exited (1) 1 minute ago", x.ports.map((p) => `0.0.0.0:${p.h}->${p.c}/tcp`).join(", "), x.name]); return ok(table([["CONTAINER ID", "IMAGE", "COMMAND", "CREATED", "STATUS", "PORTS", "NAMES"], ...rows])); }
    case "stop": case "kill": { for (const x of pos) { const ct = findC(h, x); if (!ct) return err(`Error response from daemon: No such container: ${x}`); ct.running = false; } return ok(pos.join("\n")); }
    case "start": case "restart": { for (const x of pos) { const ct = findC(h, x); if (!ct) return err(`Error response from daemon: No such container: ${x}`); for (const s of Object.keys(ct.host.svcs)) ct.host.svcs[s]!.active = false; const img = d.images[ct.image] ?? ({ workdir: "/" } as Image); boot(c, ct, img, true); if (!ct.running) return err(`Error response from daemon: container ${x} exited: ${(ct.host.journal.main ?? []).slice(-1)[0] ?? ""}`); } return ok(pos.join("\n")); }
    case "rm": { for (const x of pos) { const ct = findC(h, x); if (!ct) return err(`Error response from daemon: No such container: ${x}`); if (ct.running && !rest.includes("-f")) return err(`Error response from daemon: cannot remove container "/${ct.name}": container is running: stop the container before removing or force remove`); d.containers.splice(d.containers.indexOf(ct), 1); } return ok(pos.join("\n")); }
    case "logs": { const ct = findC(h, pos[0] ?? ""); if (!ct) return err(`Error response from daemon: No such container: ${pos[0]}`); return ok((ct.host.journal.main ?? []).join("\n") || (ct.host.svcs.nginx?.active ? '/docker-entrypoint.sh: Configuration complete; ready for start up' : "")); }
    case "inspect": { const x = pos[0] ?? ""; const ct = findC(h, x); if (ct) return ok(JSON.stringify([{ Id: ct.id, Name: "/" + ct.name, State: { Status: ct.running ? "running" : "exited", Running: ct.running }, Config: { Image: ct.image, Env: Object.entries(ct.env).map(([k, v]) => `${k}=${v}`), Cmd: ct.cmd.split(" ") }, NetworkSettings: { Networks: { [ct.network]: { IPAddress: ct.host.ip } }, Ports: Object.fromEntries(ct.ports.map((p) => [`${p.c}/tcp`, [{ HostIp: "0.0.0.0", HostPort: String(p.h) }]])) } }], null, 2)); const nw = d.networks[x]; if (nw) return ok(JSON.stringify([{ Name: x, Driver: nw.driver, IPAM: { Config: [{ Subnet: nw.subnet, IPRange: nw.ipRange, Gateway: nw.gateway }] }, Containers: Object.fromEntries(d.containers.filter((q) => q.network === x).map((q) => [q.id, { Name: q.name }])) }], null, 2)); const im = d.images[ref(x)]; if (im) return ok(JSON.stringify([{ Id: "sha256:" + im.id, RepoTags: [im.ref], Config: { Cmd: im.cmd.split(" "), ExposedPorts: Object.fromEntries(im.expose.map((p) => [`${p}/tcp`, {}])), WorkingDir: im.workdir } }], null, 2)); return err(`Error: No such object: ${x}`); }
    case "cp": {
      const [s, t] = pos; if (!s || !t) return err('"docker cp" requires exactly 2 arguments.');
      if (t.includes(":")) { const [cn, cp] = t.split(":"); const ct = findC(h, cn!); if (!ct) return err(`Error response from daemon: No such container: ${cn}`); const sp = abs(c.f, s); if (!h.fs[sp]) return err(`lstat ${sp}: no such file or directory`); let dst = norm(cp!); if (isDir(ct.host, dst)) dst = norm(dst + "/" + sp.split("/").pop()); else if (!isDir(ct.host, parent(dst))) return err(`Error response from daemon: Could not find the file ${parent(dst)} in container ${cn}`); copyTree(h, sp, ct.host, dst); return ok(`Successfully copied 2.05kB to ${cn}:${cp}`); }
      if (s.includes(":")) { const [cn, cp] = s.split(":"); const ct = findC(h, cn!); if (!ct) return err(`Error response from daemon: No such container: ${cn}`); if (!ct.host.fs[norm(cp!)]) return err(`Error response from daemon: Could not find the file ${cp} in container ${cn}`); let dst = abs(c.f, t); if (isDir(h, dst)) dst = norm(dst + "/" + cp!.split("/").pop()); copyTree(ct.host, norm(cp!), h, dst); return ok(`Successfully copied to ${t}`); }
      return err("must specify at least one container source");
    }
    case "exec": {
      let i = 0; const it = []; while (rest[i]?.startsWith("-")) { it.push(rest[i]); if (rest[i] === "-u" || rest[i] === "-w" || rest[i] === "-e") i++; i++; }
      const cn = rest[i]; const cmd = rest.slice(i + 1); const ct = cn ? findC(h, cn) : undefined;
      if (!ct) return err(`Error response from daemon: No such container: ${cn}`);
      if (!ct.running) return err(`Error response from daemon: container ${ct.id} is not running`);
      if (!cmd.length) return err('"docker exec" requires at least 2 arguments.');
      if (["bash", "sh", "/bin/bash", "/bin/sh"].includes(cmd[0]!) && cmd.length === 1) { if (!it.some((x) => /i/.test(x!))) return ok(); c.sh.stack.push({ host: ct.host, user: "root", cwd: "/", env: {}, container: ct }); return ok(); }
      const line = cmd[0] === "bash" || cmd[0] === "sh" ? (cmd[1] === "-c" ? cmd.slice(2).join(" ") : cmd.join(" ")) : cmd.join(" ");
      return yield* c.sh.run(line, { host: ct.host, user: "root", cwd: "/", env: {}, container: ct, batch: true });
    }
    case "commit": { const [cn, t] = pos; const ct = cn ? findC(h, cn) : undefined; if (!ct) return err(`Error response from daemon: No such container: ${cn}`); if (!t) return err("usage: docker commit CONTAINER [REPOSITORY[:TAG]]"); const base = d.images[ct.image]; const im: Image = { ref: ref(t), id: rid(), fs: structuredClone(ct.host.fs), pkgs: [...ct.host.pkgs], cmd: ct.cmd, expose: base?.expose ?? [], env: { ...ct.env }, workdir: base?.workdir ?? "/" }; d.images[ref(t)] = im; return ok("sha256:" + im.id); }
    case "build": {
      const t = opt(rest, "-t", "--tag"); const fileOpt = opt(rest, "-f", "--file"); const dirArg = rest.filter((x, j) => !x.startsWith("-") && !["-t", "--tag", "-f", "--file"].includes(rest[j - 1] ?? ""))[0];
      if (!dirArg) return err('ERROR: "docker buildx build" requires exactly 1 argument.');
      const dir = abs(c.f, dirArg); if (!isDir(h, dir)) return err(`ERROR: unable to prepare context: path "${dirArg}" not found`);
      return yield* build(c, t ?? "<none>:latest", dir, fileOpt ? abs(c.f, fileOpt) : dir + "/Dockerfile");
    }
    case "network": {
      const [act, ...r2] = rest; const p2 = r2.filter((x, j) => !x.startsWith("-") && !["-d", "--driver", "--subnet", "--ip-range", "--gateway"].includes(r2[j - 1] ?? ""));
      if (act === "ls") return ok(table([["NETWORK ID", "NAME", "DRIVER", "SCOPE"], ...Object.entries(d.networks).map(([k, v]) => [k.length.toString(16).padStart(12, "a"), k, v.driver, "local"])]));
      if (act === "create") { const nm = p2[0]; if (!nm) return err('"docker network create" requires exactly 1 argument.'); if (d.networks[nm]) return err(`Error response from daemon: network with name ${nm} already exists`); const drv = opt(r2, "-d", "--driver") ?? "bridge"; if (!["bridge", "macvlan", "overlay", "ipvlan", "host"].includes(drv)) return err(`Error response from daemon: plugin "${drv}" not found`); const sub2 = opt(r2, "--subnet"); const ipr = opt(r2, "--ip-range"); const gw = opt(r2, "--gateway"); d.networks[nm] = { driver: drv, ...(sub2 ? { subnet: sub2 } : {}), ...(ipr ? { ipRange: ipr } : {}), ...(gw ? { gateway: gw } : {}) }; return ok(rid()); }
      if (act === "rm") { delete d.networks[p2[0] ?? ""]; return ok(p2[0]); }
      if (act === "connect") { const ct = findC(h, p2[1] ?? ""); if (!ct || !d.networks[p2[0] ?? ""]) return err("Error response from daemon: No such container or network"); ct.network = p2[0]!; return ok(); }
      if (act === "inspect") return yield* CMDS.docker!(c, ["inspect", p2[0] ?? ""]);
      return err(`docker network: '${act}' is not a docker command.`);
    }
    default: return err(`docker: '${sub}' is not a docker command.\nSee 'docker --help'`);
  }
};
