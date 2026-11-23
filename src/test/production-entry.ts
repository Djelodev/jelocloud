import { LABS } from "../lib/labs";
import { runSolution } from "./lab-solution";

export function verify() {
  return LABS.map((lab) => {
    const { world } = runSolution(lab);
    return {
      day: lab.day,
      failed: lab.checks.filter((check) => !check.test(world)).map((check) => check.label),
    };
  });
}
