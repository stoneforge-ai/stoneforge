import fs from "node:fs";
import path from "node:path";

const namedReExportPattern =
  /\bexport\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']\.\/([^"']+)\.js["']/g;
const starReExportPattern = /\bexport\s+\*\s+from\s+["']\.\/([^"']+)\.js["']/g;

export function packageIndexPaths(root, codeRoots) {
  return codeRoots.flatMap((codeRoot) => {
    return packageDirectories(path.join(root, codeRoot))
      .map((packageDir) => path.join(packageDir, "src", "index.ts"))
      .filter((indexPath) => fs.existsSync(indexPath));
  });
}

export function packageInterfaceNames(indexPath) {
  return new Set([
    ...namedExportNames(read(indexPath)),
    ...starExportNames(indexPath),
  ]);
}

export function publicModulesForIndex(indexPath) {
  return [
    ...moduleNamesForPattern(read(indexPath), starReExportPattern),
    ...moduleNamesForPattern(read(indexPath), namedReExportPattern),
  ];
}

export function exportedNamesFromText(text) {
  return [...text.matchAll(/\bexport\s+(?:abstract\s+)?(?:class|function|interface|type|const|enum)\s+([A-Z_a-z]\w*)/g)].map(
    (match) => match[1],
  );
}

export function moduleNameForImport(importPath) {
  return path.basename(importPath, ".js");
}

export function relativeImportsFor(filePath) {
  return [...read(filePath).matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)].map(
    (match) => match[1],
  );
}

export function resolveImport(fromPath, importPath) {
  const withoutExtension = path.resolve(path.dirname(fromPath), importPath);
  const candidates = [
    withoutExtension,
    `${withoutExtension}.ts`,
    `${withoutExtension}.mjs`,
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function countImplementations(name, text) {
  const pattern = new RegExp(
    `\\b(?:implements|extends)\\s+${escapeRegExp(name)}\\b`,
    "g",
  );
  return [...text.matchAll(pattern)].length;
}

export function countNonCommentLines(fileLines) {
  return fileLines.filter((line) => {
    const trimmed = line.trim();

    return (
      trimmed.length > 0 &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("/*") &&
      !trimmed.startsWith("*")
    );
  }).length;
}

export function packageDirectories(startDir) {
  return fs.existsSync(startDir)
    ? fs.readdirSync(startDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(startDir, entry.name))
    : [];
}

export function findFiles(dirPath, predicate) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      return findFiles(entryPath, predicate);
    }

    return entry.isFile() && predicate(entryPath) ? [entryPath] : [];
  });
}

export function lines(filePath) {
  return read(filePath).split("\n");
}

export function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namedExportNames(indexText) {
  return [...indexText.matchAll(namedReExportPattern)].flatMap((match) => {
    return match[1].split(",").flatMap(publicSpecifierName);
  });
}

function starExportNames(indexPath) {
  return moduleNamesForPattern(read(indexPath), starReExportPattern).flatMap(
    (moduleName) => {
      const targetPath = path.join(path.dirname(indexPath), `${moduleName}.ts`);

      return fs.existsSync(targetPath)
        ? exportedNamesFromText(read(targetPath))
        : [];
    },
  );
}

function moduleNamesForPattern(text, pattern) {
  pattern.lastIndex = 0;
  return [...text.matchAll(pattern)].map((match) => {
    return match[2] ?? match[1];
  });
}

function publicSpecifierName(specifier) {
  const normalized = specifier.trim().replace(/^type\s+/, "");

  if (normalized.length === 0) {
    return [];
  }

  const [, alias] = normalized.match(/\s+as\s+([A-Z_a-z]\w*)$/) ?? [];

  return [alias ?? normalized.split(/\s+/)[0]];
}
