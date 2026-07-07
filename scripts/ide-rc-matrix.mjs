#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const GROUPS = {
  fileSurface: [
    'smoke:file-manager:online-editor',
    'smoke:file-manager:online-editor-responsive',
    'smoke:file-manager:file-surface-routing',
    'smoke:file-manager:media-preview',
    'smoke:file-manager:file-operations',
    'smoke:file-manager:monaco-highlighting',
    'smoke:file-manager:monaco-clipboard',
    'smoke:file-manager:monaco-nls',
  ],
  workbenchEditor: [
    'smoke:ide:workbench-layout',
    'smoke:ide:editor-foundation',
    'smoke:ide:editor-save-dirty',
    'smoke:ide:editor-conflict-diff',
  ],
  terminal: [
    'smoke:ide:terminal-foundation',
    'smoke:ide:terminal-split-layout',
    'smoke:ide:terminal-panel-placement',
    'smoke:ide:terminal-persistence',
    'smoke:ide:terminal-manager',
    'smoke:ide:terminal-durable-backend',
  ],
  searchProblemsOutput: [
    'smoke:ide:watcher-foundation',
    'smoke:ide:search-foundation',
    'smoke:ide:problems-output',
  ],
  lsp: [
    'smoke:ide:lsp-diagnostics',
    'smoke:ide:lsp-interaction',
    'smoke:ide:lsp-typescript-diagnostics',
    'smoke:ide:lsp-typescript-interaction',
    'smoke:ide:lsp-typescript-completion',
    'smoke:ide:lsp-typescript-references',
    'smoke:ide:lsp-workspace-edit-foundation',
    'smoke:ide:lsp-rename-format-code-actions',
  ],
  git: [
    'smoke:ide:git-status',
    'smoke:ide:git-diff',
    'smoke:ide:git-stage',
    'smoke:ide:git-commit',
    'smoke:ide:git-branch-upstream',
    'smoke:ide:git-remote-foundation',
    'smoke:ide:git-branch-stash-foundation',
    'smoke:ide:git-branch-stash-hardening',
  ],
  debug: [
    'smoke:ide:debug-foundation',
    'smoke:ide:debug-breakpoints',
    'smoke:ide:debug-adapter-proof',
    'smoke:ide:debug-lifecycle',
    'smoke:ide:debug-launch-profile',
    'smoke:ide:debug-node-inspector',
    'smoke:ide:debug-controls-scopes',
    'smoke:ide:debug-watch-evaluate',
  ],
};

const QUICK = [
  'typecheck:api -- --pretty false',
  'typecheck:web -- --pretty false',
  'smoke:ide:workbench-layout',
  'smoke:ide:editor-foundation',
  'smoke:ide:terminal-foundation',
  'smoke:ide:search-foundation',
  'smoke:ide:problems-output',
  'smoke:ide:lsp-diagnostics',
  'smoke:ide:git-status',
  'smoke:ide:debug-foundation',
  ':git-diff-check',
];

const FULL = [
  'typecheck:api -- --pretty false',
  'typecheck:web -- --pretty false',
  ...Object.values(GROUPS).flat(),
  ':git-diff-check',
];

const args = new Set(process.argv.slice(2));
const domainArg = process.argv.find((arg) => arg.startsWith('--domain='));
const listMode = args.has('--list');
const dryRun = args.has('--dry-run');
const continueOnError = args.has('--continue-on-error');
const rcWebPort = process.env.TRACEVANE_RC_WEB_PORT || process.env.TRACEVANE_WEB_PORT || '5310';
const SELF_STARTING_SMOKE_PREFIXES = ['smoke:ide:debug-'];

function usage() {
  console.log(`Tracevane IDE RC smoke matrix runner\n\nUsage:\n  node scripts/ide-rc-matrix.mjs --quick [--dry-run] [--continue-on-error]\n  node scripts/ide-rc-matrix.mjs --full [--dry-run] [--continue-on-error]\n  node scripts/ide-rc-matrix.mjs --domain=<${Object.keys(GROUPS).join('|')}> [--dry-run]\n  node scripts/ide-rc-matrix.mjs --list [--quick|--full|--domain=<name>]\n\nNotes:\n  - Commands run sequentially through npm scripts.\n  - Full matrix is intentionally long; use --quick for PR gate.\n  - :git-diff-check runs \`git diff --check\`.\n  - Smoke commands default to TRACEVANE_RC_WEB_PORT/TRACEVANE_WEB_PORT or 5310 so local dev servers on 5176 do not contaminate RC evidence.\n  - with_server smoke scripts also receive TRACEVANE_WEB_SMOKE_URL; self-starting debug smokes only receive TRACEVANE_WEB_PORT.\n`);
}

