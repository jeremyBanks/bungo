import { CWD_PATH } from "@romejs/path/index";
import { parseCLIFlagsFromProcess } from "@romejs/cli-flags";
import {
  createUnknownFilePath as createPath,
  AbsoluteFilePath,
} from "@romejs/path/index";

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

  const files: Record<string, string> = {};

  const fs = require("fs");
  const walkDir = (path: AbsoluteFilePath) => {
    const contents = fs.readdirSync(path.toString(), {
      withFileTypes: true,
    });
    for (const entry of contents) {
      const entryPath = path.resolve("./" + entry.name);
      if (entry.isDirectory()) {
        walkDir(entryPath);
      } else if (entry.isFile()) {
        if (/\.(d\.ts|tsx?|jsx?|mjsx?)$/.test(entry.name)) {
          files[entryPath.toString()] = fs.readFileSync(
            entryPath.toString(),
            "utf8"
          );
        }
      }
    }
  };

  walkDir(flags.rootPath);

  const project = ProjectGraph.fromData({
    rootPath: flags.rootPath || createPath("/").assertAbsolute(),
    files: Object.entries(
      (flags.rootPath && files) || testCases["with a friend"].input
    ).map(([path, body]) => ({
      path: createPath(path).assertAbsolute(),
      body,
    })),
  });

  console.log(`
    digraph {
      rankdir=BT

      subgraph A {
        ${[...project.dependencyEdges.values()]
          .map(
            (edge) =>
              ` "${edge.dependentTail.originalPath.getBasename()}"->"${edge.dependencyHead.originalPath.getBasename()}"`
          )
          .join("\n")}
      }

      subgraph B {
        node [shape=box]
        edge [arrowhead=none]
        ${[...project.fileNodes.values()]
          .map((file) =>
            file.parent
              ? `"${file.parent.originalPath
                  .getBasename()
                  .replace(
                    /\.[^\.]+$/,
                    ""
                  )}" -> "${file.originalPath
                  .getBasename()
                  .replace(/\.[^\.]+$/, "")}"`
              : `"~/src" -> "${file.originalPath
                  .getBasename()
                  .replace(/\.[^\.]+$/, "")}"`
          )
          .join("\n")}
      }
    }
`);

  return 0;
};

main().then(() => process.exit());
