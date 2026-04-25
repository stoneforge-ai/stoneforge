# Stoneforge V2 Control Plane

Runs local control-plane scenarios through the active V2 domain services with fake adapters. The first scenario is a direct code-changing Task through dispatch, review, approval, and merge.

```sh
pnpm --dir apps/control-plane start
```

The command builds the control-plane app and its workspace package dependencies, runs the direct-task scenario, and prints a concise end-state summary.

## Persistent Local Tracer Bullet

Run the file-backed control-plane tracer bullet with fake Agent and GitHub adapters:

```sh
pnpm --dir apps/control-plane start -- tracer-bullet --store ../../.stoneforge/control-plane.json
```

The command resets the local JSON store, creates and configures a Workspace, creates a direct Task, runs the fake worker, recreates the control-plane service from the persisted store, then opens the MergeRequest, records CI, review, approval, merge, and prints the final summary.

The same flow can also be driven one public command at a time:

```sh
pnpm --dir apps/control-plane start -- initialize-workspace --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- configure-repo --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- configure-runtime --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- configure-agent --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- configure-role --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- configure-policy --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- validate-workspace --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- create-direct-task --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- run-worker --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- open-merge-request --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- record-ci-passed --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- request-review --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- run-worker --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- complete-review --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- approve --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- merge --store ../../.stoneforge/control-plane.json
pnpm --dir apps/control-plane start -- summary --store ../../.stoneforge/control-plane.json
```
