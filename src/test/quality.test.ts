import { describe, expect, it } from "vitest";
import { Shell, newWorld } from "../lib/engine";
import { getLab } from "../lib/labs";
import { worldFor } from "../lib/labs/scenario";
import { searchLabs } from "../lib/labs/search";
import { parseProgress } from "../lib/progress";
import { runLine, runSolution } from "./lab-solution";

describe("Recherche et progression", () => {
  it.each(["94", "J94", "Jour 094"])("ouvre le jour demandé par %s", (query) => {
    expect(searchLabs(query).map((lab) => lab.day)).toEqual([94]);
  });

  it("trouve les mots sans que les accents ou la casse soient nécessaires", () => {
    expect(searchLabs("depanner MARIADB").map((lab) => lab.day)).toContain(9);
    expect(searchLabs("git merge").map((lab) => lab.day)).toContain(25);
    expect(searchLabs("aucun-lab-qa")).toEqual([]);
  });

  it("ne charge que les jours valides et uniques", () => {
    expect(parseProgress('[2,2,1,0,101,"3",2.5]')).toEqual([1, 2]);
    expect(parseProgress("null")).toEqual([]);
    expect(parseProgress('{"day":1}')).toEqual([]);
    expect(parseProgress("[")).toEqual([]);
  });
});

describe("Cas d’erreur du terminal", () => {
  it.each([
    "| echo invalide",
    "echo invalide |",
    "echo invalide &&",
    "echo invalide > | cat",
    "touch /tmp/qa && ; echo invalide",
    "touch /tmp/qa; echo invalide >",
  ])("refuse %s avant toute modification", (command) => {
    const world = newWorld();
    const result = runLine(new Shell(world), command);
    expect(result).toMatchObject({ code: 2, out: expect.stringContaining("syntax error") });
    expect(world.hosts["jump_host"]!.fs["/tmp/qa"]).toBeUndefined();
  });

  it("which et l’exécution signalent la même disponibilité sur l’hôte", () => {
    const empty = new Shell(newWorld());
    expect(runLine(empty, "which kubectl").code).toBe(1);
    expect(runLine(empty, "kubectl version").code).toBe(127);
    expect(runLine(empty, "which ssh").out).toBe("/usr/bin/ssh");
    const k8s = new Shell(worldFor(getLab(48)!));
    expect(runLine(k8s, "which kubectl").out).toBe("/usr/local/bin/kubectl");
  });

  it("un batch SQL s’arrête en cas d’erreur et garde les points-virgules entre guillemets", () => {
    const { world } = runSolution(getLab(18)!);
    const shell = new Shell(world, "stdb01", "root");
    const result = runLine(
      shell,
      `mysql -e "CREATE USER qa IDENTIFIED BY 'a;b'; INVALID SQL; CREATE DATABASE skip_me;"`,
    );
    expect(result.code).toBe(1);
    expect(result.out).toContain("ERROR");
    expect(world.hosts["stdb01"]!.db.users["qa"]).toBe("a;b");
    expect(world.hosts["stdb01"]!.db.databases.has("skip_me")).toBe(false);
  });
});
