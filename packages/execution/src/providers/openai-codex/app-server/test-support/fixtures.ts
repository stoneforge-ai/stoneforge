export const codexAppServerFixtureScript = `
let buffer = "";
const write = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
process.stdout.write("\\n");
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      write({ id: 999, error: { code: -32601, message: "ignored" } });
      write({ id: message.id, result: { userAgent: "fixture-codex-app-server" } });
      continue;
    }
    if (message.method === "thread/start") {
      write({ id: message.id, result: { thread: { id: "thread-from-app-server" } } });
      continue;
    }
    if (message.method === "turn/start") {
      write({
        id: message.id,
        result: {
          turn: {
            id: "turn-from-app-server",
            status: "inProgress",
            items: [],
            error: null
          }
        }
      });
      write({ method: "session/idle", params: {} });
      write({
        method: "item/agentMessage/delta",
        params: {
          delta: "Codex App Server completed task.",
          threadId: "thread-from-app-server",
          turnId: "turn-from-app-server"
        }
      });
      setTimeout(() => write({
        method: "turn/completed",
        params: {
          turn: {
            id: "turn-ignored",
            status: "completed",
            items: [],
            error: null
          }
        }
      }), 1);
      setTimeout(() => write({
        method: "turn/completed",
        params: {
          turn: {
            id: "turn-from-app-server",
            status: "completed",
            items: [],
            error: null
          }
        }
      }), 2);
    }
  }
});
`

export const codexAppServerInitializeErrorScript = `
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  const line = chunk.split("\\n").find((item) => item.trim().length > 0);
  if (line === undefined) return;
  const message = JSON.parse(line);
  process.stdout.write(JSON.stringify({
    id: message.id,
    error: { code: -32000, message: "not authenticated" }
  }) + "\\n");
});
`

export const codexAppServerCompletedItemScript = `
let buffer = "";
const write = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      write({ id: message.id, result: {} });
      continue;
    }
    if (message.method === "thread/start") {
      write({ id: message.id, result: { thread: { id: "thread-completed-item" } } });
      continue;
    }
    if (message.method === "turn/start") {
      write({ id: message.id, result: { turn: { id: "turn-completed-item" } } });
      write({
        method: "item/agentMessage/delta",
        params: { delta: "stale delta summary" }
      });
      write({
        method: "item/completed",
        params: {
          item: {
            id: "item-tool-message",
            type: "toolCall",
            text: "Ignored tool result."
          }
        }
      });
      write({
        method: "item/completed",
        params: {
          item: {
            id: "item-agent-message",
            type: "agentMessage",
            text: "Authoritative completed item summary."
          }
        }
      });
      write({
        method: "turn/completed",
        params: {
          turn: { id: "turn-completed-item", status: "completed" }
        }
      });
    }
  }
});
`

export const codexAppServerEarlyCompletionScript = `
let buffer = "";
const write = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      write({ id: message.id, result: {} });
      continue;
    }
    if (message.method === "thread/start") {
      write({ id: message.id, result: { thread: { id: "thread-early" } } });
      continue;
    }
    if (message.method === "turn/start") {
      write({
        method: "item/agentMessage/delta",
        params: { delta: "Early completion summary." }
      });
      write({
        method: "turn/completed",
        params: { turn: { id: "turn-early", status: "completed" } }
      });
      setTimeout(() => write({
        id: message.id,
        result: { turn: { id: "turn-early" } }
      }), 1);
    }
  }
});
`


export const codexAppServerInvalidJsonScript = `
process.stdout.write("{not-json}\\n");
`

export const codexAppServerMalformedThreadScript = `
let count = 0;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  for (const line of chunk.split("\\n")) {
    if (line.trim().length === 0) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + "\\n");
      continue;
    }
    if (message.method === "thread/start" && count === 0) {
      count++;
      process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + "\\n");
    }
  }
});
`

export const codexAppServerFailedTurnScript =
  codexAppServerFailedTurnScriptWithError(
    "thread-failed",
    "turn-failed",
    `{ message: '{"detail":"model gpt-5.5 is not available"}' }`
  )

export const codexAppServerFailedTurnRawErrorScript =
  codexAppServerFailedTurnScriptWithError(
    "thread-failed-raw",
    "turn-failed-raw",
    `{ message: "provider failure without JSON detail" }`
  )

function codexAppServerFailedTurnScriptWithError(
  threadId: string,
  turnId: string,
  error: string
): string {
  return `
let buffer = "";
const write = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      write({ id: message.id, result: {} });
      continue;
    }
    if (message.method === "thread/start") {
      write({ id: message.id, result: { thread: { id: "${threadId}" } } });
      continue;
    }
    if (message.method === "turn/start") {
      write({ id: message.id, result: { turn: { id: "${turnId}" } } });
      write({
        method: "turn/completed",
        params: {
          turn: {
            error: ${error},
            id: "${turnId}",
            status: "failed"
          }
        }
      });
    }
  }
});
`
}

export const codexAppServerMalformedTurnScript = `
let buffer = "";
const write = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      write({ id: message.id, result: {} });
      continue;
    }
    if (message.method === "thread/start") {
      write({ id: message.id, result: { thread: { id: "thread-malformed" } } });
      continue;
    }
    if (message.method === "turn/start") {
      write({ id: message.id, result: { turn: { status: "inProgress" } } });
    }
  }
});
`
