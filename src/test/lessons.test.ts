import { describe, expect, it } from "vitest";
import { LABS } from "../lib/labs";
import { lessons } from "../lib/labs/lessons";
import { explainCommand } from "../lib/labs/lessons/commands";

describe("Les fiches pédagogiques", () => {
  it("couvrent chaque jour, chaque solution et chaque fichier", () => {
    expect(Object.keys(lessons)).toHaveLength(LABS.length);
    for (const lab of LABS) {
      const lesson = lessons[lab.day];
      const label = `Jour ${lab.day}`;
      expect(lesson, label).toBeDefined();
      for (const section of [lesson?.why, lesson?.expect, lesson?.alternative, lesson?.practice]) {
        expect(section, label).toBeTruthy();
      }
      for (const step of lab.steps) {
        const context = label + " · " + step.cmd;
        const { parts, missing } = explainCommand(step.cmd);
        expect(parts.length, context).toBeGreaterThan(0);
        expect(missing, context).toEqual([]);
        if (step.edit) expect(lesson?.files?.[step.edit.path], context).toBeTruthy();
      }
    }
  });

  it("distingue les options homonymes selon leur commande", () => {
    const option = (command: string, flag: string) =>
      explainCommand(command).parts.find((part) => part.text === flag)?.meaning;
    expect(option("useradd -e 2027-01-28 javed", "-e")).toContain("expiration");
    expect(option('mysql -e "SHOW DATABASES;"', "-e")).toContain("SQL");
    expect(option("docker build -t apache-app /opt/docker", "-t")).toContain("tag");
    expect(option("docker exec -it kkloud bash", "-it")).toContain("pseudo-terminal");
    expect(option("nginx -t", "-t")).toContain("configuration");
  });
});
