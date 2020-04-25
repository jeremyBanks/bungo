import { parseJS } from "@romejs/js-parser/index";
import { ImportDeclaration } from "@romejs/js-ast/index";
import {
  AbsoluteFilePath,
  createUnknownFilePath,
  CWD_PATH
} from "@romejs/path/index";
import { parseCLIFlagsFromProcess } from "@romejs/cli-flags";

import packageJson from "../package.json";

// see https://github.com/Shopify/quilt/blob/master/packages/useful-types/src/types.ts
export type ArrayElement<T> = T extends Array<infer U> ? U : never;

export const main = async (): Promise<undefined | number | void> => {
  const parser = parseCLIFlagsFromProcess({
    programName: packageJson.name,
    version: packageJson.version,
    defineFlags: flagConsumer => ({
      rootPath: CWD_PATH.resolve(
        flagConsumer
          .get("root", {
            description: "root path to modify, defaulting to working directory."
          })
          .asString(".")
      )
    })
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

  const input = {
    root: "/home/jeremy/src/",
    files: {
      "/home/jeremy/src/index.ts": `
        import x from "./child.ts"
        export default {};
      `,
      "/home/jeremy/src/child.ts": `
        import {x} from "./hack.ts"
        export default {};
      `,
      "/home/jeremy/src/hack.ts": `
        export const x = 2;
      `
    },
    expectedMoves: {
      "/home/jeremy/src/index.ts": "/home/jeremy/src/index.ts",
      "/home/jeremy/src/child.ts": "/home/jeremy/src/index/child.ts",
      "/home/jeremy/src/hack.ts": "/home/jeremy/src/index/child/hack.ts"
    }
  };

  const inputFiles: Array<{
    path: AbsoluteFilePath;
    body: string;
  }> = Object.entries(input.files).map(([path, body]) => ({
    path: createUnknownFilePath(path).assertAbsolute(),
    body
  }));

  // adds all of the imported paths as they are listed in the file
  const withImportedPaths = inputFiles.map(file => {
    const program = parseModule(file.body, file.path.toString());
    const imports = program.body.filter(
      x => x.type === "ImportDeclaration"
    ) as Array<ImportDeclaration>;
    const importedPaths = new Set(imports.map(x => x.source.value));
    return {
      ...file,
      importedPaths
    };
  });

  // adds all of the dependency paths from absolute paths resolved from relative imports (and package imports ignored)
  const withDependencyPaths = withImportedPaths.map(file => ({
    ...file,
    dependencyPaths: new Set(
      [...file.importedPaths]
        .filter(x => x.startsWith("./") || x.startsWith("../"))
        .map(x => file.path.resolve(x))
    )
  }));

  const byDependencies: Map<Readonly<typeof withDependencyPaths[0]>, Set<Readonly<typeof withDependencyPaths[0]>>> = new Map();

  // Is there a stable configuration? how many times do we need to iterate this?
  // I guess we start with the abstract graph and work from there
  // don't index on the original names at all, just keep them for reference.

  const withDependentPaths = withDependencyPaths.map(file => ({
    ...file,

  }));

  // TODO
  const withNewPath = withDependencyPaths.map(file => ({
    ...file,
    newPath: file.path
  }));

  // TODO
  const withNewBody = withNewPath.map(file => ({
    ...file,
    newBody: file.body
  }));

  const files = withNewBody as Readonly<
    Array<
      Readonly<{
        path: AbsoluteFilePath;
        body: string;
        newPath: AbsoluteFilePath;
        newBody: string;
        importedPaths: Set<string>;
        dependencyPaths: Set<AbsoluteFilePath>;
      }>
    >
  >;

  console.log(
    files.map(file => ({
      path: file.path.toString(),
      dependencyPaths: [...file.dependencyPaths].map(x => x.toString())
    }))
  );
};

const parseModule = (input: string, path: string = "module.ts") =>
  parseJS({
    sourceType: "module",
    input,
    path
  });

main().then(() => process.exit());
