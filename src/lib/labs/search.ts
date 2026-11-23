import { LABS, MODULES } from "../labs";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const entries = LABS.map((lab) => ({
  lab,
  text: normalize(
    [
      lab.title,
      lab.objectif,
      lab.concept,
      MODULES.find((mod) => mod.id === lab.module)?.nom,
      ...lab.steps.map((step) => step.cmd),
    ].join(" "),
  ),
}));

export function searchLabs(query: string) {
  const text = normalize(query);
  const exactDay = /^(?:(?:jour|j)\s*)?0*(\d{1,3})$/.exec(text);
  if (exactDay) return LABS.filter((lab) => lab.day === Number(exactDay[1]));
  const words = text.split(/\s+/);
  return entries
    .filter((entry) => words.every((word) => entry.text.includes(word)))
    .map(({ lab }) => lab);
}
