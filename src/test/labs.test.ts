import { describe, expect, it } from "vitest";
import { Shell } from "../lib/engine";
import { LABS, getLab } from "../lib/labs";
import { worldFor } from "../lib/labs/scenario";
import { runLine, runSolution } from "./lab-solution";

const diagnosticFailures: Record<number, string[]> = {
  9: ["systemctl status mariadb"],
  14: ["ps aux | grep httpd", "systemctl status httpd"],
  33: ["git pull origin master"],
  86: ["ansible all -i inventory -m ping"],
};

describe("Jelo Cloud", () => {
  it("contient les 100 jours", () => {
    expect(LABS.map((lab) => lab.day)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
  });

  it.each(LABS)("J$day — $title", (lab) => {
    const fresh = worldFor(lab);
    expect(lab.checks.length).toBeGreaterThan(0);
    expect(lab.checks.every((check) => check.test(fresh))).toBe(false);
    const { world, results } = runSolution(lab);
    const missing = lab.checks.filter((check) => !check.test(world)).map((check) => check.label);
    const errors = results.filter((result) => result.code);
    const output = errors.map((result) => result.step.cmd + "\n" + result.out).join("\n\n");
    expect(missing, output).toEqual([]);
    expect(errors.map(({ step }) => step.cmd), output).toEqual(diagnosticFailures[lab.day] ?? []);
  });

  it("refuse Tony sur stapp02 et conserve la session du jump host", () => {
    const shell = new Shell(worldFor(getLab(1)!));
    const result = runLine(shell, "ssh tony@stapp02", undefined, "Ir0nM@n");
    expect(result.code).toBe(255);
    expect(result.out).toContain("Permission denied");
    expect(shell.f.host.name).toBe("jump_host");
  });

  it("ne valide pas un compte créé sur le mauvais serveur", () => {
    const lab = getLab(1)!;
    const world = worldFor(lab);
    const shell = new Shell(world);
    expect(runLine(shell, "ssh steve@stapp02").code).toBe(0);
    expect(runLine(shell, "sudo useradd -s /sbin/nologin yousuf").code).toBe(0);
    expect(lab.checks[0]!.test(world)).toBe(false);
    expect(runLine(shell, "ssh tony@stapp01").code).toBe(0);
    expect(runLine(shell, "sudo useradd -s /sbin/nologin yousuf").code).toBe(0);
    expect(lab.checks[0]!.test(world)).toBe(true);
    expect(runLine(shell, "sudo userdel yousuf").code).toBe(0);
    expect(lab.checks[0]!.test(world)).toBe(false);
  });

  it("refuse un montage Kubernetes sans volume et signale une image inconnue", () => {
    const world = worldFor(getLab(48)!);
    const shell = new Shell(world);
    const manifest = "apiVersion: v1\nkind: Pod\nmetadata: {name: broken}\nspec:\n  containers:\n    - name: web\n      image: nginx\n      volumeMounts: [{name: missing, mountPath: /data}]\n";
    expect(runLine(shell, "vi invalid.yaml", manifest).code).toBe(0);
    expect(runLine(shell, "kubectl apply -f invalid.yaml").out).toContain("volumeMounts: Not found");
    expect(runLine(shell, "kubectl run unknown --image=missing:latest").code).toBe(0);
    expect(runLine(shell, "kubectl get pod unknown").out).toContain("ImagePullBackOff");
  });

  it("signale un hôte Ansible inaccessible avec le mauvais mot de passe", () => {
    const shell = new Shell(worldFor(getLab(86)!));
    const result = runLine(shell, "ansible all -i inventory -m ping");
    expect(result.code).toBe(4);
    expect(result.out).toContain("stapp03 | UNREACHABLE");
  });

  it("demande l’initialisation et la confirmation avant de modifier l’état Terraform", () => {
    const lab = getLab(94)!;
    const world = worldFor(lab);
    const shell = new Shell(world);
    expect(runLine(shell, "vi main.tf", lab.steps[0]!.edit!.content).code).toBe(0);
    expect(runLine(shell, "terraform apply -auto-approve").code).toBe(1);
    expect(runLine(shell, "terraform init").code).toBe(0);
    const pending = shell.line("terraform apply");
    expect(pending.next().value).toMatchObject({ kind: "confirm" });
    expect(pending.next("no").value).toMatchObject({ code: 1 });
    expect(world.aws.resources).toEqual({});
    expect(runLine(shell, "terraform apply").code).toBe(0);
    expect(lab.checks[0]!.test(world)).toBe(true);
    expect(runLine(shell, "terraform destroy -auto-approve").code).toBe(0);
    expect(lab.checks[0]!.test(world)).toBe(false);
  });
});
