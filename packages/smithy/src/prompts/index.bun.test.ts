import { describe, it, expect } from "bun:test";
import {
  loadBuiltInPrompt,
  loadRolePrompt,
  hasBuiltInPrompt,
  listBuiltInPrompts,
  buildAgentPrompt,
} from "./index.js";

describe("Prompt Loading", () => {
  describe("hasBuiltInPrompt", () => {
    it("returns true for director", () => {
      expect(hasBuiltInPrompt("director")).toBe(true);
    });

    it("returns true for worker", () => {
      expect(hasBuiltInPrompt("worker")).toBe(true);
    });

    it("returns true for steward base", () => {
      expect(hasBuiltInPrompt("steward")).toBe(true);
    });

    it("returns true for steward with focus", () => {
      expect(hasBuiltInPrompt("steward", "merge")).toBe(true);
      expect(hasBuiltInPrompt("steward", "docs")).toBe(true);
      expect(hasBuiltInPrompt("steward", "recovery")).toBe(true);
    });
  });

  describe("listBuiltInPrompts", () => {
    it("returns all prompt file names", () => {
      const files = listBuiltInPrompts();
      expect(files).toContain("director.md");
      expect(files).toContain("worker.md");
      expect(files).toContain("steward-base.md");
      expect(files).toContain("steward-merge.md");
      expect(files).toContain("steward-docs.md");
      expect(files).toContain("steward-recovery.md");
      expect(files).not.toContain("steward-health.md");
      expect(files).not.toContain("steward-ops.md");
      expect(files).not.toContain("steward-reminder.md");
    });
  });

  describe("loadBuiltInPrompt", () => {
    it("loads director prompt", () => {
      const prompt = loadBuiltInPrompt("director");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are the **Director**");
    });

    it("loads worker prompt", () => {
      const prompt = loadBuiltInPrompt("worker");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are an **Ephemeral Worker**");
    });

    it("loads steward base prompt", () => {
      const prompt = loadBuiltInPrompt("steward");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are a **Steward**");
    });

    it("combines steward base with focus", () => {
      const prompt = loadBuiltInPrompt("steward", "merge");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are a **Steward**"); // Base
      expect(prompt).toContain("You are a **Merge Steward**"); // Focus
    });
  });

  describe("loadRolePrompt", () => {
    it("loads director with source info", () => {
      const result = loadRolePrompt("director");
      expect(result).toBeDefined();
      expect(result!.source).toBe("built-in");
      expect(result!.prompt).toContain("You are the **Director**");
    });

    it("loads worker with source info", () => {
      const result = loadRolePrompt("worker");
      expect(result).toBeDefined();
      expect(result!.source).toBe("built-in");
      expect(result!.prompt).toContain("You are an **Ephemeral Worker**");
    });

    it("loads steward with source info for base and focus", () => {
      const result = loadRolePrompt("steward", "merge");
      expect(result).toBeDefined();
      expect(result!.source).toBe("built-in");
      expect(result!.baseSource).toBe("built-in");
      expect(result!.focusSource).toBe("built-in");
      expect(result!.prompt).toContain("You are a **Steward**");
      expect(result!.prompt).toContain("You are a **Merge Steward**");
    });
  });

  describe("buildAgentPrompt", () => {
    it("builds director prompt without task context", () => {
      const prompt = buildAgentPrompt({ role: "director" });
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are the **Director**");
      expect(prompt).not.toContain("# Current Task");
    });

    it("builds worker prompt with task context", () => {
      const prompt = buildAgentPrompt({
        role: "worker",
        taskContext: "Implement user authentication with OAuth2.",
      });
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are an **Ephemeral Worker**");
      expect(prompt).toContain("# Current Task");
      expect(prompt).toContain("OAuth2");
    });

    it("builds steward prompt with focus", () => {
      const prompt = buildAgentPrompt({
        role: "steward",
        stewardFocus: "docs",
      });
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are a **Steward**");
    });

    it("adds additional instructions", () => {
      const prompt = buildAgentPrompt({
        role: "worker",
        additionalInstructions: "Remember to write tests for all new code.",
      });
      expect(prompt).toBeDefined();
      expect(prompt).toContain("Remember to write tests");
    });
  });
});

