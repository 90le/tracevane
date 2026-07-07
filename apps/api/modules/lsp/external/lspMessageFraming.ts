import type { LspJsonRpcMessage } from "./externalLanguageServerTypes.js";

const HEADER_SEPARATOR = "\r\n\r\n";
const CONTENT_LENGTH_HEADER = /^Content-Length:\s*(\d+)$/i;

export function encodeLspMessage(message: LspJsonRpcMessage): Buffer {
  const body = JSON.stringify(message);
  const bodyLength = Buffer.byteLength(body, "utf8");
  return Buffer.from(`Content-Length: ${bodyLength}${HEADER_SEPARATOR}${body}`, "utf8");
}

export class LspMessageFramingParser {
  private buffer = Buffer.alloc(0);

  constructor(
    private readonly onMessage: (message: LspJsonRpcMessage) => void,
    private readonly onError: (error: Error) => void = () => undefined,
  ) {}

  push(chunk: Buffer | string): void {
    this.buffer = Buffer.concat([this.buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8")]);
    this.drain();
  }

  private drain(): void {
    while (this.buffer.length > 0) {
      const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR);
      if (headerEnd < 0) return;

      const headerText = this.buffer.subarray(0, headerEnd).toString("ascii");
      const contentLength = parseContentLength(headerText);
      if (contentLength == null) {
        this.onError(new Error("Invalid LSP message: missing Content-Length header"));
        this.buffer = this.buffer.subarray(headerEnd + HEADER_SEPARATOR.length);
        continue;
      }

      const bodyStart = headerEnd + HEADER_SEPARATOR.length;
      const bodyEnd = bodyStart + contentLength;
      if (this.buffer.length < bodyEnd) return;

      const bodyText = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.subarray(bodyEnd);
      try {
        this.onMessage(JSON.parse(bodyText) as LspJsonRpcMessage);
      } catch (error) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}

function parseContentLength(headerText: string): number | null {
  for (const line of headerText.split("\r\n")) {
    const match = CONTENT_LENGTH_HEADER.exec(line.trim());
    if (!match) continue;
    const value = Number(match[1]);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  return null;
}
