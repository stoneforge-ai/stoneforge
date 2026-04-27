import fs from "node:fs"
import path from "node:path"
import {
  countImplementations,
  countNonCommentLines,
  escapeRegExp,
  exportedNamesFromText,
  findFiles,
  lines,
  moduleNameForImport,
  packageIndexPaths,
  packageInterfaceNames,
  publicModulesForIndex,
  read,
  relativeImportsFor,
  resolveImport,
} from "./architecture-helpers.mjs"

const root = process.cwd()
const codeRoots = ["packages", "apps"]
const architectureSkillPath =
  ".agents/skills/improve-codebase-architecture/SKILL.md"
const baselinePath = path.join(root, "scripts", "architecture-baseline.json")
const maxItemsPerSection = 8
const updateBaseline = process.argv.includes("--update-baseline")
const domainAliasesToWatch = [
  "chat app",
  "project tracker",
  "code editor",
  "orchestrator app",
  "daemon",
  "ticket",
  "bot",
  "runner",
  "credential",
  "credentials",
  "permission",
  "permissions",
  "manual mode",
  "full auto",
  "hands-off mode",
  "feature branch",
  "staging branch",
  "rejection",
]

const sourceFiles = codeRoots.flatMap((sourceRoot) => {
  return findFiles(path.join(root, sourceRoot), isSourceFile)
})
const productionFiles = sourceFiles.filter((filePath) => {
  return !filePath.endsWith(".test.ts")
})
const testFiles = sourceFiles.filter((filePath) => {
  return filePath.endsWith(".test.ts")
})
const importGraph = buildImportGraph(sourceFiles)

const sections = [
  section("Tests Crossing Internal Seams", testInternalImports()),
  section("Broad Package Interfaces", broadPackageInterfaces()),
  section("Shallow Module Candidates", shallowModuleCandidates()),
  section("Domain Vocabulary Drift", domainVocabularyDrift()),
  section("Hypothetical Seams", hypotheticalSeams()),
].filter((entry) => {
  return entry.items.length > 0
})

if (updateBaseline) {
  writeBaseline(sections)
}

const baseline = readBaseline()
const newFindings = sections.flatMap((entry) => {
  return entry.items
    .filter((item) => {
      return !baselineFindingsFor(entry.title).has(item)
    })
    .map((item) => {
      return { title: entry.title, item }
    })
})

if (sections.length === 0) {
  console.log(
    "Architecture report passed: no deepening opportunities detected."
  )
} else {
  console.warn(
    `Architecture report found ${sections.reduce((total, entry) => total + entry.items.length, 0)} deepening opportunities.`
  )
  console.warn(
    `Use ${architectureSkillPath} to resolve ambiguity around Module Depth, Interface shape, Seams, Adapters, Leverage, and Locality.`
  )

  for (const entry of sections) {
    printSection(entry)
  }
}

if (newFindings.length > 0) {
  console.error(
    `\nArchitecture regression check failed: ${newFindings.length} finding(s) are not in ${relative(baselinePath)}.`
  )
  console.error(
    "Fix the architecture issue, or update the baseline only after deciding the finding is acceptable technical debt."
  )

  for (const finding of newFindings.slice(0, maxItemsPerSection)) {
    console.error(`- [${finding.title}] ${finding.item}`)
  }

  if (newFindings.length > maxItemsPerSection) {
    console.error(`- ...and ${newFindings.length - maxItemsPerSection} more`)
  }

  process.exit(1)
}

function section(title, items) {
  return { title, items }
}

function readBaseline() {
  if (!fs.existsSync(baselinePath)) {
    return { findings: {} }
  }

  return JSON.parse(fs.readFileSync(baselinePath, "utf8"))
}

function writeBaseline(reportSections) {
  const findings = Object.fromEntries(
    reportSections.map((entry) => {
      return [entry.title, entry.items]
    })
  )

  fs.writeFileSync(baselinePath, `${JSON.stringify({ findings }, null, 2)}\n`)
  console.log(`Updated architecture baseline at ${relative(baselinePath)}.`)
}

function baselineFindingsFor(title) {
  return new Set(baseline.findings?.[title] ?? [])
}

function printSection(entry) {
  console.warn(`\n${entry.title}:`)

  for (const item of entry.items.slice(0, maxItemsPerSection)) {
    console.warn(`- ${item}`)
  }

  if (entry.items.length > maxItemsPerSection) {
    console.warn(`- ...and ${entry.items.length - maxItemsPerSection} more`)
  }
}

function testInternalImports() {
  const allowedInternalModules = new Set([
    "ids",
    "index",
    "models",
    "program-runtime",
    ...publicModuleNames(),
  ])

  return testFiles.flatMap((filePath) => {
    const imports = relativeImportsFor(filePath).filter((importPath) => {
      const moduleName = moduleNameForImport(importPath)
      return !allowedInternalModules.has(moduleName)
    })

    return imports.map((importPath) => {
      return `${relative(filePath)} imports ${importPath}; prefer testing through the package Interface unless this internal Seam is deliberately test-only.`
    })
  })
}

