import { createUnknownFilePath as createPath } from "@romejs/path/index";
import { test } from "rome";

import { ProjectGraph } from "./project-graph";

import testCases from "./test-cases";


test(`bungo test cases`, async (assert) => {
for (const [name, testCase] of Object.entries(testCases)) {
    const project = ProjectGraph.fromData({
      rootPath: createPath("/").assertAbsolute(),
      files: Object.entries(testCase.input).map(([path, body]) => ({
        path: createPath(path).assertAbsolute(),
        body,
      })),
    });

    if (testCase.expectedMoves) {
      await assert.looksLike(project.updatedPaths, testCase.expectedMoves);
    } else {
      await assert.snapshot(project.updatedPaths);
    }

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
              `  ${
                dependent.originalPath
              } ==> ${file.originalPath.getBasename()}`
            );
          }
        }
      }

      console.log();
    }
}
  });
