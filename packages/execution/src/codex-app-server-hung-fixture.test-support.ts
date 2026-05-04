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
