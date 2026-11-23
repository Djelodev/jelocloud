import { Shell, type World } from "../engine";
import { http } from "../engine/services";
import { installPkg, mkdirp, readFile, writeFile } from "../engine/world";
import { check, commands, edit, host, scenario, type Step } from "./scenario";

const app = "stapp01";
const docker = (w: World) => host(w, app).docker;
const image = (w: World, name: string) => docker(w).images[name.includes(":") ? name : name + ":latest"];
const running = (w: World, name: string) => docker(w).containers.find((c) => c.name === name && c.running);
const served = (w: World, port: number) => http(w, host(w), `http://stapp01:${port}/`).body;
const apache = "FROM ubuntu:latest\nRUN apt update && apt install -y apache2\nRUN sed -i 's/80/5003/' /etc/apache2/ports.conf\nEXPOSE 5003\nCMD [\"apache2ctl\", \"-D\", \"FOREGROUND\"]\n";
const compose = "services:\n  web:\n    image: httpd:latest\n    container_name: compose-httpd\n    ports: [\"8080:80\"]\n";
const finance = "services:\n  web:\n    image: httpd:latest\n    container_name: finance-web\n    ports: [\"3000:80\"]\n  db:\n    image: mysql:8\n    container_name: finance-db\n    environment:\n      MYSQL_ROOT_PASSWORD: simulated-finance-password\n";
const python = "FROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY app.py .\nEXPOSE 5000\nCMD [\"python3\", \"app.py\"]\n";

function setup(w: World, day: number) {
  const h = host(w, app);
  installPkg(h, "docker-ce");
  h.svcs["docker"]!.active = true;
  h.groups["docker"] = { gid: 991, members: ["tony"] };
  for (const path of ["/opt/docker", "/opt/finance", "/python_app"]) mkdirp(h, path, "tony");
  if ([37, 39, 40].includes(day)) {
    const name = day === 40 ? "kkloud" : "ubuntu_latest";
    const r = new Shell(w, app, "root").line(`docker run -d --name ${name} ubuntu:latest sleep infinity`).next();
    if (!r.done || r.value.code) throw new Error("Impossible de préparer le conteneur du lab");
  }
  if (day === 37) writeFile(h, "/tmp/nautilus.txt.gpg", "Document GPG simulé\n");
  if (day === 39) writeFile(running(w, "ubuntu_latest")!.host, "/opt/site.txt", "Snapshot du conteneur\n");
  if (day === 45) writeFile(h, "/opt/docker/Dockerfile", "FORM nginx:alpine\n", "tony");
  if (day === 47) {
    writeFile(h, "/python_app/requirements.txt", "flask\n", "tony");
    writeFile(h, "/python_app/app.py", "from flask import Flask\napp = Flask(__name__)\n@app.route('/')\ndef index():\n    return 'Jelo Flask'\napp.run(host='0.0.0.0', port=5000)\n", "tony");
  }
}

export function dockerLab(day: number, steps: Step[]) {
  const lab = (solution: Step[], label: string, test: (w: World) => boolean) =>
    scenario(solution, [check(label, test)], day === 35 ? undefined : (w) => setup(w, day));
  switch (day) {
    case 35: return lab(steps, "Docker et Compose sont installés et le démon démarre au boot", (w) => {
      const h = host(w, app);
      return h.pkgs.has("docker-ce") && h.pkgs.has("docker-compose-plugin") && !!h.svcs["docker"]?.active && !!h.svcs["docker"].enabled;
    });
    case 36: return lab(steps, "nginx_1 tourne sur stapp01 avec nginx:alpine", (w) => running(w, "nginx_1")?.image === "nginx:alpine");
    case 37: return lab(steps, "Le conteneur contient le fichier GPG intact", (w) => {
      const c = running(w, "ubuntu_latest");
      return !!c && readFile(c.host, "/opt/nautilus.txt.gpg") === readFile(host(w, app), "/tmp/nautilus.txt.gpg");
    });
    case 38: return lab(steps, "Les tags musl et local désignent la même image", (w) => {
      const up = image(w, "busybox:musl");
      return !!up && up.id === image(w, "busybox:local")?.id;
    });
    case 39: return lab(steps, "beta:datacenter contient l’état du conteneur", (w) =>
      image(w, "beta:datacenter")?.fs["/opt/site.txt"]?.content === "Snapshot du conteneur\n");
    case 40: return lab([...steps.slice(0, 2), ...commands("apt update"), ...steps.slice(2)], "Apache tourne dans kkloud et écoute sur 6300", (w) => {
      const c = running(w, "kkloud");
      return !!c && http(w, c.host, "http://localhost:6300/").body.includes("Apache2");
    });
    case 41: return lab(steps.map((s) => s.cmd.startsWith("vi ") ? edit("/opt/docker/Dockerfile", apache) : s),
      "L’image apache-app embarque Apache et le port 5003", (w) => {
        const i = image(w, "apache-app");
        return !!i?.pkgs.includes("apache2") && i.expose.includes(5003) && i.fs["/etc/apache2/ports.conf"]?.content.includes("Listen 5003") === true;
      });
    case 42: return lab(steps, "Le réseau ecommerce utilise macvlan et le sous-réseau demandé", (w) => {
      const n = docker(w).networks["ecommerce"];
      return n?.driver === "macvlan" && n.subnet === "192.168.0.0/24";
    });
    case 43: return lab(steps, "Nginx répond sur le port publié 6300", (w) =>
      !!running(w, "games")?.ports.some((p) => p.h === 6300 && p.c === 80) && served(w, 6300).includes("Welcome to nginx"));
    case 44: return lab([steps[0]!, edit("/opt/docker/docker-compose.yml", compose),
      ...commands("docker compose -f /opt/docker/docker-compose.yml up -d", "docker ps")],
    "Le service Compose httpd tourne et répond", (w) => running(w, "compose-httpd")?.image === "httpd:latest" && served(w, 8080).includes("It works"));
    case 45: return lab(steps.map((s) => s.cmd.startsWith("vi ") ? edit("/opt/docker/Dockerfile", "FROM nginx:alpine\nEXPOSE 80\n") : s),
      "L’image fixed est construite avec Nginx", (w) => image(w, "fixed")?.pkgs.includes("nginx") === true);
    case 46: return lab([steps[0]!, edit("/opt/finance/docker-compose.yml", finance),
      ...commands("docker compose -f /opt/finance/docker-compose.yml up -d", "curl http://localhost:3000")],
    "Le site et MySQL tournent dans le même réseau Compose", (w) => {
      const web = running(w, "finance-web");
      const db = running(w, "finance-db");
      return !!web && !!db && web.network !== "bridge" && web.network === db.network && served(w, 3000).includes("It works");
    });
    case 47: return lab(steps.map((s) => s.cmd.startsWith("vi ") ? edit("/python_app/Dockerfile", python) : s),
      "Flask répond dans le conteneur sur le port 8095 de l’hôte", (w) => served(w, 8095) === "Jelo Flask");
    default: throw new Error("Jour Docker inconnu");
  }
}
