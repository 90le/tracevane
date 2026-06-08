#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:3761";
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".config/openclaw-studio/channel-connectors/config.json");
const DEFAULT_STATE_DIR = path.join(os.homedir(), ".config/openclaw-studio/channel-connectors/daemon/state");
const DEFAULT_COMMANDS = ["/new", "/reset", "/compact"];

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    configPath: DEFAULT_CONFIG_PATH,
    stateDir: DEFAULT_STATE_DIR,
    bindings: [],
    platforms: [],
    commands: [...DEFAULT_COMMANDS],
    fromUid: "",
    channelId: "",
    channelType: 1,
    feishuChatType: "p2p",
    feishuToken: "",
    apply: false,
    probe: false,
    sendReply: true,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--probe") options.probe = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--no-send-reply") options.sendReply = false;
    else if (arg === "--base-url") options.baseUrl = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--base-url=")) options.baseUrl = arg.slice("--base-url=".length);
    else if (arg === "--config") options.configPath = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--config=")) options.configPath = arg.slice("--config=".length);
    else if (arg === "--state-dir") options.stateDir = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--state-dir=")) options.stateDir = arg.slice("--state-dir=".length);
    else if (arg === "--bindings") options.bindings = csv(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--bindings=")) options.bindings = csv(arg.slice("--bindings=".length));
    else if (arg === "--platforms") options.platforms = csv(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--platforms=")) options.platforms = csv(arg.slice("--platforms=".length));
    else if (arg === "--commands") options.commands = csv(requireValue(argv, ++index, arg)).map(normalizeCommand);
    else if (arg.startsWith("--commands=")) options.commands = csv(arg.slice("--commands=".length)).map(normalizeCommand);
    else if (arg === "--from-uid") options.fromUid = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--from-uid=")) options.fromUid = arg.slice("--from-uid=".length);
    else if (arg === "--channel-id") options.channelId = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--channel-id=")) options.channelId = arg.slice("--channel-id=".length);
    else if (arg === "--channel-type") options.channelType = positiveInt(requireValue(argv, ++index, arg), 1);
    else if (arg.startsWith("--channel-type=")) options.channelType = positiveInt(arg.slice("--channel-type=".length), 1);
    else if (arg === "--feishu-chat-type") options.feishuChatType = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--feishu-chat-type=")) options.feishuChatType = arg.slice("--feishu-chat-type=".length);
    else if (arg === "--feishu-token") options.feishuToken = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--feishu-token=")) options.feishuToken = arg.slice("--feishu-token=".length);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.baseUrl = options.baseUrl.replace(/\/+$/, "");
  options.configPath = path.resolve(options.configPath);
  options.stateDir = path.resolve(options.stateDir);
  options.commands = options.commands.filter(Boolean);
  if (!options.commands.length) options.commands = [...DEFAULT_COMMANDS];
  if (options.apply && !options.fromUid) throw new Error("--apply requires --from-uid");
  if (options.apply && !options.channelId) throw new Error("--apply requires --channel-id");
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-channel-connectors-command-live.mjs [options]

Plans or probes Channel Connector slash commands against the live Studio backend.
Default mode is a no-side-effect dry-run plan. Use --probe to POST dry-run adapter
requests. Use --apply to send real channel replies through configured transports.

Options:
  --bindings <ids>        Comma-separated binding ids. Default: enabled Octo/Feishu bindings.
  --platforms <ids>       octo,feishu filter.
  --commands <cmds>       Comma-separated slash commands. Default: ${DEFAULT_COMMANDS.join(",")}
  --from-uid <id>         IM user/open_id for probe/apply.
  --channel-id <id>       IM channel/chat id for probe/apply.
  --channel-type <n>      Octo channel type. Default: 1.
  --feishu-chat-type <t>  Feishu chat_type. Default: p2p.
  --feishu-token <token>  Feishu verification token override.
  --base-url <url>        Studio API base. Default: ${DEFAULT_BASE_URL}
  --config <path>         Native Channel config. Default: ${DEFAULT_CONFIG_PATH}
  --state-dir <path>      Daemon state dir. Default: ${DEFAULT_STATE_DIR}
  --probe                 POST adapter dry-run requests; no transport send.
  --apply                 POST adapter requests with sendReply enabled.
  --no-send-reply         With --apply, execute commands without sending transport reply.
  --json                  Emit JSON only.
  -h, --help              Show this help

Examples:
  node scripts/smoke-channel-connectors-command-live.mjs --json
  node scripts/smoke-channel-connectors-command-live.mjs --bindings octo-studio-cc --from-uid user --channel-id user --probe --json
  node scripts/smoke-channel-connectors-command-live.mjs --bindings feishu-live --from-uid ou_x --channel-id oc_x --commands /new,/reset --apply
`);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function csv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeCommand(value) {
  const normalized = String(value || "").trim();
  return normalized ? (normalized.startsWith("/") ? normalized : `/${normalized}`) : "";
}

function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function selectBindings(config, options) {
  const requested = new Set(options.bindings);
  const platforms = new Set(options.platforms);
  return (config.platformBindings || []).filter((binding) => {
    if (binding.enabled === false) return false;
    if (!["octo", "feishu"].includes(binding.platform)) return false;
    if (requested.size && !requested.has(binding.id)) return false;
    if (platforms.size && !platforms.has(binding.platform)) return false;
    return true;
  });
}

function profileForBinding(config, binding) {
  return (config.agentProfiles || []).find((profile) => profile.id === binding.agentProfileId) || null;
}

function verificationToken(binding, override) {
  if (override) return override;
  const metadata = binding.metadata && typeof binding.metadata === "object" ? binding.metadata : {};
  return String(metadata.verificationToken || metadata.verification_token || "");
}

function sessionKeyFor(binding, options) {
  const fromUid = options.fromUid || binding.adminUsers?.[0] || binding.allowlist?.[0] || "studio-smoke-user";
  const channelId = options.channelId || fromUid;
  if (binding.platform === "octo") {
    return options.channelType === 1 ? `dmwork:dm:${fromUid}` : `dmwork:group:${channelId}`;
  }
  if (options.feishuChatType === "p2p") return `feishu:${channelId}:${fromUid}`;
  return `feishu:${channelId}`;
}

function stateCounts(options, binding, sessionKey) {
  const history = readJsonIfExists(path.join(options.stateDir, "channel-history.json"), { entries: [] });
  const sessions = readJsonIfExists(path.join(options.stateDir, "channel-sessions.json"), { sessions: {} });
  const historyEntries = (history.entries || []).filter((entry) => (
    entry.bindingId === binding.id && entry.sessionKey === sessionKey
  ));
  const agentSessions = Object.values(sessions.sessions || {}).filter((entry) => (
    entry.bindingId === binding.id && entry.sessionKey === sessionKey
  ));
  return {
    historyEntries: historyEntries.length,
    agentSessions: agentSessions.length,
    compactReady: historyEntries.length > 0,
  };
}

function plannedRequest(binding, command, options) {
  const fromUid = options.fromUid || binding.adminUsers?.[0] || binding.allowlist?.[0] || "studio-smoke-user";
  const channelId = options.channelId || fromUid;
  const idSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (binding.platform === "octo") {
    return {
      path: "/api/channel-connectors/adapters/octo/incoming",
      body: {
        bindingId: binding.id,
        dryRun: !options.apply,
        sendReply: options.apply && options.sendReply,
        message: {
          messageId: `studio-command-smoke-${idSuffix}`,
          fromUid,
          channelId,
          channelType: options.channelType,
          payload: { type: 1, content: command },
        },
      },
    };
  }
  return {
    path: "/api/channel-connectors/adapters/feishu/webhook",
    body: {
      bindingId: binding.id,
      dryRun: !options.apply,
      sendReply: options.apply && options.sendReply,
      schema: "2.0",
      header: {
        event_type: "im.message.receive_v1",
        app_id: binding.accountId || "studio-command-smoke",
        event_id: `studio-command-smoke-${idSuffix}`,
        token: verificationToken(binding, options.feishuToken),
      },
      event: {
        sender: { sender_id: { open_id: fromUid } },
        message: {
          message_id: `om_studio_command_smoke_${idSuffix.replace(/[^a-z0-9]/gi, "_")}`,
          chat_id: channelId,
          chat_type: options.feishuChatType,
          message_type: "text",
          content: JSON.stringify({ text: command }),
        },
      },
    },
  };
}

function redactRequest(request) {
  return {
    path: request.path,
    body: redactValue(request.body),
  };
}

function redactValue(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => redactValue(item, key));
  if (!value || typeof value !== "object") {
    return shouldRedactKey(key) && value ? "<redacted>" : value;
  }
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    redactValue(entryValue, entryKey),
  ]));
}

function shouldRedactKey(key) {
  return /token|secret|api[-_]?key|password|authorization/i.test(key);
}

function requestJson(baseUrl, requestPath, body) {
  const payload = JSON.stringify(body);
  const target = new URL(`${baseUrl}${requestPath}`);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: "POST",
      timeout: 30_000,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let parsed = raw;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = raw;
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`Timeout: ${requestPath}`)));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function summarizeResponse(response) {
  const body = response.body && typeof response.body === "object" ? response.body : {};
  return {
    status: response.status,
    accepted: body.accepted ?? null,
    skippedReason: body.skippedReason ?? null,
    command: body.commandAction?.command || body.command || null,
    action: body.commandAction?.commandResult?.action || body.commandResult?.action || null,
    ok: body.commandAction?.commandResult?.ok ?? body.commandResult?.ok ?? null,
    replyPreview: String(
      body.commandAction?.commandResult?.replyText
      || body.commandResult?.replyText
      || body.toast?.content
      || body.replyPlan?.chunks?.join("\n")
      || "",
    ).slice(0, 240),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = readJsonIfExists(options.configPath, null);
  if (!config) throw new Error(`Channel Connectors config not found: ${options.configPath}`);
  const selected = selectBindings(config, options);
  if (!selected.length) throw new Error("No enabled Octo/Feishu bindings matched the requested filters.");

  const plans = [];
  const rawRequests = [];
  for (const binding of selected) {
    const profile = profileForBinding(config, binding);
    const sessionKey = sessionKeyFor(binding, options);
    const state = stateCounts(options, binding, sessionKey);
    for (const command of options.commands) {
      const request = plannedRequest(binding, command, options);
      rawRequests.push(request);
      plans.push({
        bindingId: binding.id,
        platform: binding.platform,
        agent: profile?.agent || null,
        model: profile?.model || null,
        sessionKey,
        command,
        state,
        request: options.json ? redactRequest(request) : { path: request.path },
        result: null,
      });
    }
  }

  if (options.probe || options.apply) {
    for (let index = 0; index < plans.length; index += 1) {
      const plan = plans[index];
      const rawRequest = rawRequests[index];
      const response = await requestJson(options.baseUrl, rawRequest.path, rawRequest.body);
      plan.result = summarizeResponse(response);
    }
  }

  const output = {
    ok: true,
    checkedAt: new Date().toISOString(),
    mode: options.apply ? "apply" : options.probe ? "probe" : "dry-run",
    baseUrl: options.baseUrl,
    configPath: options.configPath,
    stateDir: options.stateDir,
    plans,
    note: options.apply
      ? "apply executed adapter requests; transport replies may have been sent"
      : options.probe
        ? "probe posted dry-run adapter requests; no transport replies were requested"
        : "dry-run only; pass --probe or --apply to execute",
  };

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`Channel command smoke ${output.mode}: ${plans.length} planned command(s)`);
  for (const plan of plans) {
    const compactNote = plan.command === "/compact" && !plan.state.compactReady
      ? " compact has no existing history"
      : "";
    console.log(`- ${plan.bindingId} ${plan.platform} ${plan.command} session=${plan.sessionKey} history=${plan.state.historyEntries} sessions=${plan.state.agentSessions}${compactNote}`);
    if (plan.result) {
      console.log(`  -> HTTP ${plan.result.status} accepted=${plan.result.accepted} ok=${plan.result.ok} action=${plan.result.action || "n/a"} ${plan.result.replyPreview}`);
    }
  }
  console.log(output.note);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(message);
  }
  process.exit(1);
});