function broadPackageInterfaces() {
  return packageIndexPaths(root, codeRoots).flatMap((indexPath) => {
    const exportSurface = packageInterfaceNames(indexPath)
    const starExports = lines(indexPath).filter((line) => {
      return line.trim().startsWith("export * from")
    }).length

    if (exportSurface.size <= 45 && starExports === 0) {
      return []
    }

    return [
      `${relative(indexPath)} exposes ${exportSurface.size} public names with ${starExports} star exports; confirm callers get Leverage from this Interface rather than a broad model bag.`,
    ]
  })
}

function shallowModuleCandidates() {
  return productionFiles.flatMap((filePath) => {
    if (path.basename(filePath) === "index.ts") {
      return []
    }

    const metric = moduleMetric(filePath)

    if (metric.nonCommentLines > 35 || metric.importExportRatio < 0.55) {
      return []
    }

    if (metric.exportedNames > 3 || metric.fanIn > 3) {
      return []
    }

    return [
      `${relative(filePath)} has ${metric.nonCommentLines} non-comment lines, ${metric.exportedNames} exported names, fan-in ${metric.fanIn}, and mostly import/export surface; apply the deletion test for shallow Module risk.`,
    ]
  })
}

function domainVocabularyDrift() {
  return domainAliasesToWatch.flatMap((alias) => {
    return occurrencesForAlias(alias).slice(0, 3)
  })
}

function hypotheticalSeams() {
  const seamNames = exportedNames().filter((name) => {
    return name.endsWith("Adapter") || name.endsWith("Interface")
  })
  const implementationText = productionFiles.map(read).join("\n")

  return seamNames.flatMap((name) => {
    const implementationCount = countImplementations(name, implementationText)

    if (implementationCount >= 2 || injectedAdapterUseCount(name) > 0) {
      return []
    }

    return [
      `${name} has ${implementationCount} production Adapter implementation(s) and no production injection point; one Adapter is a hypothetical Seam unless provider variation is imminent and documented.`,
    ]
  })
}

function publicModuleNames() {
  const names = new Set()

  for (const indexPath of packageIndexPaths(root, codeRoots)) {
    publicModulesForIndex(indexPath).forEach((moduleName) =>
      names.add(moduleName)
    )
  }

  return names
}

function exportedNames() {
  return productionFiles.flatMap((filePath) => {
    return exportedNamesFromText(read(filePath))
  })
}

function moduleMetric(filePath) {
  const fileLines = lines(filePath)
  const nonCommentLines = countNonCommentLines(fileLines)
  const importExportLines = fileLines.filter((line) => {
    return /^\s*(import|export)\b/.test(line)
  }).length

  return {
    nonCommentLines,
    exportedNames: exportedNamesFromText(read(filePath)).length,
    fanIn: importGraph.fanIn.get(filePath)?.size ?? 0,
    importExportRatio:
      nonCommentLines === 0 ? 0 : importExportLines / nonCommentLines,
  }
}

function buildImportGraph(files) {
  const fanIn = new Map()

  for (const filePath of files) {
    for (const importPath of relativeImportsFor(filePath)) {
      const target = resolveImport(filePath, importPath)

      if (!target) {
        continue
      }

      const dependents = fanIn.get(target) ?? new Set()
      dependents.add(filePath)
      fanIn.set(target, dependents)
    }
  }

  return { fanIn }
}

function occurrencesForAlias(alias) {
  const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "gi")

  return productionFiles.flatMap((filePath) => {
    return lines(filePath).flatMap((line, index) => {
      if (!pattern.test(line)) {
        return []
      }

      pattern.lastIndex = 0
      return [
        `${relative(filePath)}:${index + 1} uses alias "${alias}"; prefer V2 ubiquitous language where this is domain text.`,
      ]
    })
  })
}

function injectedAdapterUseCount(name) {
  const pattern = new RegExp(`[:<]\\s*${escapeRegExp(name)}\\b`, "g")

  return productionFiles.reduce((count, filePath) => {
    return count + [...read(filePath).matchAll(pattern)].length
  }, 0)
}

function isSourceFile(filePath) {
  return filePath.endsWith(".ts") && !ignoredPath(filePath)
}

function isProductionSourceFile(filePath) {
  return isSourceFile(filePath) && !filePath.endsWith(".test.ts")
}

function ignoredPath(filePath) {
  return (
    filePath.includes(`${path.sep}dist${path.sep}`) ||
    filePath.includes(`${path.sep}coverage${path.sep}`)
  )
}

function relative(filePath) {
  return path.relative(root, filePath)
}
