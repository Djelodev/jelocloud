import { http, startSvc } from "../engine/services";
import { installPkg, mkdirp, writeFile } from "../engine/world";
import { apps, check, commands, edit, file, host, login, scenario, type Step } from "./scenario";
import type { World } from "../engine";

const web = "stapp01";
const db = "stdb01";
const lb = "stlb01";
const apache = "/etc/httpd/conf/httpd.conf";
const nginx = "/etc/nginx/nginx.conf";
const socket = "/var/run/php-fpm/default.sock";
const config = (body: string) => `events {}\nhttp {\n${body}\n}\n`;
const active = (w: World, service: string, name = web) => host(w, name).svcs[service]?.active === true;
function collision(w: World) {
  const h = host(w, web);
  installPkg(h, "sendmail");
  installPkg(h, "httpd");
  writeFile(h, apache, "Listen 8087\nDocumentRoot /var/www/html\n");
  writeFile(h, "/etc/mail/port", "8087\n");
  h.svcs["sendmail"]!.active = true;
  startSvc(w, h, "httpd");
}
const curl = (w: World, url: string, name = "jump_host") => http(w, host(w, name), url);
const https = config("  server {\n    listen 443 ssl;\n    ssl_certificate /etc/pki/CA/certs/nautilus.crt;\n    ssl_certificate_key /etc/pki/CA/certs/nautilus.key;\n    root /usr/share/nginx/html;\n  }");
const proxy = config(`  upstream apps {\n${apps.map((name) => `    server ${name}:80;`).join("\n")}\n  }\n  server {\n    listen 80;\n    location / { proxy_pass http://apps; }\n  }`);
const php = config(`  server {\n    listen 80;\n    root /usr/share/nginx/html;\n    index index.php;\n    location ~ \\.php$ { fastcgi_pass unix:${socket}; }\n  }`);

