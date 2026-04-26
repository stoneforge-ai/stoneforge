import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

const root = process.cwd();
const sourceRoots = ["packages", "apps"];
const helperNamePattern =
  /^(define[A-Z]|parse[A-Z].*Config$|create[A-Z].*(Client|Registry|Config)$)/;

const sourceFiles = sourceRoots.flatMap((sourceRoot) => {
  return findFiles(path.join(root, sourceRoot), (filePath) => {
    return (
      filePath.endsWith(".ts") &&
      !filePath.endsWith(".test.ts") &&
      !filePath.endsWith(".e2e.ts") &&
      !filePath.includes(`${path.sep}dist${path.sep}`) &&
      !filePath.includes(`${path.sep}coverage${path.sep}`)
    );
  });
});

const findings = sourceFiles.flatMap(checkSourceFile);

if (findings.length > 0) {
  console.error("Type-driven API check failed:");

  for (const finding of findings) {
    console.error(`- ${finding}`);
  }

  process.exitCode = 1;
} else {
  console.log(
    `Type-driven API check passed: ${sourceFiles.length} files checked.`,
  );
}

function checkSourceFile(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const exportedNodes = topLevelExportedNodes(sourceFile);

  return [
    ...exportedNodes.flatMap((node) => checkExportedApiNode(sourceFile, node)),
    ...exportedNodes.flatMap((node) => checkTypeDrivenHelper(sourceFile, node)),
  ];
}

function topLevelExportedNodes(sourceFile) {
  return sourceFile.statements.filter((statement) => {
    return hasExportModifier(statement);
  });
}

function checkExportedApiNode(sourceFile, node) {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    return checkTypeSurface(sourceFile, node);
  }

  if (ts.isFunctionDeclaration(node)) {
    return checkSignatureSurface(sourceFile, node);
  }

  if (ts.isClassDeclaration(node)) {
    return node.members.flatMap((member) => {
      if (hasPrivateOrProtectedModifier(member)) {
        return [];
      }

      return checkMemberSurface(sourceFile, member);
    });
  }

  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.flatMap((declaration) => {
      return declaration.type === undefined
        ? []
        : checkTypeSurface(sourceFile, declaration.type);
    });
  }

  return [];
}

function checkMemberSurface(sourceFile, member) {
  if (ts.isConstructorDeclaration(member)) {
    return member.parameters.flatMap((parameter) => {
      return checkTypeSurface(sourceFile, parameter.type);
    });
  }

  if (ts.isMethodDeclaration(member) || ts.isFunctionLike(member)) {
    return checkSignatureSurface(sourceFile, member);
  }

  if (ts.isPropertyDeclaration(member)) {
    return checkTypeSurface(sourceFile, member.type);
  }

  return [];
}

function checkSignatureSurface(sourceFile, node) {
  return [
    ...node.parameters.flatMap((parameter) => {
      return checkTypeSurface(sourceFile, parameter.type);
    }),
    ...checkTypeSurface(sourceFile, node.type),
    ...checkTypeParameters(sourceFile, node.typeParameters),
  ];
}

function checkTypeSurface(sourceFile, node) {
  if (node === undefined) {
    return [];
  }

  const findings = [];

  visit(node, (child) => {
    if (child.kind === ts.SyntaxKind.UnknownKeyword) {
      findings.push(
        `${location(sourceFile, child)} exports unknown. Public APIs must narrow trust-boundary values before exposing them.`,
      );
    }

    if (isBroadStringRecord(child)) {
      findings.push(
        `${location(sourceFile, child)} exports Record<string, ...>. Preserve literal keys with a named mapped type, satisfies, or a constrained helper.`,
      );
    }
  });

  return findings;
}

function checkTypeParameters(sourceFile, typeParameters) {
  if (typeParameters === undefined) {
    return [];
  }

  return typeParameters.flatMap((typeParameter) => {
    return checkTypeSurface(sourceFile, typeParameter.constraint);
  });
}

function checkTypeDrivenHelper(sourceFile, node) {
  const name = exportedNodeName(node);

  if (name === undefined || !helperNamePattern.test(name)) {
    return [];
  }

  if (hasExpectTypeOfTest(sourceFile.fileName)) {
    return [];
  }

  return [
    `${path.relative(root, sourceFile.fileName)} exports ${name}; type-driven API helpers must have a nearby test with expectTypeOf coverage.`,
  ];
}

function exportedNodeName(node) {
  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
    node.name
  ) {
    return node.name.text;
  }

  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0];

    if (declaration && ts.isIdentifier(declaration.name)) {
      return declaration.name.text;
    }
  }

  return undefined;
}

function hasExpectTypeOfTest(filePath) {
  const parsedPath = path.parse(filePath);
  const candidates = [
    path.join(parsedPath.dir, `${parsedPath.name}.test.ts`),
    path.join(parsedPath.dir, `${parsedPath.name}.type.test.ts`),
  ];

  return candidates.some((candidate) => {
    return (
      fs.existsSync(candidate) &&
      fs.readFileSync(candidate, "utf8").includes("expectTypeOf")
    );
  });
}

function isBroadStringRecord(node) {
  if (!ts.isTypeReferenceNode(node) || !ts.isIdentifier(node.typeName)) {
    return false;
  }

  if (node.typeName.text !== "Record" || node.typeArguments?.length !== 2) {
    return false;
  }

  return node.typeArguments[0]?.kind === ts.SyntaxKind.StringKeyword;
}

function hasExportModifier(node) {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function hasPrivateOrProtectedModifier(node) {
  return (
    hasModifier(node, ts.SyntaxKind.PrivateKeyword) ||
    hasModifier(node, ts.SyntaxKind.ProtectedKeyword)
  );
}

function hasModifier(node, kind) {
  return node.modifiers?.some((modifier) => modifier.kind === kind) === true;
}

function visit(node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => {
    visit(child, visitor);
  });
}

function location(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );

  return `${path.relative(root, sourceFile.fileName)}:${line + 1}:${character + 1}`;
}

function findFiles(dirPath, predicate) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...findFiles(entryPath, predicate));
      continue;
    }

    if (predicate(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}
