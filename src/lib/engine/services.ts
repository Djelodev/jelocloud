// Comportement réaliste des services : démarrage, ports, validation de configuration, HTTP.
import { type Host, type World, readFile, isDir, norm, resolveHost } from "./world";

const num = (s?: string) => (s ? Number(s) : NaN);

export function nginxCheck(h: Host): string | null {
  const c = readFile(h, "/etc/nginx/nginx.conf") ?? "";
  const all = c + (Object.keys(h.fs).filter((k) => k.startsWith("/etc/nginx/conf.d/") && k.endsWith(".conf")).map((k) => readFile(h, k)).join("\n"));
  const open = (all.match(/{/g) ?? []).length, close = (all.match(/}/g) ?? []).length;
  if (open !== close) return `nginx: [emerg] unexpected end of file, expecting "}" in /etc/nginx/nginx.conf`;
  for (const line of all.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#") && !t.endsWith("{") && !t.endsWith("}") && !t.endsWith(";")) return `nginx: [emerg] directive "${t.split(/\s+/)[0]}" is not terminated by ";" in /etc/nginx/nginx.conf`;
  }
  for (const m of all.matchAll(/ssl_certificate(?:_key)?\s+([^;]+);/g)) if (!readFile(h, m[1]!.trim())) return `nginx: [emerg] cannot load certificate "${m[1]!.trim()}": BIO_new_file() failed (SSL: error:02001002:system library:fopen:No such file or directory)`;
  for (const m of all.matchAll(/proxy_pass\s+https?:\/\/([^/;:]+)/g)) {
    const name = m[1]!;
    if (!new RegExp(`upstream\\s+${name}\\s*{`).test(all) && !/^\d|stapp|localhost/.test(name)) return `nginx: [emerg] host not found in upstream "${name}" in /etc/nginx/nginx.conf`;
  }
  return null;
}
export const nginxConf = (h: Host) => (readFile(h, "/etc/nginx/nginx.conf") ?? "") + "\n" + Object.keys(h.fs).filter((k) => k.startsWith("/etc/nginx/conf.d/") && k.endsWith(".conf")).map((k) => readFile(h, k)).join("\n");

export function svcPorts(h: Host, svc: string): number[] {
  switch (svc) {
    case "sshd": return [num(/^\s*Port\s+(\d+)/m.exec(readFile(h, "/etc/ssh/sshd_config") ?? "")?.[1]) || 22];
    case "httpd": return [...(readFile(h, "/etc/httpd/conf/httpd.conf") ?? "").matchAll(/^\s*Listen\s+(?:[\d.]+:)?(\d+)/gm)].map((m) => +m[1]!);
    case "apache2": return [...(readFile(h, "/etc/apache2/ports.conf") ?? "").matchAll(/^\s*Listen\s+(\d+)/gm)].map((m) => +m[1]!);
    case "nginx": return [...new Set([...nginxConf(h).matchAll(/^\s*listen\s+(?:[\d.]+:)?(\d+)/gm)].map((m) => +m[1]!))];
    case "tomcat": return [num(/<Connector\s+port="(\d+)"/.exec(readFile(h, "/etc/tomcat/server.xml") ?? "")?.[1]) || 8080];
    case "mariadb": return [3306];
    case "postgresql": return [5432];
    case "jenkins": return [8080];
    case "sendmail": return [num(readFile(h, "/etc/mail/port")?.trim()) || 25];
    case "php-fpm": { const l = /^\s*listen\s*=\s*(\S+)/m.exec(readFile(h, "/etc/php-fpm.d/www.conf") ?? "")?.[1] ?? ""; const p = /:(\d+)$/.exec(l); return p ? [+p[1]!] : []; }
    default: return [];
  }
}
export function listeners(h: Host): { port: number; proc: string }[] {
  const out = [...h.extraListeners];
  for (const [n, s] of Object.entries(h.svcs)) if (s.active) for (const p of svcPorts(h, n)) out.push({ port: p, proc: n });
  for (const c of h.docker.containers) if (c.running) for (const p of c.ports) out.push({ port: p.h, proc: "docker-proxy" });
  return out;
}

