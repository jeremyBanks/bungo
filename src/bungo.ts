import { CWD_PATH } from "@romejs/path/index";
import { parseCLIFlagsFromProcess } from "@romejs/cli-flags";

import packageJson from "../package.json";
import { ProjectGraph } from "./bungo/project-graph";

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

  console.log(ProjectGraph);

  console.log("run tests instead");

  return 0;
};

main().then(() => process.exit());
