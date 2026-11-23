import { linuxLessons } from "./linux";
import { gitDockerLessons } from "./git-docker";
import { kubernetesLessons } from "./kubernetes";
import { automationLessons } from "./automation";
import type { Lesson } from "./types";

export const lessons: Partial<Record<number, Lesson>> = {
  ...linuxLessons,
  ...gitDockerLessons,
  ...kubernetesLessons,
  ...automationLessons,
};