export function startSvc(w: World, h: Host, svc: string): string | null {
  const s = h.svcs[svc];
  if (!s) return `Failed to start ${svc}.service: Unit ${svc}.service not found.`;
  if (s.active) return null;
  const fail = (msg: string) => { s.failed = msg; (h.journal[svc] ??= []).push(msg); return `Job for ${svc}.service failed because the control process exited with error code.\nSee "systemctl status ${svc}.service" and "journalctl -xeu ${svc}.service" for details.`; };
  const mine = svcPorts(h, svc);
  for (const l of listeners(h)) if (l.proc !== svc && mine.includes(l.port)) return fail(`(98)Address already in use: AH00072: make_sock: could not bind to address 0.0.0.0:${l.port} (déjà utilisé par ${l.proc})`);
  if (svc === "nginx") { const e = nginxCheck(h); if (e) return fail(e); }
  if (svc === "mariadb") { const d = h.fs["/var/lib/mysql"]; if (!d || d.owner !== "mysql") return fail("[ERROR] mariadbd: Can't create/write to file '/var/lib/mysql/aria_log_control' (Errcode: 13 \"Permission denied\")"); }
  if (svc === "postgresql" && !readFile(h, "/var/lib/pgsql/data/PG_VERSION")) return fail(`Directory "/var/lib/pgsql/data" is missing or empty.\nUse "postgresql-setup --initdb" to initialize the database cluster.`);
  if (svc === "httpd" && mine.length === 0) return fail("AH00534: httpd: Configuration error: No MPM loaded / no Listen directive.");
  if (svc === "php-fpm") { const l = /^\s*listen\s*=\s*(\S+)/m.exec(readFile(h, "/etc/php-fpm.d/www.conf") ?? "")?.[1] ?? ""; if (l.startsWith("/") && !isDir(h, l.replace(/\/[^/]+$/, ""))) return fail(`ERROR: unable to bind listening socket for address '${l}': No such file or directory`); }
  if (svc === "sshd") s.config = readFile(h, "/etc/ssh/sshd_config") ?? "";
  s.active = true; delete s.failed;
  (h.journal[svc] ??= []).push(`Started ${svc}.service.`);
  return null;
}

