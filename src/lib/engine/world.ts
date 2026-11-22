// Modèle du monde simulé : hôtes, système de fichiers, utilisateurs, paquets, services, réseau.
export type FNode = { type: "f" | "d"; content: string; mode: number; owner: string; group: string };
export type User = { name: string; uid: number; gid: number; home: string; shell: string; password: string; expire?: string; groups: string[] };
export type Svc = { active: boolean; enabled: boolean; failed?: string };
export type Db = { databases: Set<string>; users: Record<string, string>; grants: { user: string; db: string }[] };
export type Container = { id: string; name: string; image: string; running: boolean; ports: { h: number; c: number }[]; network: string; host: Host; env: Record<string, string>; cmd: string };
export type Image = { ref: string; id: string; fs: Record<string, FNode>; pkgs: string[]; cmd: string; expose: number[]; env: Record<string, string>; workdir: string };
export type DockerD = { images: Record<string, Image>; containers: Container[]; networks: Record<string, { driver: string; subnet?: string; ipRange?: string; gateway?: string }> };
export type Host = {
  name: string; ip: string; os: "centos" | "ubuntu"; kind: "vm" | "container";
  users: Record<string, User>; groups: Record<string, { gid: number; members: string[] }>;
  fs: Record<string, FNode>; pkgs: Set<string>; svcs: Record<string, Svc>;
  crontabs: Record<string, string>; iptables: { chain: string; spec: string }[]; iptSaved: boolean;
  selinuxRuntime: string; db: Db; pg: Db; docker: DockerD; journal: Record<string, string[]>;
  extraListeners: { port: number; proc: string }[];
};

export const CREDS: Record<string, { user: string; pass: string; ip: string; desc: string }> = {
  jump_host: { user: "thor", pass: "mjolnir123", ip: "172.16.238.2", desc: "Jump host (ton poste)" },
  stapp01: { user: "tony", pass: "Ir0nM@n", ip: "172.16.238.10", desc: "App Server 1" },
  stapp02: { user: "steve", pass: "Am3ric@", ip: "172.16.238.11", desc: "App Server 2" },
  stapp03: { user: "banner", pass: "BigGr33n", ip: "172.16.238.12", desc: "App Server 3" },
  stlb01: { user: "loki", pass: "Mischi3f", ip: "172.16.238.14", desc: "Load Balancer" },
  stdb01: { user: "peter", pass: "Sp!dy", ip: "172.16.239.10", desc: "Serveur DB" },
  ststor01: { user: "natasha", pass: "Bl@kW", ip: "172.16.238.15", desc: "Serveur de stockage" },
  stbkp01: { user: "clint", pass: "H@wk3y3", ip: "172.16.238.16", desc: "Serveur de backup" },
  jenkins: { user: "jenkins", pass: "j@rv!s", ip: "172.16.238.19", desc: "Serveur Jenkins" },
};

// ---------------- Paquets ----------------
type PkgDef = { files?: Record<string, string>; dirs?: string[]; svc?: string; cmds?: string[]; users?: string[] };
export const PKGS: Record<string, PkgDef> = {
  httpd: { svc: "httpd", cmds: ["httpd", "apachectl"], dirs: ["/var/www/html", "/etc/httpd/conf.d"], users: ["apache"],
    files: { "/etc/httpd/conf/httpd.conf": "ServerRoot \"/etc/httpd\"\nListen 80\nUser apache\nGroup apache\nDocumentRoot \"/var/www/html\"\nIncludeOptional conf.d/*.conf\n" } },
  nginx: { svc: "nginx", cmds: ["nginx"], dirs: ["/usr/share/nginx/html", "/etc/nginx/conf.d"], users: ["nginx"],
    files: { "/etc/nginx/nginx.conf": "user nginx;\nworker_processes auto;\nevents {\n    worker_connections 1024;\n}\nhttp {\n    server {\n        listen 80;\n        server_name _;\n        root /usr/share/nginx/html;\n    }\n}\n", "/usr/share/nginx/html/index.html": "Welcome to nginx!\n" } },
  "php-fpm": { svc: "php-fpm", cmds: ["php-fpm", "php"], dirs: ["/var/run/php-fpm"], files: { "/etc/php-fpm.d/www.conf": "[www]\nuser = apache\ngroup = apache\nlisten = 127.0.0.1:9000\npm = dynamic\n" } },
  "mariadb-server": { svc: "mariadb", cmds: ["mysql", "mysqld"], dirs: ["/var/lib/mysql"], users: ["mysql"] },
  mariadb: { cmds: ["mysql"] },
  "postgresql-server": { svc: "postgresql", cmds: ["psql", "postgresql-setup"], dirs: ["/var/lib/pgsql/data"], users: ["postgres"] },
  postgresql: { cmds: ["psql"] },
  tomcat: { svc: "tomcat", dirs: ["/usr/share/tomcat/webapps"], users: ["tomcat"], files: { "/etc/tomcat/server.xml": "<Server port=\"8005\" shutdown=\"SHUTDOWN\">\n  <Service name=\"Catalina\">\n    <Connector port=\"8080\" protocol=\"HTTP/1.1\" connectionTimeout=\"20000\" redirectPort=\"8443\" />\n  </Service>\n</Server>\n" } },
  cronie: { svc: "crond", cmds: ["crontab"] },
  "iptables-services": { svc: "iptables", files: { "/etc/sysconfig/iptables": "" } },
  "selinux-policy": {}, "selinux-policy-targeted": {}, policycoreutils: { cmds: ["sestatus", "getenforce", "setenforce"] },
  git: { cmds: ["git"] }, "python3-pip": { cmds: ["pip3"] }, zip: { cmds: ["zip"] }, unzip: { cmds: ["unzip"] }, wget: { cmds: ["wget"] }, vim: { cmds: [] }, "vim-enhanced": {}, sendmail: { svc: "sendmail" },
  "docker-ce": { svc: "docker", cmds: ["docker", "dockerd"] }, "docker-ce-cli": {}, "containerd.io": {}, "docker-compose-plugin": {},
  "java-17-openjdk": { cmds: ["java"] }, jenkins: { svc: "jenkins", users: ["jenkins"], dirs: ["/var/lib/jenkins/secrets"], files: { "/var/lib/jenkins/secrets/initialAdminPassword": "8f3e2b1c4d5a6978e1f2a3b4c5d6e7f8\n" } },
  sshpass: { cmds: ["sshpass"] }, "openssh-clients": {}, acl: {}, samba: {},
  // Ubuntu (conteneurs)
  apache2: { svc: "apache2", cmds: ["apache2ctl"], dirs: ["/var/www/html"], files: { "/etc/apache2/ports.conf": "Listen 80\n", "/var/www/html/index.html": "Apache2 Ubuntu Default Page\n" } },
};
export const PKG_ALIASES: Record<string, string> = { "docker-ce-cli": "docker-ce", vim: "vim-enhanced", "java-11-openjdk": "java-17-openjdk", java: "java-17-openjdk", mysql: "mariadb", "mysql-server": "mariadb-server" };

