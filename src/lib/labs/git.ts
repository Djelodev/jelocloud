import { mkCommit, newRepo, resolve, type Repo } from "../engine/git";
import { installPkg, mkdirp, writeFile } from "../engine/world";
import { check, commands, edit, host, scenario, type Step } from "./scenario";
import type { World } from "../engine";
import { repos } from "../engine/git";

const storage = "ststor01";
const main = "/home/thor/project";
const remote = "/home/thor/project.git";
const baseTree = { "README.md": "Jelo Cloud\n", "story-index.txt": "Stories\n" };
const repository = (w: World, path = main, where = "jump_host") => repos(host(w, where))[path];
const head = (r: Repo | undefined, ref = "master") => {
  const id = r && resolve(r, ref);
  return id ? r.commits[id] : undefined;
};
export function seedGit(w: World, day: number) {
  const h = host(w);
  const local = newRepo(h, main, false, "thor");
  const origin = newRepo(h, remote, true, "thor");
  const first = mkCommit(local, "add data.txt", baseTree, []);
  local.branches["master"] = origin.branches["master"] = first;
  origin.commits[first] = local.commits[first]!;
  local.remotes["origin"] = remote;
  local.config["user.name"] = "Thor";
  local.config["user.email"] = "thor@simulated.test";
  const commit = (r: Repo, branch: string, msg: string, tree: Record<string, string>, parent = r.branches[branch] ?? first) => {
    r.branches[branch] = mkCommit(r, msg, tree, [parent]);
    return r.branches[branch]!;
  };
  if (day === 27) {
    commit(local, "master", "Ajout obsolète", { ...baseTree, "obsolete.txt": "obsolete\n" });
  }
  if (day === 28) commit(local, "feature", "ajout feature", { ...baseTree, "feature.txt": "Fonctionnalité\n" });
  if (day === 29) commit(local, "story/fox-and-grapes", "add story", { ...baseTree, "fox.txt": "Fable\n" });
  if (day === 30) for (let n = 1; n <= 3; n++) commit(local, "master", "changement " + n, { ...baseTree, "data.txt": String(n) });
  if (day === 31) local.stash = [
    { msg: "WIP autre", tree: { ...baseTree, "other.txt": "autre" } },
    { msg: "WIP sauvegarde", tree: { ...baseTree, "notes.txt": "Notes sauvegardées\n" } },
  ];
  if (day === 32) {
    commit(local, "master", "améliorer master", { ...baseTree, "master.txt": "Master\n" });
    commit(local, "feature", "ajout feature", { ...baseTree, "feature.txt": "Fonctionnalité\n" });
    origin.branches["feature"] = local.branches["feature"]!;
  }
  if (day === 33) {
    commit(local, "master", "ajout local", { ...baseTree, "story-index.txt": "Stories\nLocal\n" });
    commit(origin, "master", "ajout distant", { ...baseTree, "story-index.txt": "Stories\nRemote\n" });
  }
  if (day === 34 || day === 79) commit(local, "master", "publication", { ...baseTree, "index.html": "<h1>Jelo Cloud</h1>\n" });
  if (day === 26) newRepo(h, "/opt/xfusioncorp_cluster.git", true, "thor");
  const tree = head(local)?.tree ?? {};
  local.index = { ...tree };
  for (const [name, contents] of Object.entries(tree)) writeFile(h, main + "/" + name, contents, "thor");
  if (day === 25) writeFile(h, main + "/index.html", "<h1>Jelo DevOps</h1>\n", "thor");
  if (day === 27 || day === 30 || day === 32) {
    origin.branches["master"] = local.branches["master"]!;
    Object.assign(origin.commits, local.commits);
  }
}
export const cdProject = () => commands("cd " + main);

