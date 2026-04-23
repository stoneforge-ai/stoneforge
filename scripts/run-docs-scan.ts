import { createDocsStewardService } from '../packages/smithy/src/services/docs-steward-service.ts';

const workspaceRoot = process.argv[2] || process.cwd();

const service = createDocsStewardService({
  workspaceRoot,
  docsDir: 'apps/docs/src/content/docs',
  sourceDirs: [
    'apps/docs',
    'apps/quarry-server',
    'apps/smithy-server',
    'apps/smithy-web',
    'packages/core',
    'packages/quarry',
    'packages/storage',
    'packages/smithy',
  ],
});

const result = await service.scanAll();
console.log(
  JSON.stringify(
    {
      filesScanned: result.filesScanned,
      durationMs: result.durationMs,
      issueCount: result.issues.length,
      issues: result.issues,
    },
    null,
    2
  )
);
