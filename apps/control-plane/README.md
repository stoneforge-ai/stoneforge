# Stoneforge V2 Control Plane

Runs local control-plane scenarios through the active V2 domain services with fake adapters. The first scenario is a direct code-changing Task through dispatch, review, approval, and merge.

```sh
pnpm --dir apps/control-plane start
```

The command builds the control-plane app and its workspace package dependencies, runs the direct-task scenario, and prints a concise end-state summary.
