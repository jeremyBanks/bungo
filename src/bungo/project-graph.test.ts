import { createUnknownFilePath as createPath } from "@romejs/path/index";
import { test } from "rome";

import { ProjectGraph } from "./project-graph";

test("bungo a project", (t) => {
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
        export const name = "example";
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
    "/src/string-utils.ts": "/src/main/string-utils.ts",
    "/src/business.ts": "/src/main/business.ts",
    "/src/user.ts": "/src/business/user.ts",
    "/src/property.ts": "/src/business/property.ts",
  };

  for (const file of project.fileNodes.values()) {
    if (file.dependencies.size === 0 && file.dependents.size === 0) {
      console.warn(`${file.originalPath} isn't connected to any other files.`);
    } else {
      if (file.dependencies.size === 0) {
        console.info(`${file.originalPath} is a leaf, with dependents:`);
      } else if (file.dependents.size === 0) {
        console.info(`${file.originalPath} is a root, with dependencies:`);
      } else {
        console.info(
          `${file.originalPath} has both dependents and dependencies:`
        );
      }

      if (file.dependencies.size > 0) {
        for (const dependency of file.dependencies.values()) {
          console.debug(
            `  ${file.originalPath.getBasename()} ==> ${
              dependency.originalPath
            }`
          );
        }
      }

      if (file.dependents.size > 0) {
        for (const dependent of file.dependents.values()) {
          console.debug(
            `  ${dependent.originalPath} ==> ${file.originalPath.getBasename()}`
          );
        }
      }
    }

    console.debug();
  }
});
