import { parseJS } from "@romejs/js-parser/index";
import { ImportDeclaration } from "@romejs/js-ast/index";
import {
  AbsoluteFilePath,
  createUnknownFilePath as createPath,
} from "@romejs/path/index";

import { ArrayElement } from "./useful-types";

export const bungo = () => {
  const project = ProjectGraph.fromData({
    rootPath: createPath("/home/jeremy/src/").assertAbsolute(),
    files: Object.entries({
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
    `,
    }).map(([path, body]) => ({
      path: createPath(path).assertAbsolute(),
      body,
    })),
  });

  const expectedMoves = {
    "/home/jeremy/src/index.ts": "/home/jeremy/src/index.ts",
    "/home/jeremy/src/child.ts": "/home/jeremy/src/index/child.ts",
    "/home/jeremy/src/hack.ts": "/home/jeremy/src/index/child/hack.ts",
  };

  console.log(project);
  return 0;
};

export class ProjectGraph {
  private constructor(
    private rootPath: AbsoluteFilePath,
    private fileNodes: Set<FileNode>,
    private dependencyEdges: Set<DependencyEdge>
  ) {
    this.rootPath = rootPath;
    this.fileNodes = fileNodes;
    this.dependencyEdges = dependencyEdges;
  }

  static fromData({
    rootPath,
    files,
  }: {
    rootPath: AbsoluteFilePath;
    files: Array<{ path: AbsoluteFilePath; body: string }>;
  }) {
    const fileNodesByOriginalPath: Map<string, FileNode> = new Map();
    for (const { path, body } of files) {
      const file = new FileNode(path, body);
      fileNodesByOriginalPath.set(path.toString(), file);
    }

    const dependencyEdges: Set<DependencyEdge> = new Set();
    for (const [path, file] of fileNodesByOriginalPath.entries()) {
      const program = parseModule(file.originalBody, path);
      const imports = program.body.filter(
        (x) => x.type === "ImportDeclaration"
      ) as Array<ImportDeclaration>;

      const importedPaths = new Set(imports.map((x) => x.source.value));

      const dependencyPaths = new Set(
        [...importedPaths]
          .filter((x) => x.startsWith("./") || x.startsWith("../"))
          .map((x) => file.originalPath.getParent().resolve(x).toString())
      );

      const dependencies = new Set(
        [...dependencyPaths].map((path) => {
          const file = fileNodesByOriginalPath.get(path);

          if (!file) {
            throw new Error(`could not import ${path}`);
          }

          return file;
        })
      );

      for (const dependency of dependencies) {
        file.dependencies.add(dependency);
        dependency.dependents.add(file);
        dependencyEdges.add(new DependencyEdge(dependency, file));
      }
    }

    const fileNodes = new Set(fileNodesByOriginalPath.values());
    return new ProjectGraph(rootPath, fileNodes, dependencyEdges);
  }
}

class FileNode {
  public constructor(
    readonly originalPath: AbsoluteFilePath,
    readonly originalBody: string,
    readonly dependencies: Set<FileNode> = new Set(),
    readonly dependents: Set<FileNode> = new Set()
  ) {
    this.originalPath = originalPath;
    this.originalBody = originalBody;
    this.dependencies = dependencies;
    this.dependents = dependents;
  }
}

class DependencyEdge {
  public constructor(
    readonly dependencyHead: FileNode,
    readonly dependentTail: FileNode
  ) {
    this.dependencyHead = dependencyHead;
    this.dependentTail = dependentTail;
  }
}

const parseModule = (input: string, path: string = "module.ts") =>
  parseJS({
    sourceType: "module",
    input,
    path,
  });
