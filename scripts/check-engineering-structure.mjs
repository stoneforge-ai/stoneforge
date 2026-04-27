import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const sourceRoots = ["packages", "apps"]
const productionModuleAdvisoryLimit = 300
const productionModuleHardLimit = 450
const modelModuleHardLimit = 600
const testModuleHardLimit = 750
const bannedMarkers = /\b(TODO|FIXME|HACK|XXX)\b/

const sourceFiles = sourceRoots.flatMap((sourceRoot) => {
  return findFiles(path.join(root, sourceRoot), (filePath) => {
    return (
      filePath.endsWith(".ts") &&
      !filePath.includes(`${path.sep}dist${path.sep}`) &&
      !filePath.includes(`${path.sep}coverage${path.sep}`)
    )
  })
})

const findings = [
  ...sourceFiles.flatMap(checkHardModuleSize),
  ...sourceFiles.flatMap(checkBannedMarkers),
]
const advisories = sourceFiles.flatMap(checkAdvisoryModuleSize)

if (findings.length > 0) {
  console.error("Engineering structure check failed:")

  for (const finding of findings) {
    console.error(`- ${finding}`)
  }

  process.exitCode = 1
} else {
  if (advisories.length > 0) {
    console.warn("Engineering structure advisories:")

    for (const advisory of advisories) {
      console.warn(`- ${advisory}`)
    }
  }

  console.log(
    `Engineering structure check passed: ${sourceFiles.length} files checked.`
  )
}

function checkHardModuleSize(filePath) {
  const relativePath = path.relative(root, filePath)
  const nonCommentLines = countNonCommentLines(filePath)
  const limit = hardModuleLineLimit(relativePath)

  if (nonCommentLines <= limit) {
    return []
  }

  return [
    `${relativePath} has ${nonCommentLines} non-comment lines; hard limit is ${limit}. Deep cohesive Modules are allowed, but this Module needs a smaller Interface, clearer Locality, or an explicit split.`,
  ]
}

function checkAdvisoryModuleSize(filePath) {
  const relativePath = path.relative(root, filePath)
  const nonCommentLines = countNonCommentLines(filePath)

  if (relativePath.endsWith(".test.ts")) {
    return []
  }

  if (relativePath.endsWith(`${path.sep}models.ts`)) {
    return []
  }

  if (nonCommentLines <= productionModuleAdvisoryLimit) {
    return []
  }

  return [
    `${relativePath} has ${nonCommentLines} non-comment lines. Use the deletion test before splitting; a deep cohesive Module is preferable to shallow helper Modules.`,
  ]
}

function hardModuleLineLimit(relativePath) {
  if (relativePath.endsWith(".test.ts")) {
    return testModuleHardLimit
  }

  if (relativePath.endsWith(`${path.sep}models.ts`)) {
    return modelModuleHardLimit
  }

  return productionModuleHardLimit
}

function checkBannedMarkers(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      if (!bannedMarkers.test(line)) {
        return []
      }

      return [
        `${path.relative(root, filePath)}:${index + 1} contains an unresolved TODO/FIXME/HACK/XXX marker.`,
      ]
    })
}

function countNonCommentLines(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n")
  let count = 0
  let inBlockComment = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.length === 0) {
      continue
    }

    if (inBlockComment) {
      inBlockComment = !trimmed.includes("*/")
      continue
    }

    if (trimmed.startsWith("//")) {
      continue
    }

    if (trimmed.startsWith("/*")) {
      inBlockComment = !trimmed.includes("*/")
      continue
    }

    count += 1
  }

  return count
}

function findFiles(dirPath, predicate) {
  if (!fs.existsSync(dirPath)) {
    return []
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...findFiles(entryPath, predicate))
      continue
    }

    if (predicate(entryPath)) {
      files.push(entryPath)
    }
  }

  return files
}
