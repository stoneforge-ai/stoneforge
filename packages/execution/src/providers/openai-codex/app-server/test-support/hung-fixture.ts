export const codexAppServerHungTurnScript = `
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
    if (message.method === "initialized") continue;
    if (message.method === "thread/start") {
      write({ id: message.id, result: { thread: { id: "thread-hung" } } });
      continue;
    }
    if (message.method === "turn/start") {
      write({ id: message.id, result: { turn: { id: "turn-hung" } } });
    }
  }
});
`

export const codexAppServerExitScript = `
process.stderr.write("startup failed");
process.exit(7);
`

export const codexAppServerExitDuringTurnScript = `
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
      write({ id: message.id, result: { thread: { id: "thread-crash" } } });
    }
    if (message.method === "turn/start") {
      write({ id: message.id, result: { turn: { id: "turn-crash" } } });
      process.stderr.write("turn crashed");
      process.exit(8);
    }
  }
});
`

export const codexAppServerCompletionWithoutTurnStartResponseScript = `
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
    if (message.method === "initialized") continue;
    if (message.method === "thread/start") {
      write({ id: message.id, result: { thread: { id: "thread-notify-only" } } });
      continue;
    }
    if (message.method === "turn/start") {
      write({
        method: "item/agentMessage/delta",
        params: { delta: "Notification-only completion." }
      });
      write({
        method: "turn/completed",
        params: { turn: { id: "turn-notify-only", status: "completed" } }
      });
    }
  }
});
`
