import { createUnknownFilePath as createPath } from "@romejs/path/index";
import { test } from "rome";

import { ProjectGraph } from "./project-graph";

test("bungo a project", (assert) => {
  const project = ProjectGraph.fromData({
    rootPath: createPath("/src/").assertAbsolute(),
    files: Object.entries({
      "/src/main.ts": `
        import "./cli.ts";
        import "./business.ts";
      `,
      "/src/cli.ts": `
        import "./string-utils.ts";
      `,
      "/src/tool.ts": `
        import "./math-utils.ts";
      `,
      "/src/math-utils.ts": `
        export sin = Math.sin;
      `,
      "/src/string-utils.ts": `
        export const EMPTY = "";
      `,
      "/src/business.ts": `
        import "./user.ts";
        import "./property.ts";
      `,
      "/src/user.ts": `
        import "./string-utils.ts";
      `,
      "/src/property.ts": `
        import "./math-utils.ts";
      `,
    }).map(([path, body]) => ({
      path: createPath(path).assertAbsolute(),
      body,
    })),
  });

  const expectedMoves = {
    "/src/tool.ts": "/src/tool.ts",
    "/src/math-utils.ts": "/src/math-utils.ts",
    "/src/main.ts": "/src/main.ts",
    "/src/cli.ts": "/src/main/cli.ts",
    "/src/string-utils.ts": "/src/main/string-utils.ts",
    "/src/business.ts": "/src/main/business.ts",
    "/src/user.ts": "/src/main/business/user.ts",
    "/src/property.ts": "/src/main/business/property.ts",
  };

  assert.is(
    project.updatedPaths,
    expectedMoves,
    "project must generate correct updated paths for all files"
  );

  for (const file of project.fileNodes.values()) {
    if (file.dependencies.size === 0 && file.dependents.size === 0) {
      console.log(`${file.originalPath} isn't connected to any other files.`);
    } else {
      if (file.dependencies.size === 0) {
        console.log(`${file.originalPath} is a leaf, with dependents:`);
      } else if (file.dependents.size === 0) {
        console.log(`${file.originalPath} is a root, with dependencies:`);
      } else {
        console.log(
          `${file.originalPath} has both dependents and dependencies:`
        );
      }

      if (file.dependencies.size > 0) {
        for (const dependency of file.dependencies.values()) {
          console.log(
            `  ${file.originalPath.getBasename()} ==> ${
              dependency.originalPath
            }`
          );
        }
      }

      if (file.dependents.size > 0) {
        for (const dependent of file.dependents.values()) {
          console.log(
            `  ${dependent.originalPath} ==> ${file.originalPath.getBasename()}`
          );
        }
      }
    }

    console.log();
  }
});

test("circular imports", (assert) => {});
