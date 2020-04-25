import { CWD_PATH } from "@romejs/path/index";
import { parseCLIFlagsFromProcess } from "@romejs/cli-flags";

import packageJson from "../package.json";
import { bungo } from "./bungo/logic";

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

  console.log(
    `if we were using real data it would come from ${flags.rootPath}`
  );

  await bungo();
};

main().then(() => process.exit());
