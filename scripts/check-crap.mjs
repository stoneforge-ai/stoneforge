import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const targetCrap = 5;
const maxCrap = 10;

const coverageByFile = loadCoverage();
const functions = collectFunctions();
const results = functions.map((entry) => {
  const coverage = coverageForFunction(entry, coverageByFile.get(entry.file));
  const crap = calculateCrap(entry.complexity, coverage);

  return {
    ...entry,
    coverage,
    crap,
  };
});

const hardFailures = results.filter((result) => result.crap > maxCrap);
const targetFailures = results.filter((result) => {
  return result.crap >= targetCrap && result.crap <= maxCrap;
});

if (targetFailures.length > 0) {
  console.error(formatSection("CRAP target failures", targetFailures));
}

if (hardFailures.length > 0) {
  console.error(formatSection("CRAP hard failures", hardFailures));
}

if (targetFailures.length > 0 || hardFailures.length > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `CRAP check passed: ${results.length} functions, 0 target failures, 0 hard failures.`,
  );
}

function loadCoverage() {
  const coverageFiles = findFiles(root, (filePath) => {
    return filePath.endsWith(path.join("coverage", "coverage-final.json"));
  });
  const coverage = new Map();

  for (const filePath of coverageFiles) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    for (const [coveredFile, fileCoverage] of Object.entries(data)) {
      coverage.set(path.resolve(coveredFile), fileCoverage);
    }
  }

  if (coverage.size === 0) {
    throw new Error(
      "No coverage-final.json files found. Run `pnpm coverage` before `pnpm quality:crap`.",
    );
  }

  return coverage;
}

function collectFunctions() {
  const sourceFiles = findFiles(path.join(root, "packages"), (filePath) => {
    return (
      filePath.endsWith(".ts") &&
      !filePath.endsWith(".test.ts") &&
      !filePath.includes(`${path.sep}dist${path.sep}`) &&
      !filePath.includes(`${path.sep}coverage${path.sep}`)
    );
  });

  return sourceFiles.flatMap(readFunctionsFromFile);
}

function readFunctionsFromFile(filePath) {
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const functions = [];

  visit(source);

  return functions;

  function visit(node) {
    if (isFunctionLikeWithBody(node)) {
      functions.push(functionMetric(filePath, source, node));
      return;
    }

    ts.forEachChild(node, visit);
  }
}

function functionMetric(filePath, source, node) {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());

  return {
    file: path.resolve(filePath),
    name: functionName(node),
    startLine: start.line + 1,
    endLine: end.line + 1,
    complexity: cyclomaticComplexity(node.body),
  };
}

function cyclomaticComplexity(body) {
  let complexity = 1;

  visit(body);

  return complexity;

  function visit(node) {
    if (node !== body && isFunctionLikeWithBody(node)) {
      return;
    }

    if (addsComplexity(node)) {
      complexity += 1;
    }

    ts.forEachChild(node, visit);
  }
}

function coverageForFunction(entry, fileCoverage) {
  if (!fileCoverage) {
    return 0;
  }

  const statements = Object.entries(fileCoverage.statementMap ?? {}).filter(
    ([, location]) => {
      return (
        location.start.line >= entry.startLine &&
        location.end.line <= entry.endLine
      );
    },
  );

  if (statements.length === 0) {
    const functionHit = matchingFunctionHit(entry, fileCoverage);

    return functionHit === undefined ? 1 : functionHit;
  }

  const covered = statements.filter(([statementId]) => {
    return (fileCoverage.s?.[statementId] ?? 0) > 0;
  }).length;

  return covered / statements.length;
}

function matchingFunctionHit(entry, fileCoverage) {
  const match = Object.entries(fileCoverage.fnMap ?? {}).find(([, fn]) => {
    return fn.loc.start.line === entry.startLine;
  });

  if (!match) {
    return undefined;
  }

  return (fileCoverage.f?.[match[0]] ?? 0) > 0 ? 1 : 0;
}

function calculateCrap(complexity, coverage) {
  return complexity ** 2 * (1 - coverage) ** 3 + complexity;
}

function addsComplexity(node) {
  return (
    ts.isIfStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCaseClause(node) ||
    ts.isCatchClause(node) ||
    isShortCircuitExpression(node)
  );
}

function isShortCircuitExpression(node) {
  return (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  );
}

function isFunctionLikeWithBody(node) {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    node.body !== undefined
  );
}

function functionName(node) {
  if (node.name?.getText) {
    return node.name.getText();
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent;

    if (ts.isVariableDeclaration(parent) && parent.name.getText) {
      return parent.name.getText();
    }

    if (ts.isPropertyAssignment(parent) && parent.name.getText) {
      return parent.name.getText();
    }
  }

  return "<anonymous>";
}

function findFiles(startDir, predicate) {
  if (!fs.existsSync(startDir)) {
    return [];
  }

  const files = [];
  const entries = fs.readdirSync(startDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(startDir, entry.name);

    if (entry.isDirectory()) {
      if (["node_modules", ".git", "reference"].includes(entry.name)) {
        continue;
      }

      files.push(...findFiles(entryPath, predicate));
      continue;
    }

    if (entry.isFile() && predicate(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

function formatSection(title, entries) {
  const lines = entries
    .sort((left, right) => right.crap - left.crap)
    .slice(0, 25)
    .map((entry) => {
      const relativeFile = path.relative(root, entry.file);
      const coverage = `${Math.round(entry.coverage * 100)}%`;
      const crap = entry.crap.toFixed(2);

      return `- ${relativeFile}:${entry.startLine} ${entry.name} complexity=${entry.complexity} coverage=${coverage} CRAP=${crap}`;
    });

  return `${title}:\n${lines.join("\n")}`;
}
