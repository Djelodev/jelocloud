// @vitest-environment node
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import { expect, it } from "vitest";

it("exécute les 100 solutions dans le moteur minifié de production", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jelo-bundle-"));
  try {
    const built = await build({
      configFile: false,
      logLevel: "silent",
      build: {
        write: false,
        minify: true,
        lib: {
          entry: resolve("src/test/production-entry.ts"),
          formats: ["cjs"],
          fileName: () => "labs.cjs",
        },
      },
    });
    const output = Array.isArray(built) ? built[0] : built;
    if (!output || !("output" in output)) throw new Error("Bundle Vite introuvable");
    for (const file of output.output) {
      if (file.type === "chunk") await writeFile(join(dir, file.fileName), file.code);
    }
    const { verify } = createRequire(import.meta.url)(join(dir, "labs.cjs"));
    const actual: unknown = verify();
    expect(actual).toEqual(
      Array.from({ length: 100 }, (_, index) => ({ day: index + 1, failed: [] })),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
