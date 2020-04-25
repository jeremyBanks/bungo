import { parseJS } from "@romejs/js-parser/index";
import {
  RelativeFilePath,
  AbsoluteFilePath,
  URLFilePath,
  UnknownFilePath,
  maybeCreateAbsoluteFilePath,
  createUnknownFilePath,
  CWD_PATH
} from "@romejs/path/index";
import { parseCLIFlagsFromProcess } from '@romejs/cli-flags';

export const main = async (): Promise<undefined | number | void> => {
  const rootPath = CWD_PATH.resolve("src");
  console.log(`if we were using real data it would come from ${rootPath}`);

  const input = {
    root: "/home/user/src/",
    files: {
      "/home/user/src/index.ts": `
        import x from "./child.ts"
        export default {};
      `,
      "/home/user/src/child.ts": `
        import {x} from "./hack.ts"
        export default {};
      `,
      "/home/user/src/hack.ts": `
        export const x = 2;
      `
    },
    expectedMoves: {
      "/home/user/src/index.ts": "/home/user/src/index.ts",
      "/home/user/src/child.ts": "/home/user/src/index/child.ts",
      "/home/user/src/hack.ts": "/home/user/src/index/child/hack.ts"
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
  const withImportedPaths = inputFiles.map(file => ({
    ...file,
    importedPaths: new Set()
  }));

  // adds all of the dependency paths from absolute paths resolved from relative imports (and package imports ignored)
  const withDependencyPaths = withImportedPaths.map(file => ({
    ...file,
    dependencyPaths: new Set()
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
        importedPaths: Set<UnknownFilePath>;
        dependencyPaths: Set<AbsoluteFilePath>;
      }>
    >
  >;

  console.log(files);
};

const parseModule = (input: string, path: string = "module.ts") =>
  parseJS({
    sourceType: "module",
    input,
    path
  });

// // Should this be package-aware? Modify behaviour when it sees a directory with a package.json?

// export class ProjectInput {
//   public readonly rootPath: string;
//   public readonly files: Map<string, File>;

//   constructor(rootPath: string, files: Record<string, string>) {
//     this.rootPath = rootPath;
//     const filesByOriginalPath = new Map();
//     for (const [path, contents] of Object.entries(files)) {
//   }
// }

// export class File {
//   private readonly originalPath: string;
//   private readonly originalBody: string;
//   private finalPath: string = this.originalPath;
//   private finalBody: string = this.originalBody;
//   public readonly dependents: Set<Ref<File>> = new Set();
//   public readonly dependencies: Set<Ref<File>> = new Set();

//   constructor(originalPath: string, originalBody: string) {
//     this.originalPath = originalPath;
//     this.originalBody = originalBody;
//   }
// }

/**
 * What is our logic?
 *
 * Do we want to trace re-exports?
 * Maybe yes if it's simple even if we don't want to use that yet.
 *
 */
// const testCases: Array<[ProjectInput, Record<string, string>]> = [

main().then(() => process.exit());

