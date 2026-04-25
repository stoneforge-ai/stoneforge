/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)eslint\\.config\\.js$",
          "(^|/)vitest\\.config\\.ts$",
          "(^|/)tsconfig(\\.build)?\\.json$",
        ],
      },
      to: {},
    },
    {
      name: "no-reference-imports-from-active-code",
      severity: "error",
      from: {
        path: "^(apps|packages)/",
      },
      to: {
        path: "^reference/",
      },
    },
    {
      name: "core-has-no-active-package-dependencies",
      severity: "error",
      from: {
        path: "^packages/core/src/",
      },
      to: {
        path: "^packages/(execution|merge-request|workspace)/src/",
      },
    },
    {
      name: "workspace-does-not-depend-on-execution-or-merge-request",
      severity: "error",
      from: {
        path: "^packages/workspace/src/",
      },
      to: {
        path: "^packages/(execution|merge-request)/src/",
      },
    },
    {
      name: "execution-does-not-depend-on-merge-request",
      severity: "error",
      from: {
        path: "^packages/execution/src/",
      },
      to: {
        path: "^packages/merge-request/src/",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: "^(reference|(apps|packages)/.*/dist|(apps|packages)/.*/coverage|node_modules)/",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.base.json",
    },
  },
};
