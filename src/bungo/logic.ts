import { parseJS } from "@romejs/js-parser/index";
import { ImportDeclaration } from "@romejs/js-ast/index";
import {
  AbsoluteFilePath,
  createUnknownFilePath as createPath,
} from "@romejs/path/index";

import { ArrayElement } from "./useful-types";

export const bungo = () => {
  const project = ProjectGraph.fromData({
    rootPath: createPath("/src/").assertAbsolute(),
    files: Object.entries({
      "/src/main.ts": `
        import "./cli.ts";
        import "./business.ts";
      `,
      "/src/cli.ts": `
        import "./string-utils.ts";
      `,
      "/src/tool.ts": `
        import "./math-utils.ts";
      `,
      "/src/math-utils.ts": `
        export sin = Math.sin;
      `,
      "/src/string-utils.ts": `
        export const EMPTY = "";
      `,
      "/src/business.ts": `
        import "./user.ts";
      `,
      "/src/user.ts": `
        import "./string-utils.ts";
      `,
      "/src/property.ts": `
        export const name = "example";
      `,
    }).map(([path, body]) => ({
      path: createPath(path).assertAbsolute(),
      body,
    })),
  });

  const expectedMoves = {
    "/src/tool.ts": "/src/tool.ts",
    "/src/math-utils.ts": "/src/math-utils.ts",
    "/src/main.ts": "/src/main.ts",
    "/src/string-utils.ts": "/src/main/string-utils.ts",
    "/src/business.ts": "/src/main/business.ts",
    "/src/user.ts": "/src/business/user.ts",
    "/src/property.ts": "/src/business/property.ts",
  };

  for (const file of project.fileNodes.values()) {
    if (file.dependencies.size === 0 && file.dependents.size === 0) {
      console.warn(`${file.originalPath} isn't connected to any other files.`);
    } else {
      if (file.dependencies.size === 0) {
        console.info(`${file.originalPath} is a leaf (no dependencies).`);
      }
      if (file.dependents.size === 0) {
        console.info(`${file.originalPath} is a root (no dependents).`);
      }

      if (file.dependencies.size > 0) {
        console.debug(`${file.originalPath} depends on:`);
        for (const dependency of file.dependencies.values()) {
          console.debug(`  ${dependency.originalPath}`);
        }
      }
      if (file.dependents.size > 0) {
        console.debug(`${file.originalPath} is depended-on by:`);
        for (const dependent of file.dependents.values()) {
          console.debug(`  ${dependent.originalPath}`);
        }
      }
    }
    console.debug();
  }

  console.debug();

  return 0;
};

export class ProjectGraph {
  private constructor(
    readonly rootPath: AbsoluteFilePath,
    readonly fileNodes: Set<FileNode>,
    readonly dependencyEdges: Set<DependencyEdge>
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
