import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import type { ExternalLanguageServerSpawn, LspJsonRpcMessage } from "./externalLanguageServerTypes.js";
import { encodeLspMessage, LspMessageFramingParser } from "./lspMessageFraming.js";

export interface LspStdioTransportOptions {
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  spawn?: ExternalLanguageServerSpawn;
  onMessage: (message: LspJsonRpcMessage) => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  onError?: (error: Error) => void;
  onStderr?: (chunk: Buffer) => void;
}

export class LspStdioTransport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly parser: LspMessageFramingParser;

  constructor(private readonly options: LspStdioTransportOptions) {
    this.parser = new LspMessageFramingParser(options.onMessage, options.onError);
  }

  get pid(): number | null {
    return this.child?.pid ?? null;
  }

  get running(): boolean {
    return this.child != null && !this.child.killed;
  }

  start(): void {
    if (this.child) return;
    const spawn = this.options.spawn ?? nodeSpawn;
    const child = spawn(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
      stdio: "pipe",
    });
    this.child = child;
    child.stdout.on("data", (chunk) => this.parser.push(chunk));
    child.stderr.on("data", (chunk) => this.options.onStderr?.(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    child.on("error", (error) => this.options.onError?.(error));
    child.on("exit", (code, signal) => {
      this.options.onExit(code, signal);
      this.child = null;
    });
  }

  send(message: LspJsonRpcMessage): void {
    if (!this.child) throw new Error("External LSP transport is not running");
    this.child.stdin.write(encodeLspMessage(message));
  }

  kill(): void {
    this.child?.kill();
  }
}
