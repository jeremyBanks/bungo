import { parseJS } from "@romejs/js-parser/index";
import { ImportDeclaration } from "@romejs/js-ast/index";
import { AbsoluteFilePath } from "@romejs/path/index";

import { ArrayElement } from "./useful-types";

export class ProjectGraph {
  private constructor(
    // project root path, imports outside of this will be ignored.
    readonly rootPath: AbsoluteFilePath,
    // all files in the project
    readonly fileNodes: Set<FileNode>,
    // all imports in the project
    readonly dependencyEdges: Set<DependencyEdge>
  ) {
    this.rootPath = rootPath;
    this.fileNodes = fileNodes;
    this.dependencyEdges = dependencyEdges;
  }

  public static fromData({
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
      const program = parseJS({
        sourceType: "module",
        input: file.originalBody,
        path,
      });

      const imports = program.body.filter(
        (x) => x.type === "ImportDeclaration"
      ) as Array<ImportDeclaration>;

      const importedPaths = new Set(
        imports
          .map((x) => x.source.value)
          .filter((x) => x.startsWith("./") || x.startsWith("../"))
      );

      const dependencyPaths = new Set(
        [...importedPaths].map((x) =>
          file.originalPath.getParent().resolve(x).toString()
        )
      );

      for (const path of dependencyPaths) {
        const dependency = fileNodesByOriginalPath.get(path);

        if (!dependency) {
          throw new Error(`could not import ${path}`);
        }

        file.dependencies.add(dependency);
        dependency.dependents.add(file);
        dependencyEdges.add(new DependencyEdge(dependency, file, path));
      }
    }

    const fileNodes = new Set(fileNodesByOriginalPath.values());
    return new ProjectGraph(rootPath, fileNodes, dependencyEdges);
  }

  public updatedPaths(): Record<string, string> {
    const moves: Record<string, string> = {};
    for (const files of this.fileNodes) {
      const path = files.originalPath.toString();
      moves[path] = path;
    }
    return moves;
  }
}

class FileNode {
  public constructor(
    // original absolute path of this file
    readonly originalPath: AbsoluteFilePath,
    // original source code body of this file
    readonly originalBody: string,
    // dependencies that this file imports
    readonly dependencies: Set<FileNode> = new Set(),
    // dependents that import this file
    readonly dependents: Set<FileNode> = new Set(),
    // parent of module, or undefined for root pseudo-parentt
    public parent: FileNode | undefined = undefined,
    // minimum number of edges between root (undefined pseudo-parent) and this node
    public depth: number = Infinity
  ) {
    this.originalPath = originalPath;
    this.originalBody = originalBody;
    this.dependencies = dependencies;
    this.dependents = dependents;
    this.parent = parent;
    this.depth = Infinity;
  }
}

class DependencyEdge {
  public constructor(
    // the file being imported
    readonly dependencyHead: FileNode,
    // the file doing the importing
    readonly dependentTail: FileNode,
    // the import path string literal that existed in the file, which we may replace.
    readonly importLiteral: string
  ) {
    this.dependencyHead = dependencyHead;
    this.dependentTail = dependentTail;
    this.importLiteral = importLiteral;
  }
}