export function linux(day: number, steps: Step[]) {
  switch (day) {
    case 1: return scenario(steps, [check("yousuf utilise /sbin/nologin sur stapp01", (w) => host(w, web).users["yousuf"]?.shell === "/sbin/nologin")]);
    case 2: return scenario(steps, [check("javed expire le 28 janvier 2027 sur stapp01", (w) => host(w, web).users["javed"]?.expire === "2027-01-28")]);
    case 3: return scenario(apps.flatMap((name) => [...login(name, true), ...steps.slice(2), ...commands("exit", "exit")]),
      apps.map((name) => check(`SSH interdit à root sur ${name}`, (w) => active(w, "sshd", name) &&
        /^PermitRootLogin\s+no\s*$/m.test(file(w, "/etc/ssh/sshd_config", name) ?? "") &&
        /^PermitRootLogin\s+no\s*$/m.test(host(w, name).svcs["sshd"]?.config ?? ""))));
    case 4: return scenario(steps, [check("Le script est lisible et exécutable par tous", (w) => ((host(w, web).fs["/tmp/xfusioncorp.sh"]?.mode ?? 0) & 0o555) === 0o555)],
      (w) => writeFile(host(w, web), "/tmp/xfusioncorp.sh", "#!/bin/bash\necho Jelo\n", "tony"));
    case 5: return scenario(steps, [
      check("policycoreutils installé", (w) => host(w, web).pkgs.has("policycoreutils")),
      check("SELinux désactivé dans la configuration persistante", (w) => /^SELINUX=disabled$/m.test(file(w, "/etc/selinux/config", web) ?? "")),
    ]);
    case 6: return scenario(steps, [
      check("crond démarre maintenant et au boot", (w) => active(w, "crond") && host(w, web).svcs["crond"]?.enabled === true),
      check("Le cron de root écrit hello toutes les 5 minutes", (w) => /^\*\/5\s+\*\s+\*\s+\*\s+\*\s+echo\s+hello\s*>\s*\/tmp\/cron_text\s*$/m.test(host(w, web).crontabs["root"] ?? "")),
    ]);
    case 7: return scenario([steps[0]!, ...apps.flatMap((name, i) => {
      const user = ["tony", "steve", "banner"][i]!;
      return commands(`ssh-copy-id ${user}@${name}`, `ssh ${user}@${name} whoami`);
    })], apps.map((name, i) => check("Clé du jump host autorisée sur " + name, (w) => {
      const pub = file(w, "/home/thor/.ssh/id_rsa.pub")?.trim();
      return !!pub && (file(w, `/home/${["tony", "steve", "banner"][i]}/.ssh/authorized_keys`, name) ?? "").split("\n").includes(pub);
    })));
    case 8: return scenario(steps, [check("Ansible 4.8.0 installé pour tous", (w) => file(w, "/usr/local/bin/ansible") === "ansible 4.8.0")]);
    case 9: return scenario(steps, [check("MariaDB tourne et mysql possède les données", (w) => active(w, "mariadb", db) && host(w, db).fs["/var/lib/mysql"]?.owner === "mysql")], (w) => {
      const h = host(w, db);
      installPkg(h, "mariadb-server");
      h.fs["/var/lib/mysql"]!.owner = "root";
      h.fs["/var/lib/mysql"]!.group = "root";
      startSvc(w, h, "mariadb");
    });
    case 10: return scenario([steps[0]!, ...commands("ssh-keygen -t rsa -N '' -f ~/.ssh/id_rsa", "ssh-copy-id clint@stbkp01"),
      edit("/scripts/backup.sh", "#!/bin/bash\nset -e\nzip -r /tmp/news.zip /var/www/html/news\nscp /tmp/news.zip clint@stbkp01:/tmp/news.zip\n"),
      ...steps.slice(2)], [
      check("Le script de sauvegarde est exécutable", (w) => !!((host(w, web).fs["/scripts/backup.sh"]?.mode ?? 0) & 0o100)),
      check("Le serveur de backup a reçu l’archive du site", (w) => file(w, "/tmp/news.zip", "stbkp01") === "PK-ZIP:/var/www/html/news"),
    ], (w) => {
      const h = host(w, web);
      mkdirp(h, "/scripts", "tony");
      installPkg(h, "zip");
      writeFile(h, "/var/www/html/news/index.html", "Site News\n");
    });
    case 11: return scenario(steps, [check("Tomcat sert ROOT.war sur 8086", (w) => curl(w, "http://stapp01:8086/").body.includes("Jelo Tomcat"))],
      (w) => writeFile(host(w, web), "/tmp/ROOT.war", "Jelo Tomcat\n"));
    case 12: case 14: return scenario(day === 12 ? steps : [...steps.slice(0, 4), ...commands("systemctl stop sendmail"), ...steps.slice(4)],
      [check("Apache répond sur 8087 et sendmail est arrêté", (w) => curl(w, "http://stapp01:8087/").ok && !active(w, "sendmail"))], collision);
    case 13: return scenario(steps, [check("Port 3003 accessible au load balancer uniquement et règles sauvegardées", (w) =>
      curl(w, "http://stapp01:3003/", lb).ok && !curl(w, "http://stapp01:3003/").ok &&
      !curl(w, "http://stapp01:3003/", "stapp02").ok && host(w, web).iptSaved)], (w) => {
      const h = host(w, web);
      installPkg(h, "httpd");
      writeFile(h, apache, "Listen 3003\nDocumentRoot /var/www/html\n");
      startSvc(w, h, "httpd");
    });
    case 15: return scenario(steps.map((s) => s.cmd.startsWith("vi ") ? edit(nginx, https) : s), [
      check("Nginx répond en HTTPS avec le certificat du lab", (w) => curl(w, "https://stapp01:443/").ok &&
        !!file(w, "/etc/pki/CA/certs/nautilus.crt", web) && !!file(w, "/etc/pki/CA/certs/nautilus.key", web)),
    ], (w) => {
      const h = host(w, web);
      mkdirp(h, "/etc/pki/CA/certs");
      writeFile(h, "/tmp/nautilus.crt", "CERTIFICAT SIMULÉ");
      writeFile(h, "/tmp/nautilus.key", "CLÉ SIMULÉE");
    });
    case 16: return scenario([...login(lb, true), ...commands("yum install -y nginx"), edit(nginx, proxy),
      ...commands("nginx -t", "systemctl enable --now nginx", "curl http://localhost")], [
      check("Le load balancer distribue les requêtes aux trois backends", (w) =>
        new Set(apps.map((_, index) => curl({ ...w, meta: { ...w.meta, rr: index } }, "http://stlb01/").body)).size === 3 &&
        apps.every((name) => (file(w, nginx, lb) ?? "").includes(`server ${name}:80;`))),
    ], (w) => {
      for (const name of apps) {
        const h = host(w, name);
        installPkg(h, "httpd");
        writeFile(h, "/var/www/html/index.html", `Backend ${name}\n`);
        startSvc(w, h, "httpd");
      }
    });
    case 17: return scenario(steps, [check("PostgreSQL, base et rôle propriétaire sur stdb01", (w) => {
      const h = host(w, db);
      return active(w, "postgresql", db) && h.pg.databases.has("kodekloud_db1") &&
        !!h.pg.users["kodekloud_tim"] && h.pg.grants.some((g) => g.db === "kodekloud_db1" && g.user === "kodekloud_tim");
    })], (w) => { installPkg(host(w, db), "postgresql-server"); });
    case 18: return scenario(steps, [check("Base MariaDB et privilèges de l’utilisateur applicatif sur stdb01", (w) => {
      const h = host(w, db);
      return active(w, "mariadb", db) && h.db.databases.has("kodekloud_db") &&
        !!h.db.users["kodekloud_aim"] && h.db.grants.some((g) => g.db === "kodekloud_db" && g.user === "kodekloud_aim");
    })]);
    case 19: return scenario(steps, ["news", "cluster"].map((name) =>
      check(`Le site ${name} répond sur 6400`, (w) => curl(w, `http://stapp01:6400/${name}/`).body.includes(`Site ${name}`))),
    (w) => { for (const name of ["news", "cluster"]) writeFile(host(w, web), `/tmp/${name}/index.html`, `Site ${name}\n`); });
    case 20: return scenario(steps.map((s) => s.cmd === "vi " + nginx ? edit(nginx, php) : s.cmd.startsWith("vi ")
      ? edit("/etc/php-fpm.d/www.conf", `[www]\nuser = apache\ngroup = apache\nlisten = ${socket}\n`) : s),
      [check("Nginx exécute index.php via le socket PHP-FPM", (w) => curl(w, "http://stapp01/index.php").body.includes("Jelo PHP") &&
        (file(w, nginx, web) ?? "").includes("unix:" + socket))],
      (w) => writeFile(host(w, web), "/usr/share/nginx/html/index.php", '<?php echo "Jelo PHP"; ?>'));
    default: throw new Error("Jour Linux inconnu");
  }
}
