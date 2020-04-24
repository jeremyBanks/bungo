import { parseJS } from "@romejs/js-parser";

export class ProjectInput {
  readonly rootPath: string;
  readonly files: Record<string, string>;
  constructor(rootPath: string, files: Record<string, string>) {
    this.rootPath = rootPath;
    this.files = files;
  }
}

/**
 * What is our logic?
 * 
 * Do we want to trace re-exports?
 * Maybe yes if it's simple even if we don't want to use that yet.
 * 
 */
const testCases: Array<[ProjectInput, Record<string, string>]> = [
  [
    new ProjectInput(
      "/home/user/src/",
      {
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
      }
    ),
    {
      "/home/user/src/index.ts": "/home/user/src/index.ts",
      "/home/user/src/child.ts": "/home/user/src/index/child.ts",
      "/home/user/src/hack.ts": "/home/user/src/index/child/hack.ts",
    }
  ]
];

for (const [project, expected] of testCases) {
  console.log({ project, expected });
  console.log({ files: project.files, rootPath: project.rootPath });
  for (const [name, contents] of Object.entries(project.files)) {
    console.log({ name, contents });
    console.log(parseJS({ path: name, input: contents }));
  }
}

process.exit();
