import { stringify } from "yaml";
import { installPkg, mkdirp, writeFile, CREDS } from "../engine/world";
import { inventory } from "../engine/ansible";
import { apps, check, commands, edit, file, host, scenario, type Step } from "./scenario";
import type { World } from "../engine";

const ini = (hosts: readonly string[]) => "[app]\n" + hosts.map((name) => {
  const c = CREDS[name]!;
  return `${name} ansible_host=${c.ip} ansible_user=${c.user} ansible_ssh_pass=${c.pass}`;
}).join("\n") + "\n";
const play = (...tasks: object[]) => stringify([{ hosts: "app", become: true, tasks }]);
const path = "/var/www/html/index.html";
const run = commands("ansible-playbook -i inventory playbook.yml")[0]!;
export function ansible(day: number, steps: Step[]) {
  const targets = day === 82 ? ["stapp02"] : apps;
  const lab = (solution: Step[], label: string, test: (w: World) => boolean, init?: (w: World) => void) =>
    scenario(solution, [check(label, test)], (w) => {
      const h = host(w);
      writeFile(h, "/usr/local/bin/ansible", "ansible 4.8.0", "root", 0o755);
      if (day !== 82) writeFile(h, "/home/thor/inventory", day === 86 ? ini(targets).replace(CREDS["stapp03"]!.pass, "wrong-password") : ini(targets), "thor");
      init?.(w);
    });
  const onApps = (w: World, predicate: (name: string) => boolean) => apps.every(predicate);
  const basePage = (w: World) => { for (const name of apps) writeFile(host(w, name), path, "<h1>Jelo</h1>\n"); };
  const fromPlay = (content: string) => [edit("playbook.yml", content), run];
  switch (day) {
    case 82: return lab([edit("inventory", ini(targets)), steps[1]!],
      "L’inventaire pointe sur stapp02 avec ses bons identifiants", (w) => {
        try {
          const list = inventory(file(w, "/home/thor/inventory") ?? "");
          const c = CREDS["stapp02"]!;
          return list.length === 1 && list[0]?.vars["ansible_host"] === c.ip &&
            list[0].vars["ansible_user"] === c.user && list[0].vars["ansible_ssh_pass"] === c.pass;
        } catch { return false; }
      });
    case 83: return lab(fromPlay(play({ file: { path: "/tmp/empty.txt", state: "touch" } })),
      "Le fichier vide existe sur les trois serveurs", (w) => onApps(w, (name) => file(w, "/tmp/empty.txt", name) === ""));
    case 84: return lab(fromPlay(play({ copy: { src: "data.txt", dest: "/tmp/data.txt", mode: "0644" } })),
      "Le fichier est identique sur les trois serveurs", (w) => onApps(w, (name) => file(w, "/tmp/data.txt", name) === "Données Jelo\n"),
      (w) => writeFile(host(w), "/home/thor/data.txt", "Données Jelo\n", "thor"));
    case 85: return lab(fromPlay(play({ file: { path: "/tmp/managed.txt", state: "touch", owner: "{{ ansible_user }}", mode: "0640" } })),
      "Chaque fichier appartient à l’utilisateur local et est en 0640", (w) => onApps(w, (name) => {
        const node = host(w, name).fs["/tmp/managed.txt"];
        return node?.owner === CREDS[name]!.user && node.mode === 0o640;
      }));
    case 86: return lab([...commands("ansible all -i inventory -m ping"), edit("inventory", ini(targets)), steps[0]!],
      "Les trois hôtes sont joignables avec les identifiants de l’inventaire", (w) => {
        try {
          const list = inventory(file(w, "/home/thor/inventory") ?? "");
          return apps.every((name) => {
            const c = CREDS[name]!;
            const e = list.find((row) => row.alias === name);
            return e?.vars["ansible_host"] === c.ip && e.vars["ansible_user"] === c.user &&
              e.vars["ansible_ssh_pass"] === host(w, name).users[c.user]?.password;
          });
        } catch { return false; }
      });
    case 87: return lab(steps, "vim-enhanced est installé sur les trois serveurs", (w) =>
      onApps(w, (name) => host(w, name).pkgs.has("vim-enhanced")));
    case 88: return lab(fromPlay(play({ blockinfile: { path, block: "<p>Géré par Ansible</p>" } })),
      "Le bloc HTML apparaît une fois et conserve le contenu de chaque page", (w) => onApps(w, (name) => {
        const txt = file(w, path, name) ?? "";
        return txt.includes("<h1>Jelo</h1>") &&
          txt.split("# BEGIN ANSIBLE MANAGED BLOCK\n<p>Géré par Ansible</p>\n# END ANSIBLE MANAGED BLOCK").length === 2;
      }), basePage);
    case 89: return lab(steps, "httpd est actif et activé au boot sur les trois serveurs", (w) => onApps(w, (name) => {
      const svc = host(w, name).svcs["httpd"];
      return !!svc?.active && svc.enabled;
    }), (w) => { for (const name of apps) installPkg(host(w, name), "httpd"); });
    case 90: return lab(fromPlay(play({ acl: { path: "/tmp/acl.txt", entity: "{{ ansible_user }}", etype: "user", permissions: "rw", state: "present" } })),
      "Chaque utilisateur applicatif a l’ACL rw demandée", (w) =>
        onApps(w, (name) => host(w, name).fs["/tmp/acl.txt"]?.acl?.[`user:${CREDS[name]!.user}`] === "rw"), (w) => {
      for (const name of apps) {
        const h = host(w, name);
        installPkg(h, "acl");
        writeFile(h, "/tmp/acl.txt", "Configuration\n", "root", 0o600);
      }
    });
    case 91: return lab(fromPlay(play({ lineinfile: { path: "/etc/jelo.conf", regexp: "^ENABLED=", line: "ENABLED=true" } })),
      "Chaque fichier a une seule directive ENABLED=true", (w) => onApps(w, (name) =>
        (file(w, "/etc/jelo.conf", name) ?? "").split("\n").filter((line) => line.startsWith("ENABLED=")).join() === "ENABLED=true"),
    (w) => { for (const name of apps) writeFile(host(w, name), "/etc/jelo.conf", "# Jelo\nENABLED=false\n"); });
    case 92: return lab([
      edit("roles/web/templates/index.html.j2", "<h1>Bienvenue sur {{ inventory_hostname }}</h1>\n"),
      edit("roles/web/tasks/main.yml", stringify([{ template: { src: "index.html.j2", dest: path, mode: "0644" } }])),
      ...fromPlay(stringify([{ hosts: "app", become: true, roles: ["web"] }])),
    ], "Le rôle génère une page personnalisée par serveur", (w) =>
      onApps(w, (name) => file(w, path, name) === `<h1>Bienvenue sur ${name}</h1>\n`), (w) => {
      for (const dir of ["tasks", "templates"]) mkdirp(host(w), "/home/thor/roles/web/" + dir, "thor");
      for (const name of apps) mkdirp(host(w, name), "/var/www/html");
    });
    case 93: return lab(fromPlay(play(...apps.map((name, i) => ({
      copy: { content: `Serveur ${i + 1}\n`, dest: "/tmp/app.txt" }, when: `ansible_nodename == '${name}'`,
    })))), "Chaque serveur reçoit le contenu correspondant à sa condition", (w) =>
      apps.every((name, i) => file(w, "/tmp/app.txt", name) === `Serveur ${i + 1}\n`));
    default: throw new Error("Jour Ansible inconnu");
  }
}
