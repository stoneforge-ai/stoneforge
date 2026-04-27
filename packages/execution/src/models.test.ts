import { asMergeRequestId, asWorkspaceId } from "@stoneforge/core"
import { describe, expectTypeOf, it } from "vitest"

import { asDispatchIntentId, asTaskId } from "./index.js"
import type {
  DispatchIntent,
  MergeRequestDispatchIntent,
  TaskDispatchIntent,
} from "./models.js"

describe("execution model types", () => {
  it("remembers dispatch target intent in the static type", () => {
    expectTypeOf<
      Extract<DispatchIntent, { targetType: "task" }>
    >().toEqualTypeOf<TaskDispatchIntent>()
    expectTypeOf<
      Extract<DispatchIntent, { targetType: "merge_request" }>
    >().toEqualTypeOf<MergeRequestDispatchIntent>()

    const intent: DispatchIntent = {
      id: asDispatchIntentId("intent_1"),
      workspaceId: asWorkspaceId("workspace_1"),
      targetType: "merge_request",
      mergeRequestId: asMergeRequestId("merge_request_1"),
      action: "review",
      state: "queued",
      requiredAgentTags: [],
      requiredRuntimeTags: [],
      placementFailureCount: 0,
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z",
    }

    if (intent.targetType === "merge_request") {
      expectTypeOf(intent.mergeRequestId).toEqualTypeOf<
        ReturnType<typeof asMergeRequestId>
      >()
    }
  })

  it("rejects targets without their required owner id", () => {
    const invalidTaskIntent = {
      id: asDispatchIntentId("intent_1"),
      workspaceId: asWorkspaceId("workspace_1"),
      targetType: "task",
      action: "implement",
      state: "queued",
      requiredAgentTags: [],
      requiredRuntimeTags: [],
      placementFailureCount: 0,
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z",
    }

    // @ts-expect-error Task dispatch intents must carry a task id.
    const missingTaskId: DispatchIntent = invalidTaskIntent
    expectTypeOf(missingTaskId).toEqualTypeOf<DispatchIntent>()

    const invalidMergeRequestIntent = {
      id: asDispatchIntentId("intent_2"),
      workspaceId: asWorkspaceId("workspace_1"),
      targetType: "merge_request",
      taskId: asTaskId("task_1"),
      mergeRequestId: asMergeRequestId("merge_request_1"),
      action: "review",
      state: "queued",
      requiredAgentTags: [],
      requiredRuntimeTags: [],
      placementFailureCount: 0,
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z",
    }

    // @ts-expect-error MergeRequest dispatch intents cannot use task ids.
    const invalidOwner: DispatchIntent = invalidMergeRequestIntent
    expectTypeOf(invalidOwner).toEqualTypeOf<DispatchIntent>()
  })
})