// ---------------- Système de fichiers ----------------
export function norm(p: string): string {
  const parts: string[] = [];
  for (const s of p.split("/")) { if (!s || s === ".") continue; if (s === "..") parts.pop(); else parts.push(s); }
  return "/" + parts.join("/");
}
export const parent = (p: string) => norm(p + "/..");
export const base = (p: string) => p.split("/").filter(Boolean).pop() ?? "/";
export function mkdirp(h: Host, p: string, owner = "root", group = owner) {
  let cur = "";
  for (const s of norm(p).split("/").filter(Boolean)) { cur += "/" + s; if (!h.fs[cur]) h.fs[cur] = { type: "d", content: "", mode: 0o755, owner, group }; }
}
export function writeFile(h: Host, p: string, content: string, owner = "root", mode = 0o644, group = owner) {
  p = norm(p); mkdirp(h, parent(p));
  const ex = h.fs[p];
  if (ex && ex.type === "f") ex.content = content;
  else h.fs[p] = { type: "f", content, mode, owner, group };
}
export const readFile = (h: Host, p: string) => { const n = h.fs[norm(p)]; return n?.type === "f" ? n.content : undefined; };
export const isDir = (h: Host, p: string) => h.fs[norm(p)]?.type === "d";
export const children = (h: Host, p: string) => {
  const d = norm(p); const pre = d === "/" ? "/" : d + "/";
  return Object.keys(h.fs).filter((k) => k.startsWith(pre) && k !== d && !k.slice(pre.length).includes("/")).map((k) => k.slice(pre.length)).sort();
};
export function rmrf(h: Host, p: string) { const d = norm(p); for (const k of Object.keys(h.fs)) if (k === d || k.startsWith(d + "/")) delete h.fs[k]; }
export function copyTree(src: Host, sp: string, dst: Host, dp: string) {
  sp = norm(sp); dp = norm(dp);
  for (const k of Object.keys(src.fs)) if (k === sp || k.startsWith(sp + "/")) dst.fs[dp + k.slice(sp.length)] = { ...src.fs[k]! };
  mkdirp(dst, parent(dp));
}

