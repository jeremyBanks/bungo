import { parseJS } from "@romejs/js-parser/index";
import { ImportDeclaration } from "@romejs/js-ast/index";
import { AbsoluteFilePath } from "@romejs/path/index";

import { ArrayElement } from "./useful-types";

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
    readonly originalPath: AbsoluteFilePath,
    readonly originalBody: string,
    readonly dependencies: Set<FileNode> = new Set(),
    readonly dependents: Set<FileNode> = new Set(),
    public parent: FileNode | undefined = undefined
  ) {
    this.originalPath = originalPath;
    this.originalBody = originalBody;
    this.dependencies = dependencies;
    this.dependents = dependents;
    this.parent = parent;
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
