import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const eslintExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const markdownExtensions = new Set([".markdown", ".md", ".mdx"]);

export function collectEditedPaths(repoRoot, value, paths = new Set()) {
  if (!value || typeof value !== "object") {
    return paths;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectEditedPaths(repoRoot, item, paths);
    }

    return paths;
  }

  for (const [key, entry] of Object.entries(value)) {
    const editedPath = pathFromHookValue(repoRoot, key, entry);

    if (editedPath) {
      paths.add(editedPath);
      continue;
    }

    collectEditedPaths(repoRoot, entry, paths);
  }

  return paths;
}

export function filesForEslint(paths) {
  return paths.filter((filePath) => {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return false;
    }

    return eslintExtensions.has(extensionFor(filePath));
  });
}

export function nonMarkdownFiles(paths) {
  return paths.filter((filePath) => {
    return !markdownExtensions.has(extensionFor(filePath));
  });
}

function pathFromHookValue(repoRoot, key, value) {
  const looksLikePathKey = /^(file_?path|path|filename|target_?file)$/i.test(
    key,
  );

  return looksLikePathKey ? editedPathFrom(repoRoot, value) : null;
}

function editedPathFrom(repoRoot, value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const absolutePath = isAbsolute(value)
    ? resolve(value)
    : resolve(repoRoot, value);
  const relativePath = relative(repoRoot, absolutePath);

  if (
    relativePath.startsWith("..") ||
    isAbsolute(relativePath) ||
    !existsSync(absolutePath)
  ) {
    return null;
  }

  return absolutePath;
}

function extensionFor(filePath) {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : "";
}
