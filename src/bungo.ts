import { CWD_PATH } from "@romejs/path/index";
import { parseCLIFlagsFromProcess } from "@romejs/cli-flags";
import { createUnknownFilePath as createPath } from "@romejs/path/index";

import packageJson from "../package.json";

import { ProjectGraph } from "./bungo/project-graph";
import testCases from "./bungo/test-cases";

export const main = async (): Promise<undefined | number | void> => {
  const parser = parseCLIFlagsFromProcess({
    programName: packageJson.name,
    version: packageJson.version,
    defineFlags: (flagConsumer) => ({
      rootPath: CWD_PATH.resolve(
        flagConsumer
          .get("root", {
            description:
              "root path to modify, defaulting to working directory.",
          })
          .asString(".")
      ),
    }),
  });
  const flags = await parser.init();
  const args = parser.getArgs();

  if (args.length > 0) {
    console.error(`no arguments expected, got (${JSON.stringify(args)})`);
    return 1;
  }

  const project = ProjectGraph.fromData({
    rootPath: createPath("/src/").assertAbsolute(),
    files: Object.entries(testCases[0].original).map(([path, body]) => ({
      path: createPath(path).assertAbsolute(),
      body,
    })),
  });

  console.log(`
    digraph {
      rankdir=TB
      labelloc=T
      packMode=node
      ${[...project.dependencyEdges.values()]
        .map(
          (edge) =>
            `"${edge.dependentTail.originalPath.getBasename()}"->"${edge.dependencyHead.originalPath.getBasename()}"`
        )
        .join("\n")}
    }
`);

  return 0;
};

main().then(() => process.exit());
