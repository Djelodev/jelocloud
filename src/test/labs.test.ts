import { describe, expect, it } from "vitest";
import { LABS } from "@/lib/labs";
import { stepMatches } from "@/lib/simulator";

describe("Jelo Cloud labs", () => {
  it("contient exactement 100 jours", () => expect(LABS.map((l) => l.day)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1)));
  it("la solution de chaque étape valide l'étape", () => {
    for (const l of LABS) for (const s of l.steps) expect(stepMatches(s, s.cmd), `J${l.day} ${s.titre}`).toBe(true);
  });
});
