import type { World } from "../engine";
import type { Job } from "../engine/misc";
import { startSvc } from "../engine/services";
import { installPkg, mkdirp, writeFile } from "../engine/world";
import { cdProject, seedGit } from "./git";
import { check, commands, edit, file, host, login, scenario, type Step } from "./scenario";

const backup = "/var/backups/app.sql";
const web = "/tmp/deploy/index.html";
const controller = "jenkins";
const success = (w: World, name: string) => w.jenkins.jobs[name]?.builds.at(-1)?.ok === true;
function preload(w: World, name: string, script: string, options: Partial<Job> = {}) {
  w.jenkins.jobs[name] = { name, script, type: "freestyle", params: {}, builds: [], ...options };
}
function pipeline(stages: { name: string; cmd: string; branch?: string }[]) {
  return `pipeline {
  agent any
  stages {
${stages.map(({ name, cmd, branch }) => `    stage('${name}') {
${branch ? `      when { expression { params.BRANCH == '${branch}' } }\n` : ""}      steps {
        sh '${cmd}'
      }
    }`).join("\n")}
  }
}
`;
}
function seedKey(w: World, from: string, user: string, to: string, targetUser: string) {
  const source = host(w, from);
  const target = host(w, to);
  const pub = `ssh-rsa simulated-${user}-${from}`;
  writeFile(source, source.users[user]!.home + "/.ssh/id_rsa", "clé privée simulée", user, 0o600);
  writeFile(source, source.users[user]!.home + "/.ssh/id_rsa.pub", pub + "\n", user);
  writeFile(target, target.users[targetUser]!.home + "/.ssh/authorized_keys", pub + "\n", targetUser, 0o600);
}
function fileJob(name: string, script: string, type = "freestyle", file = "job.sh") {
  return [edit(file, script), ...commands(`jenkins-cli create-job ${name} --type ${type} --file ${file}`)];
}
export function jenkins(day: number, steps: Step[]) {
  const lab = (solution: Step[], label: string, test: (w: World) => boolean, setup?: (w: World) => void) =>
    scenario(solution, [check(label, test)], (w) => {
      if (day !== 68) {
        const h = host(w, controller);
        installPkg(h, "java-17-openjdk");
        installPkg(h, "jenkins");
        startSvc(w, h, "jenkins");
        writeFile(host(w), "/usr/local/bin/jenkins-cli", "jenkins-cli", "root", 0o755);
      }
      setup?.(w);
    });
  switch (day) {
    case 68: return lab([...login(controller, true), steps[1]!,
      ...commands("yum-config-manager --add-repo https://pkg.jenkins.io/redhat-stable/jenkins.repo"), ...steps.slice(2),
      ...commands("exit", "exit", "jenkins-cli create-user devops DevOps-Sim2026", "jenkins-cli install-plugin matrix-auth",
        "jenkins-cli enable-matrix", "jenkins-cli grant devops Overall/Administer")],
      "Java et Jenkins tournent sur le serveur et devops peut l’administrer", (w) => {
        const h = host(w, controller);
        return h.pkgs.has("java-17-openjdk") && !!h.svcs["jenkins"]?.active && h.svcs["jenkins"].enabled &&
          w.jenkins.matrix && w.jenkins.users["devops"]?.perms.includes("Overall/Administer") === true;
      }, (w) => writeFile(host(w), "/usr/local/bin/jenkins-cli", "jenkins-cli", "root", 0o755));
    case 69: return lab(steps, "Les plugins Git et GitLab sont installés", (w) => ["git", "gitlab-plugin"].every((p) => w.jenkins.plugins.has(p)));
    case 70: return lab(commands("jenkins-cli install-plugin matrix-auth", "jenkins-cli enable-matrix",
      "jenkins-cli create-user ravi Ravi-Sim2026", "jenkins-cli grant ravi Overall/Read"),
    "Ravi possède uniquement Overall/Read avec Matrix", (w) => w.jenkins.matrix && w.jenkins.users["ravi"]?.perms.join() === "Overall/Read");
    case 71: return lab([...fileJob("install-packages", 'ssh natasha@ststor01 "sudo yum install -y $PACKAGE"\n'),
      ...commands("jenkins-cli add-param install-packages PACKAGE httpd", steps[1]!.cmd)],
      "Le build installe le paquet sélectionné sur ststor01", (w) => success(w, "install-packages") &&
        w.jenkins.jobs["install-packages"]?.builds.at(-1)?.params["PACKAGE"] === "httpd" && host(w, "ststor01").pkgs.has("httpd"),
      (w) => {
        seedKey(w, controller, "jenkins", "ststor01", "natasha");
        writeFile(host(w, "ststor01"), "/etc/sudoers", "natasha ALL=(root) NOPASSWD: /usr/bin/yum\n");
      });
    case 72: return lab([...fileJob("parameterized-job", 'echo "$Stage $env"\n'),
      ...commands("jenkins-cli add-param parameterized-job Stage Build",
        "jenkins-cli add-param parameterized-job env Development --choices Development,Production", steps[1]!.cmd)],
      "Stage est un texte, env un choix et le build utilise Build / Development", (w) => {
        const job = w.jenkins.jobs["parameterized-job"];
        const build = job?.builds.at(-1);
        return job?.params["Stage"]?.type === "string" && job.params["env"]?.type === "choice" && !!build?.ok && build.log.includes("\nBuild Development\n");
      });
    case 73: return lab([...fileJob("copy-logs", "cp /tmp/deploy.log /tmp/deploy.log.bak\n"), steps[1]!],
      "Le job copie les logs et est planifié toutes les 10 minutes", (w) => {
        const job = w.jenkins.jobs["copy-logs"];
        return job?.trigger === "H/10 * * * *" && job.script.includes("cp /tmp/deploy.log");
      }, (w) => writeFile(host(w, controller), "/tmp/deploy.log", "Déploiement\n"));
    case 74: return lab([...fileJob("database-backup",
      `ssh peter@stdb01 'mysqldump appdb' > /tmp/app.sql\nscp /tmp/app.sql clint@stbkp01:${backup}\n`), steps[1]!],
      "Le build a transféré un dump SQL de appdb sur stbkp01", (w) => success(w, "database-backup") &&
        file(w, backup, "stbkp01")?.includes("CREATE DATABASE `appdb`;") === true, (w) => {
      const db = host(w, "stdb01");
      installPkg(db, "mariadb-server");
      db.db.databases.add("appdb");
      startSvc(w, db, "mariadb");
      seedKey(w, controller, "jenkins", "stdb01", "peter");
      seedKey(w, controller, "jenkins", "stbkp01", "clint");
      mkdirp(host(w, "stbkp01"), "/var/backups", "clint");
    });
    case 75: return lab([...login("stapp01", true), ...commands("yum install -y java-17-openjdk", "exit", "exit",
      "jenkins-cli create-node App_server_1 --host stapp01 --label app1 --remote-fs /home/tony/jenkins", steps[1]!.cmd)],
      "L’agent App_server_1 est en ligne sur stapp01 avec le label app1", (w) => {
        const agent = w.jenkins.nodes["App_server_1"];
        return !!agent?.online && agent.host === "stapp01" && agent.label === "app1";
      });
    case 76: return lab([...commands("jenkins-cli create-user sam Sam-Sim2026", "jenkins-cli create-user max Max-Sim2026",
      "jenkins-cli install-plugin matrix-auth", "jenkins-cli enable-matrix"), ...steps,
      ...commands("jenkins-cli grant-job Packages max Read")],
      "Sam peut lancer Packages et Max dispose de la lecture sur ce seul job", (w) =>
        w.jenkins.matrix && w.jenkins.jobPerms["Packages"]?.["sam"]?.join() === "Build" &&
        w.jenkins.jobPerms["Packages"]?.["max"]?.join() === "Read" &&
        !w.jenkins.users["sam"]?.perms.includes("Overall/Administer") && !w.jenkins.users["max"]?.perms.includes("Overall/Administer"),
      (w) => preload(w, "Packages", "echo packages\n"));
    case 77: return lab([...fileJob("xfusion-webapp-job", pipeline([{ name: "Deploy", cmd: `mkdir -p /tmp/deploy && echo Jelo > ${web}` }]),
      "pipeline", "Jenkinsfile"), steps[1]!], "Le pipeline Deploy a publié le site", (w) =>
      success(w, "xfusion-webapp-job") && file(w, web, controller) === "Jelo\n");
    case 78: return lab(steps, "Le build feature déploie feature et ignore master", (w) => {
      const build = w.jenkins.jobs["devops-webapp-job"]?.builds.at(-1);
      return !!build?.ok && build.params["BRANCH"] === "feature" && build.log.includes("Master — skipped") && file(w, "/tmp/deployed-branch", controller) === "feature\n";
    }, (w) => preload(w, "devops-webapp-job", pipeline([
      { name: "Master", cmd: "echo master > /tmp/deployed-branch", branch: "master" },
      { name: "Feature", cmd: "echo feature > /tmp/deployed-branch", branch: "feature" },
    ]), { type: "pipeline", params: { BRANCH: { type: "choice", default: "master", choices: ["master", "feature"] } } }));
    case 79: return lab([...cdProject(), ...commands("jenkins-cli set-trigger nautilus-app-deployment scm --repo /home/thor/project.git", steps[1]!.cmd)],
      "Le push sur master déclenche le job qui publie le site", (w) => w.jenkins.jobs["nautilus-app-deployment"]?.trigger === "scm" &&
        success(w, "nautilus-app-deployment") && file(w, web, controller) === "Jelo\n", (w) => {
      seedGit(w, day);
      preload(w, "nautilus-app-deployment", `mkdir -p /tmp/deploy && echo Jelo > ${web}\n`);
    });
    case 80: return lab([...steps, ...commands("jenkins-cli build nautilus-app-deployment")],
      "Le succès du job amont déclenche manage-services", (w) =>
      w.jenkins.jobs["nautilus-app-deployment"]?.downstream?.includes("manage-services") === true &&
      success(w, "nautilus-app-deployment") && success(w, "manage-services"), (w) => {
      preload(w, "nautilus-app-deployment", "echo deploy\n");
      preload(w, "manage-services", "echo service\n");
    });
    case 81: return lab(steps, "Les stages Deploy puis Test ont réussi", (w) => {
      const log = w.jenkins.jobs["deploy-job"]?.builds.at(-1)?.log ?? "";
      return success(w, "deploy-job") && log.indexOf("(Deploy)") >= 0 && log.indexOf("(Test)") > log.indexOf("(Deploy)") &&
        file(w, web, controller) === "Jelo\n";
    }, (w) => preload(w, "deploy-job", pipeline([
      { name: "Deploy", cmd: `mkdir -p /tmp/deploy && echo Jelo > ${web}` },
      { name: "Test", cmd: `grep Jelo ${web}` },
    ]), { type: "pipeline" }));
    default: throw new Error("Jour Jenkins inconnu");
  }
}