// ---------------- HTTP (curl) ----------------
export type HttpRes = { ok: boolean; status: number; body: string; err?: string };
function blocked(h: Host, port: number, src: Host): boolean {
  let verdict: string | null = null;
  for (const r of h.iptables.filter((r) => r.chain === "INPUT")) {
    const p = /--dport\s+(\d+)/.exec(r.spec)?.[1]; if (p && +p !== port) continue;
    const s = /-s\s+(\S+)/.exec(r.spec)?.[1]; if (s && s.split("/")[0] !== src.ip) continue;
    verdict = /-j\s+(\S+)/.exec(r.spec)?.[1] ?? null; break;
  }
  return verdict === "DROP" || verdict === "REJECT";
}
function staticFile(h: Host, root: string, path: string): HttpRes {
  let p = norm(root + "/" + path);
  if (isDir(h, p)) p = norm(p + "/index.html");
  const c = readFile(h, p) ?? readFile(h, p.replace(/index\.html$/, "index.php"));
  return c === undefined ? { ok: true, status: 404, body: "<html><head><title>404 Not Found</title></head><body><h1>Not Found</h1></body></html>" } : { ok: true, status: 200, body: c };
}
export function http(w: World, from: Host, url: string, depth = 0): HttpRes {
  const m = /^(https?):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url.includes("://") ? url : "http://" + url);
  if (!m) return { ok: false, status: 0, body: "", err: `curl: (3) URL using bad/illegal format or missing URL` };
  const [, scheme, hostName, portS, path = "/"] = m;
  const port = portS ? +portS : scheme === "https" ? 443 : 80;
  const h = resolveHost(w, hostName!, from);
  if (!h) return { ok: false, status: 0, body: "", err: `curl: (6) Could not resolve host: ${hostName}` };
  if (h !== from && blocked(h, port, from)) return { ok: false, status: 0, body: "", err: `curl: (28) Failed to connect to ${hostName} port ${port}: Connection timed out` };
  const ls = listeners(h).find((l) => l.port === port);
  const refused = { ok: false, status: 0, body: "", err: `curl: (7) Failed to connect to ${hostName} port ${port} after 0 ms: Connection refused` };
  if (!ls) return refused;
  if (ls.proc === "docker-proxy") {
    const c = h.docker.containers.find((c) => c.running && c.ports.some((p) => p.h === port))!;
    const cp = c.ports.find((p) => p.h === port)!.c;
    return http(w, c.host, `http://localhost:${cp}${path}`, depth + 1);
  }
  switch (ls.proc) {
    case "httpd": { const root = /DocumentRoot\s+"?([^"\n]+)"?/.exec(readFile(h, "/etc/httpd/conf/httpd.conf") ?? "")?.[1] ?? "/var/www/html"; return staticFile(h, root, path); }
    case "apache2": return staticFile(h, "/var/www/html", path);
    case "tomcat": { const war = readFile(h, "/usr/share/tomcat/webapps/ROOT.war"); return war ? { ok: true, status: 200, body: war } : { ok: true, status: 404, body: "HTTP Status 404 – Not Found" }; }
    case "jenkins": return { ok: true, status: 200, body: "<title>Jenkins</title> Dashboard [Jenkins]" };
    case "nginx": {
      const conf = nginxConf(h);
      if (scheme === "https" && !new RegExp(`listen\\s+${port}\\s+ssl`).test(conf)) return { ok: false, status: 0, body: "", err: "curl: (35) error:0A00010B:SSL routines::wrong version number" };
      const up = /proxy_pass\s+http:\/\/([^/;]+)/.exec(conf)?.[1];
      if (up && depth < 3) {
        const blk = new RegExp(`upstream\\s+${up}\\s*{([^}]*)}`).exec(conf)?.[1];
        const servers = blk ? [...blk.matchAll(/server\s+([^;\s]+)/g)].map((x) => x[1]!) : [up];
        const n = ((w.meta["rr"] as number) ?? 0); w.meta["rr"] = n + 1;
        for (let i = 0; i < servers.length; i++) { const r = http(w, h, "http://" + servers[(n + i) % servers.length] + path, depth + 1); if (r.ok) return r; }
        return { ok: true, status: 502, body: "<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>" };
      }
      const root = /^\s*root\s+([^;]+);/m.exec(conf)?.[1]?.trim() ?? "/usr/share/nginx/html";
      if (path.endsWith(".php") || (/index\s+index\.php/.test(conf) && path === "/")) {
        const fp = /fastcgi_pass\s+unix:([^;]+);/.exec(conf)?.[1]?.trim();
        const fpmListen = /^\s*listen\s*=\s*(\S+)/m.exec(readFile(h, "/etc/php-fpm.d/www.conf") ?? "")?.[1];
        if (!fp || !h.svcs["php-fpm"]?.active || fpmListen !== fp) return { ok: true, status: 502, body: "<html><head><title>502 Bad Gateway</title></head><body><h1>502 Bad Gateway</h1></body></html>" };
        const r = staticFile(h, root, path.endsWith(".php") ? path : "/index.php");
        return { ...r, body: r.body.replace(/<\?php\s*echo\s*["'](.*?)["'];?\s*\?>/g, "$1").replace(/<\?php[\s\S]*?\?>/g, "") };
      }
      return staticFile(h, root, path);
    }
    default:
      if (ls.proc.startsWith("app:")) return { ok: true, status: 200, body: ls.proc.slice(4) };
      return refused;
  }
}