// ---------------- Création d'hôtes ----------------
const DEFAULT_SSHD = "#Port 22\n#PermitRootLogin yes\nPasswordAuthentication yes\nPubkeyAuthentication yes\nUsePAM yes\n";
export function addUser(h: Host, name: string, opts: Partial<User> = {}) {
  const uids = Object.values(h.users).map((u) => u.uid).filter((x) => x >= 1000);
  const uid = opts.uid ?? (uids.length ? Math.max(...uids) + 1 : 1000);
  const u: User = { name, uid, gid: uid, home: `/home/${name}`, shell: "/bin/bash", password: "!", groups: [], ...opts };
  h.users[name] = u;
  h.groups[name] = { gid: u.gid, members: [] };
  return u;
}
export function makeHost(name: string, ip: string, os: "centos" | "ubuntu" = "centos", kind: "vm" | "container" = "vm"): Host {
  const h: Host = {
    name, ip, os, kind, users: {}, groups: { root: { gid: 0, members: [] }, wheel: { gid: 10, members: [] } }, fs: {}, pkgs: new Set(), svcs: {},
    crontabs: {}, iptables: [], iptSaved: false, selinuxRuntime: "enforcing", db: { databases: new Set(["mysql", "information_schema"]), users: {}, grants: [] },
    pg: { databases: new Set(["postgres"]), users: { postgres: "" }, grants: [] }, docker: { images: {}, containers: [], networks: { bridge: { driver: "bridge" }, host: { driver: "host" }, none: { driver: "null" } } },
    journal: {}, extraListeners: [],
  };
  h.users.root = { name: "root", uid: 0, gid: 0, home: "/root", shell: "/bin/bash", password: "root", groups: [] };
  for (const d of ["/root", "/home", "/tmp", "/etc", "/var/log", "/opt", "/usr/bin", "/usr/local/bin", "/usr/src", "/var/www", "/etc/ssh", "/etc/selinux"]) mkdirp(h, d);
  h.fs["/tmp"]!.mode = 0o1777;
  if (kind === "vm") {
    writeFile(h, "/etc/ssh/sshd_config", DEFAULT_SSHD, "root", 0o600);
    h.svcs.sshd = { active: true, enabled: true };
    writeFile(h, "/etc/selinux/config", "# This file controls the state of SELinux on the system.\nSELINUX=enforcing\nSELINUXTYPE=targeted\n");
    writeFile(h, "/etc/hostname", name + "\n");
    for (const p of ["openssh-clients", "selinux-policy"]) h.pkgs.add(p);
  }
  return h;
}

export type World = {
  hosts: Record<string, Host>;
  k8s: import("./k8s").K8s;
  gitea: { repos: Record<string, { owner: string; name: string; forkOf?: string }>; prs: { id: number; repo: string; head: string; base: string; title: string; reviewers: string[]; merged: boolean }[]; loggedIn?: string };
  jenkins: { plugins: Set<string>; users: Record<string, { pass: string; perms: string[] }>; jobs: Record<string, import("./misc").Job>; nodes: Record<string, { host: string; label: string; remoteFs: string; online: boolean }>; jobPerms: Record<string, Record<string, string[]>>; matrix: boolean };
  aws: { resources: Record<string, { type: string; name: string; attrs: Record<string, unknown>; id: string }> };
  meta: Record<string, unknown>;
};

export function newWorld(): World {
  const hosts: Record<string, Host> = {};
  for (const [name, c] of Object.entries(CREDS)) {
    const h = makeHost(name, c.ip);
    const u = addUser(h, c.user, { password: c.pass, groups: ["wheel"] });
    h.groups.wheel!.members.push(c.user);
    mkdirp(h, u.home, c.user);
    hosts[name] = h;
  }
  const j = hosts.jump_host!;
  for (const p of ["git", "python3-pip", "sshpass"]) j.pkgs.add(p);
  writeFile(j, "/home/thor/.bash_history", "", "thor");
  return {
    hosts,
    k8s: { objects: [], history: {} },
    gitea: { repos: { "sarah/story-blog": { owner: "sarah", name: "story-blog" } }, prs: [] },
    jenkins: { plugins: new Set(), users: { admin: { pass: "Adm!n321", perms: ["Overall/Administer"] } }, jobs: {}, nodes: {}, jobPerms: {}, matrix: false },
    aws: { resources: {} },
    meta: {},
  };
}

export function resolveHost(w: World, name: string, from?: Host): Host | undefined {
  const n = name.toLowerCase().split(".")[0]!;
  if ((n === "localhost" || n === "127") && from) return from;
  if (name === "127.0.0.1" && from) return from;
  if (w.hosts[n]) return w.hosts[n];
  return Object.values(w.hosts).find((h) => h.ip === name);
}

// installe un paquet (fichiers, service, utilisateurs système)
export function installPkg(h: Host, name: string) {
  const real = PKG_ALIASES[name] ?? name;
  const def = PKGS[real]; if (!def) return false;
  if (h.pkgs.has(real)) return true;
  h.pkgs.add(real);
  for (const d of def.dirs ?? []) mkdirp(h, d);
  for (const [p, c] of Object.entries(def.files ?? {})) if (!h.fs[p]) writeFile(h, p, c);
  for (const u of def.users ?? []) if (!h.users[u]) addUser(h, u, { uid: 900 + Object.keys(h.users).length, shell: "/sbin/nologin", home: "/var/lib/" + u });
  if (def.svc && !h.svcs[def.svc]) h.svcs[def.svc] = { active: false, enabled: false };
  if (real === "mariadb-server") { h.fs["/var/lib/mysql"]!.owner = "mysql"; h.fs["/var/lib/mysql"]!.group = "mysql"; h.pkgs.add("mariadb"); }
  if (real === "postgresql-server") h.pkgs.add("postgresql");
  if (real === "docker-ce") h.pkgs.add("docker-compose-plugin");
  return true;
}
