import { parse } from "yaml";
import { startSvc } from "./services";
import { abs, canWrite, tokenize } from "./shell";
import { CMDS, type Ctx, type Frame, type G, err, ok, opt } from "./types";
import { addUser, installPkg, isDir, mkdirp, parent, readFile, resolveHost, rmrf, writeFile } from "./world";

type Vars = Record<string, unknown>;
type Entry = { alias: string; groups: Set<string>; vars: Vars };
type Task = Vars & { name?: string; when?: string; become?: boolean; vars?: Vars };
type Play = { hosts: string | string[]; become?: boolean; vars?: Vars; roles?: (string | { role: string; vars?: Vars })[]; tasks?: Task[] };
const entries = (words: string[]) => Object.fromEntries(words.flatMap((word) => {
  const at = word.indexOf("=");
  return at < 1 ? [] : [[word.slice(0, at), word.slice(at + 1)]];
}));
const words = (line: string) => {
  const result = tokenize(line, {});
  if (typeof result === "string") throw new Error(result);
  return result.map((token) => token.v);
};
export function inventory(text: string) {
  const hosts = new Map<string, Entry>();
  const groupVars = new Map<string, Vars>();
  const children = new Map<string, string[]>();
  let group = "ungrouped";
  let section = "hosts";
  for (const line of text.split(/\r?\n/).map((v) => v.trim())) {
    if (!line || /^[#;]/.test(line)) continue;
    const header = /^\[([^\]:]+)(?::(vars|children))?\]$/.exec(line);
    if (header) { group = header[1]!; section = header[2] ?? "hosts"; continue; }
    if (section === "vars") {
      const at = line.indexOf("=");
      if (at < 1) throw new Error(`invalid inventory variable: ${line}`);
      groupVars.set(group, { ...groupVars.get(group), [line.slice(0, at).trim()]: line.slice(at + 1).trim() });
      continue;
    }
    if (section === "children") { children.set(group, [...children.get(group) ?? [], line]); continue; }
    const [alias, ...args] = words(line);
    if (!alias) continue;
    const entry = hosts.get(alias) ?? { alias, groups: new Set(["all"]), vars: {} };
    entry.groups.add(group);
    Object.assign(entry.vars, entries(args));
    hosts.set(alias, entry);
  }
  for (const entry of hosts.values()) {
    for (let size = -1; size !== entry.groups.size;) {
      size = entry.groups.size;
      for (const [groupName, nested] of children) {
        if (nested.some((name) => entry.groups.has(name))) entry.groups.add(groupName);
      }
    }
    entry.vars = Object.assign({}, ...[...entry.groups].map((name) => groupVars.get(name)), entry.vars);
  }
  return [...hosts.values()];
}

const pick = (items: Entry[], pattern: string | string[]) => items.filter((e) =>
  (Array.isArray(pattern) ? pattern : pattern.split(/[:,]/)).some((p) => p === "*" || e.alias === p || e.groups.has(p)));
const yes = (v: unknown) => v === true || ["yes", "true", "1"].includes(String(v));
const str = (v: unknown) => v === undefined || v === null ? "" : String(v);
const render = (value: string, vars: Vars) => value.replace(/{{\s*(\w+)\s*}}/g, (_, name: string) => {
  if (!Object.hasOwn(vars, name)) throw new Error(`'${name}' is undefined`);
  return str(vars[name]);
});
function condition(rule: string, vars: Vars) {
  const match = /^(\w+)\s*(==|!=)\s*(['"])(.*?)\3$/.exec(rule.trim());
  if (!match || !Object.hasOwn(vars, match[1]!)) throw new Error(`unsupported condition: ${rule}`);
  return (str(vars[match[1]!]) === match[4]) === (match[2] === "==");
}

function remote(c: Ctx, entry: Entry) {
  const h = resolveHost(c.w, str(entry.vars["ansible_host"]) || entry.alias, c.h);
  const user = str(entry.vars["ansible_user"]) || c.user;
  const u = h?.users[user];
  const pass = entry.vars["ansible_ssh_pass"] ?? entry.vars["ansible_password"];
  if (!h?.svcs["sshd"]?.active || !u || pass !== u.password || /nologin|false/.test(u.shell)) return;
  return { h, u };
}

function* task(c: Ctx, e: Entry, name: string, options: unknown, become: boolean, vars: Vars, dir: string, roleDir?: string): G {
  const target = remote(c, e);
  if (!target) return err("Failed to connect to the host via ssh: Permission denied", 255);
  const { h, u } = target;
  if (become && u.name !== "root" && !h.groups["wheel"]?.members.includes(u.name)) return err("Missing sudo permissions");
  const user = become ? "root" : u.name;
  const frame: Frame = { host: h, user, cwd: h.users[user]!.home, env: {}, batch: true };
  const ctx = c.sh.ctx(frame, "");
  const args = typeof options === "string"
    ? name === "shell" || name === "command" ? { cmd: options } : entries(words(options))
    : (options ?? {}) as Vars;
  const value = (key: string) => render(str(args[key]), vars);
  const state = value("state");
  if (name === "ping") return ok("pong");
  if (["yum", "package", "apt"].includes(name)) {
    if (!ctx.root) return err("This command has to be run with superuser privileges");
    const pkg = value("name");
    if (state === "absent") return ok(h.pkgs.delete(pkg) ? "changed" : "");
    const had = h.pkgs.has(pkg);
    return installPkg(h, pkg) ? ok(had ? "" : "changed") : err(`No package ${pkg} available`);
  }
  if (name === "service" || name === "systemd") {
    if (!ctx.root) return err("Access denied");
    const svc = value("name");
    const old = h.svcs[svc];
    if (!old) return err(`Could not find the requested service ${svc}`);
    const active = old.active;
    const enabled = old.enabled;
    if (state === "started" || state === "restarted") {
      const failure = startSvc(c.w, h, svc);
      if (failure) return err(failure);
    }
    if (state === "stopped") old.active = false;
    if ("enabled" in args) old.enabled = yes(args["enabled"]);
    return ok(active !== old.active || enabled !== old.enabled || state === "restarted" ? "changed" : "");
  }
  if (name === "user") {
    if (!ctx.root) return err("Permission denied");
    const targetName = value("name");
    if (!targetName) return err("name is required");
    const existing = h.users[targetName];
    if (state === "absent") {
      if (!existing) return ok();
      delete h.users[targetName];
      return ok("changed");
    }
    const shell = value("shell");
    if (existing && (!shell || existing.shell === shell)) return ok();
    const account = existing ?? addUser(h, targetName);
    if (shell) account.shell = shell;
    return ok("changed");
  }
  if (name === "shell" || name === "command") return yield* c.sh.run(value("cmd"), frame);
  if (!["file", "copy", "template", "blockinfile", "lineinfile", "acl"].includes(name)) return err(`couldn't resolve module/action '${name}'`);
  const destination = value("dest") || value("path");
  if (!destination) return err("path is required");
  const path = abs(frame, destination);
  const old = h.fs[path];
  if (!canWrite(ctx, path)) return err(`Permission denied: ${path}`);
  const owner = value("owner");
  const group = value("group");
  const mode = value("mode");
  if (mode && !/^[0-7]{3,4}$/.test(mode)) return err(`invalid mode: ${mode}`);
  if ((!ctx.root && owner && owner !== user) || (owner && !h.users[owner]) || (group && !h.groups[group])) return err("invalid owner or group");
  if (name === "acl") {
    if (!old) return err(`path not found: ${path}`);
    if (!h.pkgs.has("acl")) return err("setfacl executable not found");
    const key = `${value("etype")}:${value("entity")}`;
    const acl = (old.acl ??= {});
    if (state === "absent") {
      const changed = key in acl;
      delete acl[key];
      return ok(changed ? "changed" : "");
    }
    const permissions = value("permissions");
    const changed = acl[key] !== permissions;
    acl[key] = permissions;
    return ok(changed ? "changed" : "");
  }
  if (name === "file" && state === "absent") {
    if (old) rmrf(h, path);
    return ok(old ? "changed" : "");
  }
  const before = JSON.stringify(old);
  if (name === "file" && state === "directory") {
    if (old?.type === "f") return err(`file exists: ${path}`);
    mkdirp(h, path, user);
  } else {
    if (old?.type === "d" || !isDir(h, parent(path))) return err(`invalid destination: ${path}`);
    let content = old?.content ?? "";
    if (name === "file" && state !== "touch" && !old) return err(`file not found: ${path}`);
    if (name === "copy" || name === "template") {
      const src = value("src");
      const sourcePath = src.startsWith("/") ? src : `${roleDir ? roleDir + (name === "template" ? "/templates" : "/files") : dir}/${src}`;
      const found = src ? readFile(c.h, sourcePath) : "content" in args ? value("content") : undefined;
      if (found === undefined) return err(`Could not find or access '${src}'`);
      content = name === "template" ? render(found, vars) : found;
    }
    if (name === "lineinfile" || name === "blockinfile") {
      if (!old && !yes(args["create"])) return err(`Destination ${path} does not exist`);
      const lines = content ? content.replace(/\n$/, "").split("\n") : [];
      if (name === "lineinfile") {
        const line = value("line");
        const regex = value("regexp");
        const re = regex ? new RegExp(regex) : undefined;
        const matches = (item: string) => re ? re.test(item) : item === line;
        const last = lines.map(matches).lastIndexOf(true);
        if (state === "absent") content = lines.filter((item) => !matches(item)).join("\n");
        else { if (last >= 0) lines[last] = line; else lines.push(line); content = lines.join("\n"); }
      } else {
        const marker = value("marker") || "# {mark} ANSIBLE MANAGED BLOCK";
        const begin = marker.replace("{mark}", "BEGIN");
        const end = marker.replace("{mark}", "END");
        const first = lines.indexOf(begin);
        const last = lines.indexOf(end, first + 1);
        const block = value("block").replace(/\n$/, "");
        const insert = state === "absent" || !block ? [] : [begin, ...block.split("\n"), end];
        if (first >= 0 && last > first) lines.splice(first, last - first + 1, ...insert);
        else lines.push(...insert);
        content = lines.join("\n");
      }
      if (content) content += "\n";
    }
    writeFile(h, path, content, user);
  }
  const node = h.fs[path]!;
  if (owner) node.owner = owner;
  if (group) node.group = group;
  if (mode) node.mode = Number.parseInt(mode, 8);
  return ok(before !== JSON.stringify(node) ? "changed" : "");
}

function loadInventory(c: Ctx, args: string[]) {
  const path = abs(c.f, opt(args, "-i", "--inventory") ?? "/etc/ansible/hosts");
  const text = readFile(c.h, path);
  if (text === undefined) throw new Error(`Unable to parse ${path} as an inventory source`);
  return inventory(text);
}
function operands(args: string[]) {
  return args.filter((value, i) => !value.startsWith("-") && !["-i", "--inventory", "-m", "--module-name", "-a", "--args"].includes(args[i - 1] ?? ""));
}

CMDS["ansible"] = function* (c, a) {
  if (a.includes("--version")) return ok(readFile(c.h, "/usr/local/bin/ansible") ?? readFile(c.h, abs(c.f, "~/.local/bin/ansible")) ?? "ansible");
  try {
    const selected = pick(loadInventory(c, a), operands(a)[0] ?? "");
    const module = (opt(a, "-m", "--module-name") ?? "command").split(".").pop()!;
    if (!selected.length) return err("No hosts matched");
    const lines: string[] = [];
    let code = 0;
    for (const e of selected) {
      const r = yield* task(c, e, module, opt(a, "-a", "--args"), a.includes("-b") || a.includes("--become"), e.vars, c.f.cwd);
      if (r.code) code = r.code === 255 ? 4 : 2;
      lines.push(`${e.alias} | ${r.code === 255 ? "UNREACHABLE!" : r.code ? "FAILED!" : r.out === "changed" ? "CHANGED" : "SUCCESS"} => ${r.out}`);
    }
    return { out: lines.join("\n"), code };
  } catch (e) { return err(`ERROR! ${String(e)}`); }
};

CMDS["ansible-inventory"] = function* (c, a) {
  try { return ok(JSON.stringify(loadInventory(c, a).map(({ alias, groups, vars }) => ({ alias, groups: [...groups], vars })), null, 2)); }
  catch (e) { return err(`ERROR! ${String(e)}`); }
};

CMDS["ansible-playbook"] = function* (c, a) {
  try {
    const inv = loadInventory(c, a);
    const path = abs(c.f, operands(a)[0] ?? "");
    const contents = readFile(c.h, path);
    if (contents === undefined) return err(`ERROR! the playbook: ${path} could not be found`);
    const plays = parse(contents) as Play[];
    if (!Array.isArray(plays)) return err("ERROR! a playbook must be a list of plays");
    const totals = new Map<string, { ok: number; changed: number; unreachable: number; failed: number; skipped: number }>();
    const out: string[] = [];
    for (const play of plays) {
      if (!play?.hosts) return err("ERROR! hosts is required");
      out.push(`PLAY [${play.hosts}] ***`);
      const tasks = (play.roles ?? []).flatMap((entry) => {
        const role = typeof entry === "string" ? entry : entry.role;
        const roleDir = `${parent(path)}/roles/${role}`;
        const text = readFile(c.h, roleDir + "/tasks/main.yml") ?? readFile(c.h, roleDir + "/tasks/main.yaml");
        if (text === undefined) throw new Error(`role '${role}' was not found`);
        const defaults = parse(readFile(c.h, roleDir + "/defaults/main.yml") ?? "{}") as Vars;
        const roleVars = parse(readFile(c.h, roleDir + "/vars/main.yml") ?? "{}") as Vars;
        return (parse(text) as Task[]).map((current) => ({
          current, roleDir, vars: { ...defaults, ...roleVars, ...typeof entry === "string" ? {} : entry.vars },
        }));
      });
      const sequence = [...tasks, ...(play.tasks ?? []).map((current) => ({ current, roleDir: undefined, vars: {} }))];
      const selected = pick(inv, play.hosts);
      if (!selected.length) out.push("skipping: no hosts matched");
      for (const e of selected) {
        const total = totals.get(e.alias) ?? { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0 };
        totals.set(e.alias, total);
        if (total.failed || total.unreachable) continue;
        if (!remote(c, e)) { total.unreachable++; out.push(`fatal: [${e.alias}]: UNREACHABLE! => Permission denied`); continue; }
        for (const { current, roleDir, vars } of sequence) {
          const module = Object.keys(current).find((key) => !["name", "when", "become", "vars", "register", "tags"].includes(key));
          if (!module) throw new Error("no module/action detected in task");
          const values = { ...e.vars, ...vars, ...play.vars, ...current.vars, inventory_hostname: e.alias,
            ansible_nodename: remote(c, e)?.h.name, ansible_hostname: remote(c, e)?.h.name };
          out.push(`TASK [${current.name ?? module}] ***`);
          if (current.when && !condition(current.when, values)) { total.skipped++; out.push(`skipping: [${e.alias}]`); continue; }
          const r = yield* task(c, e, module.split(".").pop()!, current[module],
            current.become ?? play.become ?? (a.includes("-b") || a.includes("--become")), values, parent(path), roleDir);
          if (r.code) { total.failed++; out.push(`fatal: [${e.alias}]: FAILED! => ${r.out}`); break; }
          total.ok++;
          if (r.out === "changed") total.changed++;
          out.push(`${r.out === "changed" ? "changed" : "ok"}: [${e.alias}]`);
        }
      }
    }
    out.push("PLAY RECAP ***");
    for (const [alias, result] of totals) out.push(`${alias} : ${Object.entries(result).map(([key, v]) => key + "=" + v).join(" ")}`);
    const results = [...totals.values()];
    return { out: out.join("\n"), code: results.some((v) => v.unreachable) ? 4 : results.some((v) => v.failed) ? 2 : 0 };
  } catch (e) { return err(`ERROR! ${String(e)}`); }
};
