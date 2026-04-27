import { describe, expect, it } from "vitest"

import { formatDirectTaskRunSummary, runDirectTaskScenario } from "./index.js"

describe("direct task scenario", () => {
  it("runs the V2 direct-task control-plane path to merge", async () => {
    const { summary } = await runDirectTaskScenario()

    expect(summary.workspaceState).toBe("ready")
    expect(summary.taskState).toBe("completed")
    expect(summary.implementationAssignmentState).toBe("succeeded")
    expect(summary.implementationSessionState).toBe("ended")
    expect(summary.mergeRequestState).toBe("merged")
    expect(summary.verificationState).toBe("passed")
    expect(summary.reviewAssignmentState).toBe("succeeded")
    expect(summary.reviewSessionState).toBe("ended")
    expect(summary.policyCheckState).toBe("passed")
    expect(summary.approvalGateSatisfied).toBe(true)
    expect(summary.pullRequestMerged).toBe(true)
    expect(summary.providerSessionIds).toEqual([
      "local-task-start-1",
      "local-merge_request-start-2",
    ])
  })

  it("formats a concise end-state summary for the CLI", async () => {
    const { summary } = await runDirectTaskScenario()
    const output = formatDirectTaskRunSummary(summary)

    expect(output).toContain("Stoneforge V2 direct-task scenario complete")
    expect(output).toContain(`Workspace ${summary.workspaceId}: ready`)
    expect(output).toContain(`Task ${summary.taskId}: completed`)
    expect(output).toContain(`MergeRequest ${summary.mergeRequestId}: merged`)
    expect(output).toContain(
      `Verification Run ${summary.verificationRunId}: passed`
    )
    expect(output).toContain("PR merged: true")
  })
})