export function git(day: number, steps: Step[]) {
  if (day === 21) return scenario(steps, [check("Dépôt bare /opt/cluster.git sur ststor01", (w) =>
    repository(w, "/opt/cluster.git", storage)?.bare === true)]);
  if (day === 22 || day === 24) {
    const path = "/usr/src/kodekloudrepos";
    return scenario(steps, [check(day === 22 ? "Le dépôt beta et son historique sont clonés" : "La branche xfusioncorp_apps part de master", (w) => {
      const r = repository(w, path + (day === 22 ? "/beta" : "/apps"), storage);
      if (day === 22) return !!r && r.remotes["origin"] === "/opt/beta.git" && head(r)?.msg === "initial";
      return !!r?.branches["master"] && r.branches["xfusioncorp_apps"] === r.branches["master"];
    })], (w) => {
      const h = host(w, storage);
      installPkg(h, "git");
      mkdirp(h, path, "natasha");
      const r = newRepo(h, day === 22 ? "/opt/beta.git" : path + "/apps", day === 22, "natasha");
      r.branches["master"] = mkCommit(r, "initial", baseTree, []);
      if (day === 24) {
        r.index = { ...baseTree };
        for (const [name, value] of Object.entries(baseTree)) writeFile(h, r.path + "/" + name, value, "natasha");
      }
    });
  }
  if (day === 23) return scenario(commands("tea login --user jon --password Jon_pass123", "tea repos fork sarah/story-blog"),
    [check("Le fork de sarah/story-blog appartient à jon", (w) => w.gitea.repos["jon/story-blog"]?.forkOf === "sarah/story-blog")],
    (w) => writeFile(host(w), "/usr/local/bin/tea", "tea", "root", 0o755));
  const r = (w: World) => repository(w, remote);
  const seeded = (sol: Step[], label: string, test: (w: World) => boolean) => scenario(
    [...cdProject(), ...sol], [check(label, test)], (w) => {
      seedGit(w, day);
      if (day === 29) writeFile(host(w), "/usr/local/bin/tea", "tea", "root", 0o755);
    });
  switch (day) {
    case 25: return seeded(steps, "Le changement de devops est fusionné dans master et publié", (w) => {
      const local = repository(w);
      const id = local?.branches["devops"];
      const published = head(r(w));
      return !!id && !!published?.tree["index.html"] &&
        (published.id === id || published.parents.includes(id)) && published.id === head(local)?.id;
    });
    case 26: return seeded(steps, "dev_cluster contient la branche master", (w) =>
      repository(w)?.remotes["dev_cluster"] === "/opt/xfusioncorp_cluster.git" &&
      head(repository(w, "/opt/xfusioncorp_cluster.git"))?.id === head(repository(w))?.id);
    case 27: return seeded(steps, "Le commit inverse est publié et conserve l’historique", (w) => {
      const commit = head(r(w));
      return !!commit?.msg.startsWith("Revert") && !commit.tree["obsolete.txt"] &&
        r(w)?.commits[commit.parents[0] ?? ""]?.tree["obsolete.txt"] !== undefined;
    });
    case 28: return seeded(steps.map((s) => s.cmd.includes("a1b2c3d") ? { ...s, cmd: "git cherry-pick feature" } : s),
      "Le changement de feature est publié avec un commit distinct", (w) => {
        const result = head(r(w));
        return result?.tree["feature.txt"] === "Fonctionnalité\n" && result.id !== head(repository(w), "feature")?.id;
      });
    case 29: return seeded([steps[0]!, ...commands(
      "tea login --user jon --password Jon_pass123",
      "tea pr create --base master --head story/fox-and-grapes --title 'Add fox story'",
      "tea pr review-request 1 --reviewer sarah",
      "tea login --user sarah --password Sarah_pass123",
      "tea pr merge 1",
    )], "La branche est publiée et la PR est fusionnée par la personne désignée", (w) =>
      !!r(w)?.branches["story/fox-and-grapes"] && w.gitea.prs.some((pr) => pr.head === "story/fox-and-grapes" &&
        pr.base === "master" && pr.reviewers.includes("sarah") && pr.merged));
    case 30: return seeded(steps, "master local et distant pointent sur add data.txt", (w) =>
      head(r(w))?.msg === "add data.txt" && head(r(w))?.id === head(repository(w))?.id);
    case 31: return seeded(steps, "Les notes du stash se trouvent dans le commit publié", (w) =>
      head(r(w))?.tree["notes.txt"] === "Notes sauvegardées\n");
    case 32: return seeded(steps, "feature est rejouée sur master sans commit de merge", (w) => {
      const feature = head(r(w), "feature");
      return feature?.parents.length === 1 && feature.parents[0] === head(repository(w))?.id &&
        !!feature.tree["feature.txt"] && !!feature.tree["master.txt"];
    });
    case 33: return seeded(steps.map((s) => s.cmd === "vi story-index.txt" ? edit("story-index.txt", "Stories\nLocal\nRemote\n") : s),
      "Le merge publié conserve les deux ajouts sans marqueurs de conflit", (w) => {
        const result = head(r(w));
        const content = result?.tree["story-index.txt"] ?? "";
        return result?.parents.length === 2 && content.includes("Local") && content.includes("Remote") && !content.includes("<<<<<<<");
      });
    case 34: return seeded([
      ...commands(`cp ${remote}/hooks/post-update.sample ${remote}/hooks/post-update`),
      edit(remote + "/hooks/post-update", "#!/bin/sh\ntest \"$1\" != refs/heads/master || git tag -f release master\n"),
      ...commands(`chmod +x ${remote}/hooks/post-update`, "git push origin master"),
    ], "Le hook distant exécutable a créé le tag release sur le commit publié", (w) =>
      !!head(r(w)) && r(w)?.tags["release"] === head(r(w))?.id &&
      !!((host(w).fs[remote + "/hooks/post-update"]?.mode ?? 0) & 0o100));
    default: throw new Error("Jour Git inconnu");
  }
}
