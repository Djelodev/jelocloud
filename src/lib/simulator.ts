// Terminal simulé : interprète les commandes et produit une sortie réaliste.
import type { Step } from "./labs";

export type Sim = { user: string; host: string; cwd: string; stack: { user: string; host: string; cwd: string }[] };
export const newSim = (): Sim => ({ user: "thor", host: "jump_host", cwd: "~", stack: [] });
export const prompt = (s: Sim) => `[${s.user}@${s.host} ${s.cwd}]${s.user === "root" ? "#" : "$"}`;

const tok = (c: string) => c.replace(/["']/g, " ").split(/\s+/).filter(Boolean);

export function stepMatches(step: Step, input: string): boolean {
  const c = input.trim();
  if (step.match) return new RegExp(step.match).test(c);
  const have = new Set(tok(c));
  return tok(step.cmd).every((t) => have.has(t));
}

const HELP = `Commandes simulées : ls, cd, pwd, cat, echo, whoami, hostname, clear, ssh, exit, sudo,
useradd, chage, chmod, chown, systemctl, yum/dnf/apt, git, docker, kubectl, ansible,
terraform, jenkins-cli, curl, ss, ps, grep, vi/nano... Tape "indice" pour l'aide du step courant.`;

export function run(sim: Sim, input: string): { out: string; clear?: boolean } {
  const c = input.trim();
  if (!c) return { out: "" };
  const [cmd0 = "", ...a] = c.split(/\s+/);
  let cmd = cmd0;
  let args = a;
  if (cmd === "sudo" && args[0] !== "su" && args[0] !== "-i") { cmd = args[0] ?? ""; args = args.slice(1); }
  const ok = (o = "") => ({ out: o });
  switch (cmd) {
    case "help": return ok(HELP);
    case "clear": return { out: "", clear: true };
    case "whoami": return ok(sim.user);
    case "hostname": return ok(sim.host);
    case "pwd": return ok(sim.cwd === "~" ? (sim.user === "root" ? "/root" : `/home/${sim.user}`) : sim.cwd);
    case "cd": sim.cwd = args[0] && args[0] !== "~" ? args[0] : "~"; return ok();
    case "ls": return ok(args.includes("-l") ? `-rw-r--r--. 1 ${sim.user} ${sim.user} 1024 Nov 22 20:22 ${args.find((x) => !x.startsWith("-")) ?? "fichier.txt"}` : "playbook  scripts  notes.txt");
    case "echo": return ok(c.includes("|") || c.includes(">") ? "" : args.join(" ").replace(/["']/g, ""));
    case "ssh": {
      const t = args.find((x) => x.includes("@"));
      if (!t) return ok("usage: ssh user@hôte");
      const [u, h] = t.split("@");
      sim.stack.push({ user: sim.user, host: sim.host, cwd: sim.cwd });
      Object.assign(sim, { user: u, host: h, cwd: "~" });
      return ok(`${u}@${h}'s password: ********\nLast login: Sun Nov 22 20:22:01 2026 from jump_host`);
    }
    case "exit": case "logout": {
      const p = sim.stack.pop();
      if (!p) return ok("Tu es déjà sur le jump host.");
      Object.assign(sim, p);
      return ok(`logout\nConnection to host closed.`);
    }
    case "su": case "sudo":
      sim.stack.push({ user: sim.user, host: sim.host, cwd: sim.cwd });
      Object.assign(sim, { user: "root", cwd: "~" });
      return ok(`[sudo] password for ${sim.stack.at(-1)?.user}: ********`);
    case "useradd": return ok(sim.user === "root" ? "" : "useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.");
    case "chage": return ok(`Last password change\t\t\t\t: Nov 22, 2026\nPassword expires\t\t\t\t\t: never\nAccount expires\t\t\t\t\t: Jan 28, 2027`);
    case "grep": if (c.includes("passwd")) return ok(`${args[0]}:x:1002:1002::/home/${args[0]}:/sbin/nologin`); return ok(c.includes("PermitRootLogin") ? "PermitRootLogin no" : "");
    case "getent": return ok(`${args[1]}:x:1002:1002::/home/${args[1]}:/sbin/nologin`);
    case "chmod": case "chown": case "cp": case "mv": case "mkdir": case "touch": case "rm": case "sed": case "crontab":
      return ok(args.includes("-l") ? "*/5 * * * * echo hello > /tmp/cron_text" : "");
    case "vi": case "vim": case "nano": return ok(`"${args[0] ?? "fichier"}" écrit — (éditeur simulé) fichier enregistré.`);
    case "cat": return ok(c.includes("initialAdminPassword") ? "3f9a1c0e7b2d4e8f9a1b2c3d4e5f6a7b" : `# contenu de ${args[0] ?? ""}`);
    case "yum": case "dnf": case "apt": case "apt-get": case "pip3": case "yum-config-manager":
      return ok(`Resolving dependencies...\nInstalling: ${args.filter((x) => !x.startsWith("-") && x !== "install").join(" ")}\nComplete!`);
    case "systemctl": case "service":
      if (args[0] === "status") return ok(`● ${args[1]}.service\n   Loaded: loaded\n   Active: active (running) since Sun 2026-11-22 20:22:00 UTC`);
      return ok("");
    case "journalctl": return ok("mariadbd: Can't create/write to file '/var/lib/mysql/...' (Errcode: 13 \"Permission denied\")");
    case "sestatus": return ok("SELinux status:                 disabled");
    case "ss": case "netstat": return ok("LISTEN 0 128 0.0.0.0:8087 0.0.0.0:* users:((\"sendmail\",pid=812))");
    case "ps": return ok("root   1021  0.0  httpd -DFOREGROUND");
    case "curl": return ok("<h1>Welcome — ça fonctionne !</h1>");
    case "nginx": return ok("nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful");
    case "ssh-keygen": return ok("Generating public/private rsa key pair.\nYour identification has been saved in /home/thor/.ssh/id_rsa");
    case "ssh-copy-id": return ok("Number of key(s) added: 1");
    case "ansible": return ok(c.includes("version") ? "ansible [core 2.11.12]" : `stapp01 | SUCCESS => {\n    "changed": false,\n    "ping": "pong"\n}`);
    case "ansible-playbook": return ok("PLAY [all] ****\nTASK [Gathering Facts] **** ok: [stapp01]\nPLAY RECAP **** stapp01 : ok=2 changed=1 unreachable=0 failed=0");
    case "git": {
      const sub = args[0];
      if (sub === "log") return ok("a1b2c3d (HEAD -> master) add data.txt\n9f8e7d6 initial commit");
      if (sub === "branch") return ok("* master\n  xfusioncorp_apps");
      if (sub === "status") return ok("On branch master\nnothing to commit, working tree clean");
      if (sub === "remote") return ok("origin\t/opt/apps.git (fetch)\norigin\t/opt/apps.git (push)");
      if (sub === "clone") return ok(`Cloning into '${(args[1] ?? "repo").split("/").pop()?.replace(".git", "")}'...\ndone.`);
      if (sub === "init") return ok(`Initialized empty Git repository in ${args.at(-1)}`);
      if (sub === "push") return ok("Enumerating objects: 5, done.\nTo /opt/apps.git\n   9f8e7d6..a1b2c3d  master -> master");
      if (sub === "commit") return ok("[master a1b2c3d] commit\n 1 file changed, 1 insertion(+)");
      if (sub === "stash" && args[1] === "list") return ok("stash@{0}: WIP on master\nstash@{1}: WIP on master");
      if (sub === "tag") return ok("2026-11-22-release");
      return ok("");
    }
    case "docker": {
      const sub = args[0];
      if (sub === "ps") return ok("CONTAINER ID   IMAGE          STATUS         PORTS                  NAMES\n4f2a1b3c9d8e   nginx:alpine   Up 3 seconds   0.0.0.0:6300->80/tcp   nginx_1");
      if (sub === "images") return ok("REPOSITORY   TAG      IMAGE ID       SIZE\nbusybox      local    7cfbbec8963d   1.4MB\nbusybox      musl     7cfbbec8963d   1.4MB");
      if (sub === "version" || sub === "info") return ok("Client: Docker Engine - Community\n Version: 27.3.1\nServer:\n Engine: 27.3.1");
      if (sub === "pull") return ok(`Pulling from library/${args[1]}\nStatus: Downloaded newer image for ${args[1]}`);
      if (sub === "build") return ok("[+] Building 4.2s (8/8) FINISHED\n => naming to docker.io/library/app");
      if (sub === "run") return ok("4f2a1b3c9d8e7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f");
      return ok("");
    }
    case "kubectl": {
      const sub = args[0];
      if (sub === "get") return ok("NAME                       READY   STATUS    RESTARTS   AGE\nnginx-7c5ddbdf54-x2k9p     1/1     Running   0          12s");
      if (sub === "describe") return ok("Name: resource\nStatus: Running\nEvents:\n  Normal  Pulled  12s  kubelet  Successfully pulled image");
      if (sub === "logs") return ok("Greeting: Welcome to xFusionCorp");
      if (sub === "rollout") return ok(args[1] === "history" ? "REVISION  CHANGE-CAUSE\n1         <none>\n2         <none>" : "deployment successfully rolled out");
      return ok(`${args[1] ?? "resource"}/${args[2] ?? "objet"} ${sub === "delete" ? "deleted" : "created"}`);
    }
    case "terraform": {
      const sub = args[0];
      if (sub === "init") return ok("Initializing provider plugins...\n- Installing hashicorp/aws v5.31.0...\nTerraform has been successfully initialized!");
      if (sub === "plan") return ok("Plan: 1 to add, 0 to change, 0 to destroy.");
      if (sub === "apply") return ok("Apply complete! Resources: 1 added, 0 changed, 0 destroyed.");
      return ok("aws_resource.main");
    }
    case "jenkins-cli": case "gitea": return ok("✔ Opération réussie.");
    case "bash": case "sh": case "postgresql-setup": case "mysql": case "iptables": return ok("");
    default:
      if (cmd.startsWith("./") || cmd.startsWith("/")) return ok("");
      return ok(`bash: ${cmd}: command not found`);
  }
}
