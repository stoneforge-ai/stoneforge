/**
 * OpenCode Event Mapper Tests
 *
 * Tests for mapping OpenCode SSE events to AgentMessage format.
 * Test data matches the real @opencode-ai/sdk event shapes.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { OpenCodeEventMapper } from "./event-mapper.js";
import type { OpenCodeEvent } from "./event-mapper.js";

describe("OpenCodeEventMapper", () => {
  let mapper: OpenCodeEventMapper;
  const sessionId = "test-session-123";

  beforeEach(() => {
    mapper = new OpenCodeEventMapper();
  });

  describe("session ID filtering", () => {
    it("should pass events with matching session ID", () => {
      // Buffer a text event, then flush to verify it passed
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            sessionID: sessionId,
            delta: "hello",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "hello",
            },
          },
        },
        sessionId,
      );
      const messages = mapper.flush();
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("assistant");
    });

    it("should filter events with different session ID", () => {
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            sessionID: "other-session",
            delta: "hello",
            part: {
              type: "text",
              id: "p1",
              sessionID: "other-session",
              text: "hello",
            },
          },
        },
        sessionId,
      );
      const messages = mapper.flush();
      expect(messages.length).toBe(0);
    });

    it("should pass events when part.sessionID matches", () => {
      // No sessionID at properties level, part.sessionID matches
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "hello",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "hello",
            },
          },
        },
        sessionId,
      );
      const messages = mapper.flush();
      expect(messages.length).toBe(1);
    });

    it("should filter when part.sessionID differs", () => {
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "hello",
            part: {
              type: "text",
              id: "p1",
              sessionID: "other-session",
              text: "hello",
            },
          },
        },
        sessionId,
      );
      const messages = mapper.flush();
      expect(messages.length).toBe(0);
    });

    it("should extract session ID from info.id", () => {
      const event: OpenCodeEvent = {
        type: "session.idle",
        properties: {
          info: { id: sessionId },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
    });
  });

  describe("text buffering", () => {
    it("should buffer text deltas and flush on session.idle", () => {
      // Send multiple deltas
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "Hello ",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "Hello ",
            },
          },
        },
        sessionId,
      );
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "world",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "Hello world",
            },
          },
        },
        sessionId,
      );

      // session.idle flushes buffered text + emits result
      const messages = mapper.mapEvent(
        {
          type: "session.idle",
          properties: { sessionID: sessionId },
        },
        sessionId,
      );
      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe("assistant");
      expect(messages[0].content).toBe("Hello world");
      expect(messages[1].type).toBe("result");
    });

    it("should flush text when a tool event arrives", () => {
      // Buffer text
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "Let me read that file.",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "Let me read that file.",
            },
          },
        },
        sessionId,
      );

      // Tool event flushes text (pending doesn't emit tool_use, but still flushes)
      const messages = mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            part: {
              type: "tool",
              id: "tool-1",
              sessionID: sessionId,
              callID: "call-1",
              tool: "read_file",
              state: { status: "pending", input: {} },
            },
          },
        },
        sessionId,
      );
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("assistant");
      expect(messages[0].content).toBe("Let me read that file.");
    });

    it("should accumulate multiple deltas into one message", () => {
      // Multiple deltas for same text part
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "A",
            part: { type: "text", id: "p1", sessionID: sessionId, text: "A" },
          },
        },
        sessionId,
      );
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "B",
            part: { type: "text", id: "p1", sessionID: sessionId, text: "AB" },
          },
        },
        sessionId,
      );
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "C",
            part: { type: "text", id: "p1", sessionID: sessionId, text: "ABC" },
          },
        },
        sessionId,
      );

      const messages = mapper.flush();
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe("ABC");
    });

    it("should flush old text part when a new text part starts", () => {
      // First text part
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "Part 1",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "Part 1",
            },
          },
        },
        sessionId,
      );

      // Different text part ID — flushes the first
      const messages = mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "Part 2",
            part: {
              type: "text",
              id: "p2",
              sessionID: sessionId,
              text: "Part 2",
            },
          },
        },
        sessionId,
      );
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("assistant");
      expect(messages[0].content).toBe("Part 1");

      // Flush the second
      const remaining = mapper.flush();
      expect(remaining.length).toBe(1);
      expect(remaining[0].content).toBe("Part 2");
    });

    it("should use full text when no delta", () => {
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "Full text",
            },
          },
        },
        sessionId,
      );
      const messages = mapper.flush();
      expect(messages[0].content).toBe("Full text");
    });

    it("should not emit anything for empty text with no delta", () => {
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            part: { type: "text", id: "p1", sessionID: sessionId, text: "" },
          },
        },
        sessionId,
      );
      const messages = mapper.flush();
      expect(messages.length).toBe(0);
    });

    it("should return empty for text delta events (buffered, not emitted)", () => {
      const messages = mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "hello",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "hello",
            },
          },
        },
        sessionId,
      );
      // Text is buffered, not emitted immediately
      expect(messages.length).toBe(0);
    });
  });

  describe("tool parts", () => {
    it("should not emit tool_use on pending state (input may be empty)", () => {
      const event: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            id: "tool-1",
            sessionID: sessionId,
            callID: "call-1",
            tool: "read_file",
            state: { status: "pending", input: { path: "/test" } },
          },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(0);
    });

    it("should emit tool_use on first running state with input", () => {
      const event: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            id: "tool-2",
            sessionID: sessionId,
            callID: "call-2",
            tool: "bash",
            state: { status: "running", input: { command: "ls" } },
          },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("tool_use");
      expect(messages[0].tool?.name).toBe("bash");
      expect(messages[0].tool?.input).toEqual({ command: "ls" });
    });

    it("should not duplicate tool_use for same part ID", () => {
      // pending does not emit
      const pendingEvent: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            id: "tool-3",
            sessionID: sessionId,
            callID: "call-3",
            tool: "test",
            state: { status: "pending", input: {} },
          },
        },
      };
      const messages1 = mapper.mapEvent(pendingEvent, sessionId);
      expect(messages1.length).toBe(0);

      // running emits tool_use once
      const runningEvent: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            id: "tool-3",
            sessionID: sessionId,
            callID: "call-3",
            tool: "test",
            state: { status: "running", input: { command: "ls" } },
          },
        },
      };
      const messages2 = mapper.mapEvent(runningEvent, sessionId);
      expect(messages2.length).toBe(1);
      expect(messages2[0].type).toBe("tool_use");

      // second running does not duplicate
      const messages3 = mapper.mapEvent(runningEvent, sessionId);
      expect(messages3.length).toBe(0);
    });

    it("should emit tool_use and tool_result on completed state (when pending was skipped)", () => {
      // pending does not emit tool_use
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            part: {
              type: "tool",
              id: "tool-4",
              sessionID: sessionId,
              callID: "call-4",
              tool: "test",
              state: { status: "pending", input: {} },
            },
          },
        },
        sessionId,
      );

      const event: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            id: "tool-4",
            sessionID: sessionId,
            callID: "call-4",
            tool: "test",
            state: {
              status: "completed",
              input: { cmd: "test" },
              output: "done",
              title: "test",
            },
          },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      // completed emits both tool_use (deferred from pending) and tool_result
      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe("tool_use");
      expect(messages[0].tool?.input).toEqual({ cmd: "test" });
      expect(messages[1].type).toBe("tool_result");
      expect(messages[1].content).toBe("done");
      expect(messages[1].tool?.id).toBe("tool-4");
    });

    it("should emit tool_result with error content on error state", () => {
      // running emits tool_use
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            part: {
              type: "tool",
              id: "tool-5",
              sessionID: sessionId,
              callID: "call-5",
              tool: "test",
              state: { status: "running", input: { cmd: "fail" } },
            },
          },
        },
        sessionId,
      );

      const event: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            id: "tool-5",
            sessionID: sessionId,
            callID: "call-5",
            tool: "test",
            state: {
              status: "error",
              input: { cmd: "fail" },
              error: "Permission denied",
            },
          },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("tool_result");
      expect(messages[0].content).toBe("Permission denied");
    });

    it("should not duplicate tool_result for same part ID", () => {
      // running emits tool_use
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            part: {
              type: "tool",
              id: "tool-6",
              sessionID: sessionId,
              callID: "call-6",
              tool: "test",
              state: { status: "running", input: { cmd: "ok" } },
            },
          },
        },
        sessionId,
      );

      const completedEvent: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            id: "tool-6",
            sessionID: sessionId,
            callID: "call-6",
            tool: "test",
            state: {
              status: "completed",
              input: { cmd: "ok" },
              output: "ok",
              title: "test",
            },
          },
        },
      };
      // First completed emits tool_result only (tool_use already emitted from running)
      const firstMessages = mapper.mapEvent(completedEvent, sessionId);
      expect(firstMessages.length).toBe(1);
      expect(firstMessages[0].type).toBe("tool_result");

      // Duplicate completed emits nothing
      const messages = mapper.mapEvent(completedEvent, sessionId);
      expect(messages.length).toBe(0);
    });

    it("should skip tool parts without an ID", () => {
      const event = {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool" as const,
            id: "",
            sessionID: sessionId,
            callID: "call-x",
            tool: "test",
            state: { status: "pending" as const, input: {} },
          },
        },
      } satisfies OpenCodeEvent;
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(0);
    });
  });

  describe("skipped part types", () => {
    it("should skip reasoning parts", () => {
      const event: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {
          part: { type: "reasoning", id: "r1", sessionID: sessionId },
        },
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it("should skip step-start parts", () => {
      const event: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {
          part: { type: "step-start", id: "s1", sessionID: sessionId },
        },
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it("should skip step-finish parts", () => {
      const event: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {
          part: { type: "step-finish", id: "sf1", sessionID: sessionId },
        },
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it("should skip agent parts", () => {
      const event: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {
          part: { type: "agent", id: "a1", sessionID: sessionId },
        },
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it("should flush buffered text when non-text part arrives", () => {
      // Buffer some text
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "thinking...",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "thinking...",
            },
          },
        },
        sessionId,
      );

      // step-start should flush the text
      const messages = mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            part: { type: "step-start", id: "s1", sessionID: sessionId },
          },
        },
        sessionId,
      );
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("assistant");
      expect(messages[0].content).toBe("thinking...");
    });
  });

  describe("session events", () => {
    it("should map session.idle to result message", () => {
      const event: OpenCodeEvent = {
        type: "session.idle",
        properties: { sessionID: sessionId },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("result");
      expect(messages[0].subtype).toBe("success");
    });

    it("should map session.error with string to error message", () => {
      const event: OpenCodeEvent = {
        type: "session.error",
        properties: { error: "Something went wrong" },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("error");
      expect(messages[0].content).toBe("Something went wrong");
    });

    it("should map session.error with object to error message", () => {
      const event: OpenCodeEvent = {
        type: "session.error",
        properties: {
          error: { type: "provider_auth", message: "Auth failed" },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("error");
      expect(messages[0].content).toBe("Auth failed");
    });

    it("should handle session.error with no error message", () => {
      const event: OpenCodeEvent = {
        type: "session.error",
        properties: {},
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages[0].content).toBe("Unknown session error");
    });

    it("should flush buffered text on session.error", () => {
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "partial text",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "partial text",
            },
          },
        },
        sessionId,
      );

      const messages = mapper.mapEvent(
        {
          type: "session.error",
          properties: { error: "Oops" },
        },
        sessionId,
      );
      expect(messages.length).toBe(2);
      expect(messages[0].type).toBe("assistant");
      expect(messages[0].content).toBe("partial text");
      expect(messages[1].type).toBe("error");
    });

    it("should skip session.status events", () => {
      const event: OpenCodeEvent = {
        type: "session.status",
        properties: { sessionID: sessionId, status: { type: "busy" } },
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it("should skip message.updated events", () => {
      const event: OpenCodeEvent = {
        type: "message.updated",
        properties: {},
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it("should skip unknown event types", () => {
      const event: OpenCodeEvent = {
        type: "some.unknown.event",
        properties: {},
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });
  });

  describe("reset", () => {
    it("should clear deduplication state and text buffer", () => {
      // Buffer text and emit a tool_use
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "buffered",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "buffered",
            },
          },
        },
        sessionId,
      );
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            part: {
              type: "tool",
              id: "tool-r1",
              sessionID: sessionId,
              callID: "call-r1",
              tool: "test",
              state: { status: "pending", input: {} },
            },
          },
        },
        sessionId,
      );

      // Reset
      mapper.reset();

      // Text buffer should be cleared
      expect(mapper.flush().length).toBe(0);

      // Same tool ID should emit again after reset (use running to get tool_use)
      const messages = mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            part: {
              type: "tool",
              id: "tool-r1",
              sessionID: sessionId,
              callID: "call-r1",
              tool: "test",
              state: { status: "running", input: { cmd: "test" } },
            },
          },
        },
        sessionId,
      );
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("tool_use");
    });
  });

  describe("flush", () => {
    it("should emit buffered text on explicit flush", () => {
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "final text",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "final text",
            },
          },
        },
        sessionId,
      );

      const messages = mapper.flush();
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("assistant");
      expect(messages[0].content).toBe("final text");
    });

    it("should return empty if nothing buffered", () => {
      expect(mapper.flush().length).toBe(0);
    });

    it("should return empty on second flush", () => {
      mapper.mapEvent(
        {
          type: "message.part.updated",
          properties: {
            delta: "text",
            part: {
              type: "text",
              id: "p1",
              sessionID: sessionId,
              text: "text",
            },
          },
        },
        sessionId,
      );
      mapper.flush();
      expect(mapper.flush().length).toBe(0);
    });
  });

  describe("missing properties", () => {
    it("should handle event with no properties", () => {
      const event: OpenCodeEvent = {
        type: "message.part.updated",
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it("should handle event with no part", () => {
      const event: OpenCodeEvent = {
        type: "message.part.updated",
        properties: {},
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });
  });
});