describe("Persistent Worker Prompt Loading", () => {
  describe("loadBuiltInPrompt with workerMode", () => {
    it("loads ephemeral worker prompt by default", () => {
      const prompt = loadBuiltInPrompt("worker");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are an **Ephemeral Worker**");
    });

    it("loads persistent worker prompt when workerMode is persistent", () => {
      const prompt = loadBuiltInPrompt("worker", undefined, "persistent");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are a **Persistent Worker**");
      expect(prompt).not.toContain("Ephemeral Worker");
    });

    it("loads ephemeral worker prompt when workerMode is ephemeral", () => {
      const prompt = loadBuiltInPrompt("worker", undefined, "ephemeral");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are an **Ephemeral Worker**");
    });
  });

  describe("loadRolePrompt with workerMode", () => {
    it("loads ephemeral worker prompt by default (backward compat)", () => {
      const result = loadRolePrompt("worker");
      expect(result).toBeDefined();
      expect(result!.prompt).toContain("You are an **Ephemeral Worker**");
    });

    it("loads persistent worker prompt via options", () => {
      const result = loadRolePrompt("worker", undefined, { workerMode: "persistent" });
      expect(result).toBeDefined();
      expect(result!.source).toBe("built-in");
      expect(result!.prompt).toContain("You are a **Persistent Worker**");
    });
  });

  describe("hasBuiltInPrompt with workerMode", () => {
    it("returns true for persistent worker", () => {
      expect(hasBuiltInPrompt("worker", undefined, "persistent")).toBe(true);
    });

    it("returns true for ephemeral worker (default)", () => {
      expect(hasBuiltInPrompt("worker")).toBe(true);
    });
  });

  describe("buildAgentPrompt with workerMode", () => {
    it("builds persistent worker prompt", () => {
      const prompt = buildAgentPrompt({ role: "worker", workerMode: "persistent" });
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are a **Persistent Worker**");
      expect(prompt).not.toContain("Ephemeral Worker");
    });

    it("builds ephemeral worker prompt by default", () => {
      const prompt = buildAgentPrompt({ role: "worker" });
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are an **Ephemeral Worker**");
    });
  });
});

describe("Prompt Content", () => {
  describe("Director prompt", () => {
    it("includes inbox check workflow", () => {
      const prompt = loadBuiltInPrompt("director");
      expect(prompt).toContain("sf inbox <Director ID>");
      expect(prompt).toContain("Always check your inbox");
    });

    it("includes task sizing guidance", () => {
      const prompt = loadBuiltInPrompt("director");
      expect(prompt).toContain("small, focused tasks");
    });

    it("includes judgment scenarios", () => {
      const prompt = loadBuiltInPrompt("director");
      expect(prompt).toContain("Judgment Scenarios");
    });
  });

  describe("Worker prompt", () => {
    it("includes handoff guidance", () => {
      const prompt = loadBuiltInPrompt("worker");
      expect(prompt).toContain("sf task handoff");
      expect(prompt).toContain("Handoff");
    });

    it("includes nudge response guidance", () => {
      const prompt = loadBuiltInPrompt("worker");
      expect(prompt).toContain("nudge");
      expect(prompt).toContain("continue or handoff");
    });

    it("includes task creation guidance", () => {
      const prompt = loadBuiltInPrompt("worker");
      expect(prompt).toContain("sf task create");
      expect(prompt).toContain("Discovering Additional Work");
    });

    it("includes director lookup command", () => {
      const prompt = loadBuiltInPrompt("worker");
      expect(prompt).toContain("sf agent list --role director");
    });
  });

  describe("Persistent worker prompt", () => {
    it("includes sf merge command", () => {
      const prompt = loadBuiltInPrompt("worker", undefined, "persistent");
      expect(prompt).toContain("sf merge");
    });

    it("does NOT include task handoff or complete", () => {
      const prompt = loadBuiltInPrompt("worker", undefined, "persistent");
      expect(prompt).not.toContain("sf task handoff");
      expect(prompt).not.toContain("sf task complete");
      expect(prompt).not.toContain("sf task create");
    });

    it("does NOT include auto-shutdown or daemon dispatch model", () => {
      const prompt = loadBuiltInPrompt("worker", undefined, "persistent");
      expect(prompt).not.toContain("Auto-shutdown");
      expect(prompt).not.toContain("your session ends automatically");
      expect(prompt).not.toContain("Do not check the task queue");
    });

    it("includes director lookup command", () => {
      const prompt = loadBuiltInPrompt("worker", undefined, "persistent");
      expect(prompt).toContain("sf agent list --role director");
    });

    it("includes session branch context", () => {
      const prompt = loadBuiltInPrompt("worker", undefined, "persistent");
      expect(prompt).toContain("session/{worker-name}-{timestamp}");
    });

    it("includes documentation guidance", () => {
      const prompt = loadBuiltInPrompt("worker", undefined, "persistent");
      expect(prompt).toContain("sf document search");
      expect(prompt).toContain("Documentation Directory");
    });
  });

  describe("Steward prompts", () => {
    it("base includes escalation guidance", () => {
      const prompt = loadBuiltInPrompt("steward");
      expect(prompt).toContain("--to <Director ID>");
      expect(prompt).toContain("escalation");
    });

    it("merge focus includes test workflow", () => {
      const prompt = loadBuiltInPrompt("steward", "merge");
      expect(prompt).toContain("Tests pass");
      expect(prompt).toContain("Tests fail");
    });

    it("docs focus loads successfully", () => {
      const prompt = loadBuiltInPrompt("steward", "docs");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are a **Steward**");
    });

    it("recovery focus includes recovery workflow", () => {
      const prompt = loadBuiltInPrompt("steward", "recovery");
      expect(prompt).toBeDefined();
      expect(prompt).toContain("You are a **Steward**"); // Base
      expect(prompt).toContain("Recovery Steward"); // Focus
    });
  });
});
