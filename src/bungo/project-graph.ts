import { parseJS } from "@romejs/js-parser/index";
import { ImportDeclaration } from "@romejs/js-ast/index";
import { AbsoluteFilePath } from "@romejs/path/index";

import { ArrayElement } from "./useful-types";

const isRelativePath = (path: string) => {
  return (
    path.startsWith("./") || path.startsWith("../") || path.startsWith("/")
  );
};

export class ProjectGraph {
  private constructor(
    // project root path, imports outside of this will be ignored.
    readonly rootPath: AbsoluteFilePath,
    // all files in the project
    readonly fileNodes: Set<FileNode>,
    // all imports in the project
    readonly dependencyEdges: Set<DependencyEdge>,
    readonly updatedPaths: Record<string, string>
  ) {
    this.rootPath = rootPath;
    this.fileNodes = fileNodes;
    this.dependencyEdges = dependencyEdges;
    this.updatedPaths = updatedPaths;
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
      console.log(`// scanning ${path.toString()}`);
      const program = parseJS({
        sourceType: "module",
        syntax: ["ts", "jsx"],
        input: file.originalBody,
        path,
      });
      console.log("// parsed");

      const imports = program.body.filter(
        (x) => x.type === "ImportDeclaration"
      ) as Array<ImportDeclaration>;

      const importedPaths = new Set(
        imports.map((x) => x.source.value).filter(isRelativePath)
      );

      const dependencyPaths = new Set(
        [...importedPaths]
          .map((x) => file.originalPath.getParent().resolve(x).toString())
          .filter((path) => path.startsWith(rootPath))
      );

      for (const path of dependencyPaths) {
        console.warn(`// looking for ${path}`);

        let dependency;
        for (const potentialPath of [
          path,
          path + ".d.ts",
          path + ".ts",
          path + ".js",
          path + ".tsx",
          path + ".jsx",
          path + "/index.d.ts",
          path + "/index.ts",
          path + "/index.js",
          path + "/index.tsx",
          path + "/index.jsx",
        ]) {
          dependency = fileNodesByOriginalPath.get(potentialPath);
          if (dependency) {
            break;
          }
        }

        if (!dependency) {
          console.warn(
            `// could not find import ${path} from ${file.originalPath.toString()}`
          );
          continue;
        }

        file.dependencies.add(dependency);
        dependency.dependents.add(file);
        dependencyEdges.add(new DependencyEdge(dependency, file, path));
      }
    }

    console.log(`// scanning complete. walking all nodes to figure out paths.`);

    const fileNodes = new Set(fileNodesByOriginalPath.values());

    const walkNode = (node: FileNode, parent?: FileNode) => {
      console.log(
        `// ${node.originalPath.toString()} from ${
          (node.parent && node.parent.originalPath.toString()) || "root"
        }`
      );
      if (node.depth === Infinity) {
        // this node hasn't been visited yet.
        node.parent = parent;
        node.depth = parent ? parent.depth + 1 : 0;

        for (const child of node.dependencies) {
          walkNode(child, node);
        }
      } else {
        // this node has already been visited.
        if (parent === undefined) {
          throw new Error("sanity check failed: visiting a root node twice");
        }
        // we need to set its parent to the nearest ancestor
        // of the current parent and the new parent.
        // we can do that using their depth to walk back to the same level and
        // then step each back from there.
        let newParent;
        let aParent: FileNode | undefined = node.parent;
        let bParent: FileNode | undefined = parent;
        while (true) {
          if (aParent === undefined || bParent === undefined) {
            // promote to root package if it has dependents in multiple root packages.
            newParent = undefined;
            break;
          } else if (aParent === bParent) {
            // common ancestor!
            newParent = aParent;
            break;
          } else if (aParent.depth > bParent.depth) {
            aParent = aParent.parent;
            continue;
          } else if (bParent.depth > aParent.depth) {
            bParent = bParent.parent;
            continue;
          } else {
            aParent = aParent.parent;
            bParent = bParent.parent;
            continue;
          }
          throw new Error("unreachable");
        }
        const newDepth = newParent ? newParent.depth + 1 : 0;
        if (newDepth < node.depth) {
          node.parent = newParent;
          node.depth = newDepth;

          // We have already walked this, but we need to do it again with the new depth.
          for (const child of node.dependencies) {
            walkNode(child, node);
          }
        }
      }
    };

    for (const root of [...fileNodes].filter(
      (file) => file.dependents.size === 0
    )) {
      walkNode(root);
    }
    const updatedPaths: Record<string, string> = {};

    const walkUpdatingPaths = (node: FileNode, parentPath: string) => {
      const path = `${parentPath}/${node.originalPath.getBasename()}`;
      updatedPaths[node.originalPath.toString()] = path;
      for (const child of [...fileNodes].filter(
        (file) => file.parent === node
      )) {
        walkUpdatingPaths(child, path.split(/\./)[0]);
      }
    };

    for (const root of [...fileNodes].filter(
      (file) => file.parent === undefined
    )) {
      walkUpdatingPaths(root, rootPath.toString().replace(/\/$/, ""));
    }

    return new ProjectGraph(rootPath, fileNodes, dependencyEdges, updatedPaths);
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
    this.depth = depth;
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
