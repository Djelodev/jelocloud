export type Lesson = {
  why: string;
  expect: string;
  alternative: string;
  practice: string;
  files?: Record<string, string>;
};

export const lesson = (
  why: string,
  expect: string,
  alternative: string,
  practice: string,
  files?: Lesson["files"],
): Lesson => ({ why, expect, alternative, practice, ...(files ? { files } : {}) });
