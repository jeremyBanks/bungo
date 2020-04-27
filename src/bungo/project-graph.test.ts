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
  }
});
