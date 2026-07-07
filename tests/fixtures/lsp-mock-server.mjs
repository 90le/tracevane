#!/usr/bin/env node
const HEADER_SEPARATOR = "\r\n\r\n";
let buffer = Buffer.alloc(0);
let requestCount = 0;

function encode(message) {
  const body = JSON.stringify(message);
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body, "utf8")}${HEADER_SEPARATOR}${body}`, "utf8");
}

function send(message) {
  process.stdout.write(encode(message));
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function parse() {
  while (buffer.length) {
    const headerEnd = buffer.indexOf(HEADER_SEPARATOR);
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const match = /^Content-Length:\s*(\d+)$/im.exec(header);
    if (!match) {
      buffer = buffer.subarray(headerEnd + HEADER_SEPARATOR.length);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + HEADER_SEPARATOR.length;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;
    const message = JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString("utf8"));
    buffer = buffer.subarray(bodyEnd);
    handle(message);
  }
}

function handle(message) {
  if (message.method === "initialize") {
    respond(message.id, { capabilities: { textDocumentSync: 1, hoverProvider: true } });
    return;
  }
  if (message.method === "initialized") return;
  if (message.method === "shutdown") {
    respond(message.id, null);
    return;
  }
  if (message.method === "exit") {
    setTimeout(() => process.exit(0), 5);
    return;
  }
  if (message.method === "echo/request") {
    respond(message.id, { echoed: message.params, count: ++requestCount });
    return;
  }
  if (message.method === "slow/request") return;
  if (message.method === "stderr/request") {
    process.stderr.write("mock stderr line\\n");
    respond(message.id, { ok: true });
    return;
  }
  if (message.method === "crash/request") {
    process.stderr.write("mock crash line\\n");
    process.exit(42);
    return;
  }
  if (message.method === "textDocument/didOpen") {
    const uri = message.params?.textDocument?.uri ?? "file:///mock.txt";
    send({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri,
        diagnostics: [{ message: "mock diagnostic", severity: 2, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } } }],
      },
    });
    return;
  }
  if (Object.prototype.hasOwnProperty.call(message, "id")) respond(message.id, null);
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  parse();
});