function selectedCommands() {
  if (domainArg) {
    const name = domainArg.slice('--domain='.length);
    if (!GROUPS[name]) {
      throw new Error(`Unknown domain '${name}'. Expected one of: ${Object.keys(GROUPS).join(', ')}`);
    }
    return GROUPS[name];
  }
  if (args.has('--full')) return FULL;
  if (args.has('--quick')) return QUICK;
  return QUICK;
}

function printCommands(commands) {
  for (const command of commands) {
    console.log(command.startsWith(':') ? command : `npm run ${command}`);
  }
}

function cleanupSmokeArtifacts() {
  const workbenchTestDir = path.join(process.cwd(), 'tests', 'ide-workbench');
  const repoRootPatterns = [
    /^tracevane-terminal-focus-.*\.ts$/,
  ];
  const workbenchPatterns = [
    /^git-(?:status|diff|stage|commit|branch|remote)-smoke-.*\.txt$/,
    /^tracevane-terminal-focus-.*\.ts$/,
  ];

  for (const [directory, patterns] of [[process.cwd(), repoRootPatterns], [workbenchTestDir, workbenchPatterns]]) {
    let entries = [];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!patterns.some((pattern) => pattern.test(entry.name))) continue;
      try {
        fs.rmSync(path.join(directory, entry.name), { force: true });
      } catch {
        // Best-effort cleanup for failed smoke runs; the next command will
        // surface a real failure if stale artifacts still affect it.
      }
    }
  }
}

function runShell(command, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: 'inherit', env });
    child.on('close', (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

async function runCommand(command) {
  cleanupSmokeArtifacts();
  const shellCommand = command === ':git-diff-check' ? 'git diff --check' : `npm run ${command}`;
  const isSmokeCommand = command.startsWith('smoke:');
  const isSelfStartingSmoke = SELF_STARTING_SMOKE_PREFIXES.some((prefix) =>
    command.startsWith(prefix),
  );
  const smokeWebPort = process.env.TRACEVANE_WEB_PORT || rcWebPort;
  const commandEnv = isSmokeCommand
    ? {
        ...process.env,
        TRACEVANE_WEB_PORT: smokeWebPort,
        ...(isSelfStartingSmoke
          ? {}
          : {
              TRACEVANE_WEB_SMOKE_URL:
                process.env.TRACEVANE_WEB_SMOKE_URL ||
                `http://127.0.0.1:${smokeWebPort}`,
            }),
      }
    : process.env;
  const envLabel = isSmokeCommand
    ? ` TRACEVANE_WEB_PORT=${commandEnv.TRACEVANE_WEB_PORT}${commandEnv.TRACEVANE_WEB_SMOKE_URL ? ` TRACEVANE_WEB_SMOKE_URL=${commandEnv.TRACEVANE_WEB_SMOKE_URL}` : ''}`
    : '';
  console.log(`\n[ide-rc]${envLabel} ${shellCommand}`);
  if (dryRun) return { command, code: 0 };
  const result = await runShell(shellCommand, commandEnv);
  cleanupSmokeArtifacts();
  return { command, code: result.code, signal: result.signal };
}

try {
  if (args.has('--help') || args.has('-h')) {
    usage();
    process.exit(0);
  }
  const commands = selectedCommands();
  if (listMode || dryRun) {
    printCommands(commands);
    process.exit(0);
  }

  const failures = [];
  for (const command of commands) {
    const result = await runCommand(command);
    if (result.code !== 0) {
      failures.push(result);
      if (!continueOnError) break;
    }
  }

  if (failures.length) {
    console.error('\n[ide-rc] failures:');
    for (const failure of failures) {
      console.error(`- ${failure.command}: exit ${failure.code}${failure.signal ? ` signal ${failure.signal}` : ''}`);
    }
    process.exit(1);
  }
  console.log('\n[ide-rc] matrix completed successfully');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
}
