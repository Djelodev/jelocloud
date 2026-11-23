import { newWorld, type World } from "../engine";
import { CREDS, readFile } from "../engine/world";

export type Step = { titre: string; explication: string; cmd: string; edit?: { path: string; content: string } };
export type LabCheck = { label: string; test: (world: World) => boolean };
export type Scenario = { setup: (w: World) => void; steps: Step[]; checks: LabCheck[] };
export const host = (w: World, name = "jump_host") => w.hosts[name]!;
export const apps = ["stapp01", "stapp02", "stapp03"] as const;
export const file = (w: World, path: string, name = "jump_host") => readFile(host(w, name), path);
export const step = (cmd: string, titre: string, explication = ""): Step => ({ cmd, titre, explication });
export const edit = (path: string, content: string, cmd = "vi " + path): Step => ({
  ...step(cmd, "Modifier " + path, "Enregistre le contenu dans l’éditeur avant de continuer."),
  edit: { path, content },
});
export const scenario = (steps: Step[], checks: LabCheck[], setup: Scenario["setup"] = () => {}) => ({ steps, checks, setup });
export const check = (label: string, test: LabCheck["test"]): LabCheck => ({ label, test });
export const commands = (...list: string[]) => list.map((cmd) => step(cmd, cmd.split(" ").slice(0, 2).join(" ")));
export const login = (name: string, root = false) => [
  step(`ssh ${CREDS[name]!.user}@${name}`, "Connexion à " + name, "Utilise les identifiants du serveur dans le panneau."),
  ...root ? [step("sudo su -", "Passer root", "Élève tes privilèges sur le serveur cible.")] : [],
];
export function worldFor(lab: Scenario) {
  const w = newWorld();
  lab.setup(w);
  return w;
}
