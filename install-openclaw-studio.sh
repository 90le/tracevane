#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUDIO_DEFAULT_VERSION="${STUDIO_DEFAULT_VERSION:-0.1.37}"
VERSION_EXPLICIT=0
PACKAGE_URL_EXPLICIT=0
GATEWAY_BIND_EXPLICIT=0
MIN_VERSION_EXPLICIT=0
if [[ -n "${STUDIO_VERSION:-}" ]]; then
  VERSION_EXPLICIT=1
fi
if [[ -n "${STUDIO_PACKAGE_URL:-}" ]]; then
  PACKAGE_URL_EXPLICIT=1
fi
if [[ -n "${STUDIO_GATEWAY_BIND:-}" ]]; then
  GATEWAY_BIND_EXPLICIT=1
fi
if [[ -n "${OPENCLAW_MIN_VERSION:-}" ]]; then
  MIN_VERSION_EXPLICIT=1
fi
STUDIO_VERSION="${STUDIO_VERSION:-}"
OPENCLAW_MIN_VERSION="${OPENCLAW_MIN_VERSION:-2026.4.8}"
STUDIO_SITE_BASE="${STUDIO_SITE_BASE:-https://studio.90le.cn}"
STUDIO_PACKAGE_URL="${STUDIO_PACKAGE_URL:-}"
STUDIO_MODE="${STUDIO_MODE:-standalone}"
STUDIO_API_PORT="${STUDIO_API_PORT:-3760}"
STUDIO_GATEWAY_BASE_PATH="${STUDIO_GATEWAY_BASE_PATH:-/studio}"
STUDIO_GATEWAY_BIND="${STUDIO_GATEWAY_BIND:-lan}"
STUDIO_EXTENSIONS_DIR="${STUDIO_EXTENSIONS_DIR:-${HOME}/.openclaw/extensions}"
OPENCLAW_HOME_DIR="${OPENCLAW_HOME_DIR:-${HOME}/.openclaw}"
OPENCLAW_CONFIG_FILE="${OPENCLAW_CONFIG_PATH:-${OPENCLAW_HOME_DIR}/openclaw.json}"
INSTALL_DIR="${STUDIO_EXTENSIONS_DIR}/openclaw-studio"
BACKUP_ROOT="${OPENCLAW_HOME_DIR}/backups/openclaw-studio"
DRY_RUN=0
SKIP_UPGRADE=0
ACTIVE_BACKUP_DIR=""
CONFIG_BACKUP=""
ROLLBACK_DONE=0

read_local_release_defaults() {
  local package_path="${SCRIPT_DIR}/package.json"
  [[ -f "${package_path}" ]] || return 0

  local parsed
  parsed="$(
    node - "${package_path}" <<'NODE' 2>/dev/null || true
const fs = require('node:fs');
const packagePath = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const version = typeof pkg.version === 'string' ? pkg.version.trim() : '';
const rawMin = typeof pkg?.openclaw?.install?.minHostVersion === 'string' ? pkg.openclaw.install.minHostVersion.trim() : '';
const match = rawMin.match(/[0-9]+(?:\.[0-9A-Za-z-]+)+/g);
const minVersion = match ? match[match.length - 1] : '';
process.stdout.write(`${version}\t${minVersion}`);
NODE
  )"

  local bundled_version="${parsed%%$'\t'*}"
  local bundled_min_version=""
  if [[ "${parsed}" == *$'\t'* ]]; then
    bundled_min_version="${parsed#*$'\t'}"
  fi

  if [[ -n "${bundled_version}" ]]; then
    STUDIO_DEFAULT_VERSION="${bundled_version}"
  fi
  if [[ -n "${bundled_min_version}" && "${MIN_VERSION_EXPLICIT}" -eq 0 ]]; then
    OPENCLAW_MIN_VERSION="${bundled_min_version}"
  fi
}

read_local_release_defaults

log() {
  printf '[studio-installer] %s\n' "$*"
}

warn() {
  printf '[studio-installer] WARN: %s\n' "$*" >&2
}

die() {
  printf '[studio-installer] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
OpenClaw Studio 一键安装脚本

用法:
  bash install-openclaw-studio.sh [--mode standalone|gateway] [options]

常用示例:
  bash install-openclaw-studio.sh --mode standalone
  bash install-openclaw-studio.sh --mode gateway
  chmod +x ./install-openclaw-studio.sh
  ./install-openclaw-studio.sh --mode gateway

说明:
  gateway 单口模式会挂载到 OpenClaw Gateway 的 /studio，同时保留本机 3760 standalone 入口用于健康检查和回退。

选项:
  --mode <standalone|gateway>   安装模式，默认 standalone
  --version <version>           Studio 版本，默认 latest（站点最新）
  --site-base <url>             站点根地址，默认 https://studio.90le.cn
  --package-url <url>           安装包地址，默认按版本拼接
  --api-port <port>             standalone API 端口，默认 3760
  --base-path <path>            gateway basePath，默认 /studio
  --gateway-bind <mode>         gateway bind，默认 lan（auto|loopback|lan|tailnet|custom）
  --config <path>               OpenClaw 配置文件路径
  --extensions-dir <path>       扩展目录，默认 ~/.openclaw/extensions
  --skip-upgrade                不自动升级 OpenClaw
  --dry-run                     仅打印将执行的动作，不落盘
  -h, --help                    显示帮助
EOF
}

normalize_base_path() {
  local value="${1:-/studio}"
  if [[ -z "${value}" ]]; then
    printf '/studio'
    return 0
  fi
  if [[ "${value}" != /* ]]; then
    value="/${value}"
  fi
  value="${value%/}"
  if [[ -z "${value}" ]]; then
    value="/studio"
  fi
  printf '%s' "${value}"
}

run_cmd() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '[dry-run] '
    printf '%q ' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

run_cmd_allow_fail() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '[dry-run] '
    printf '%q ' "$@"
    printf '\n'
    return 0
  fi

  local output
  if output="$("$@" 2>&1)"; then
    [[ -n "${output}" ]] && printf '%s\n' "${output}"
    return 0
  fi

  printf '%s\n' "${output}" >&2
  return 1
}

rollback_install() {
  if [[ "${ROLLBACK_DONE}" -eq 1 || "${DRY_RUN}" -eq 1 ]]; then
    return 0
  fi
  ROLLBACK_DONE=1
  trap - ERR
  set +e
  warn "安装未完成，开始回滚已有更改"
  if [[ -n "${CONFIG_BACKUP}" && -f "${CONFIG_BACKUP}" ]]; then
    cp "${CONFIG_BACKUP}" "${OPENCLAW_CONFIG_FILE}" >/dev/null 2>&1 || warn "回滚 OpenClaw 配置失败: ${OPENCLAW_CONFIG_FILE}"
  fi
  if [[ -n "${ACTIVE_BACKUP_DIR}" && -d "${ACTIVE_BACKUP_DIR}" ]]; then
    rm -rf "${INSTALL_DIR}" >/dev/null 2>&1 || true
    mv "${ACTIVE_BACKUP_DIR}" "${INSTALL_DIR}" >/dev/null 2>&1 || warn "恢复旧版 Studio 安装失败: ${ACTIVE_BACKUP_DIR}"
  fi
  set -e
}

handle_install_error() {
  local line_no="${1:-unknown}"
  local exit_code="${2:-1}"
  rollback_install
  die "安装失败（line ${line_no}，exit ${exit_code}）"
}

resolve_remote_release_metadata() {
  local manifest_url
  local manifest_body
  local parsed
  for manifest_url in \
    "${STUDIO_SITE_BASE}/openclaw-studio-latest.json" \
    "${STUDIO_SITE_BASE}/studio-version.json" \
    "${STUDIO_SITE_BASE}/version.json"
  do
    if ! manifest_body="$(http_get "${manifest_url}" 2>/dev/null)"; then
      continue
    fi
    if ! parsed="$(
      STUDIO_RELEASE_METADATA="${manifest_body}" node - <<'NODE'
const raw = process.env.STUDIO_RELEASE_METADATA || '';
let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  process.exit(1);
}
const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
  ? parsed
  : {};
const version = typeof record.version === 'string'
  ? record.version.trim()
  : typeof record.latestVersion === 'string'
    ? record.latestVersion.trim()
    : '';
if (!version) {
  process.exit(1);
}
const openclaw = record.openclaw && typeof record.openclaw === 'object'
  ? record.openclaw
  : {};
const minVersion = typeof record.minOpenClawVersion === 'string'
  ? record.minOpenClawVersion.trim()
  : typeof record.minHostVersion === 'string'
    ? record.minHostVersion.trim()
    : typeof openclaw.minHostVersion === 'string'
      ? openclaw.minHostVersion.trim()
      : '';
const packageUrl = typeof record.packageUrl === 'string'
  ? record.packageUrl.trim()
  : '';
process.stdout.write([version, packageUrl, minVersion].join('\t'));
NODE
    )"; then
      continue
    fi
    if [[ -n "${parsed}" ]]; then
      printf '%s\n' "${parsed}"
      return 0
    fi
  done
  return 1
}

resolve_requested_release() {
  local remote_version=""
  local remote_package_url=""
  local remote_min_version=""
  local remote_metadata=""

  if [[ -z "${STUDIO_VERSION}" || "${STUDIO_VERSION}" == "latest" || "${STUDIO_VERSION}" == "auto" || "${PACKAGE_URL_EXPLICIT}" -eq 0 ]]; then
    if remote_metadata="$(resolve_remote_release_metadata)"; then
      IFS=$'\t' read -r remote_version remote_package_url remote_min_version <<< "${remote_metadata}"
    fi
  fi

  if [[ -z "${STUDIO_VERSION}" || "${STUDIO_VERSION}" == "latest" || "${STUDIO_VERSION}" == "auto" ]]; then
    STUDIO_VERSION="${remote_version:-${STUDIO_DEFAULT_VERSION}}"
  fi

  if [[ "${PACKAGE_URL_EXPLICIT}" -eq 0 ]]; then
    if [[ -n "${remote_package_url}" ]]; then
      STUDIO_PACKAGE_URL="${remote_package_url}"
    else
      STUDIO_PACKAGE_URL="${STUDIO_SITE_BASE}/openclaw-studio-${STUDIO_VERSION}.tar.gz"
    fi
  fi

  if [[ -n "${remote_min_version}" && "${MIN_VERSION_EXPLICIT}" -eq 0 ]]; then
    OPENCLAW_MIN_VERSION="${remote_min_version}"
  fi
}

http_get() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "${url}"
    return $?
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -qO- "${url}"
    return $?
  fi
  return 127
}

can_manage_gateway_service() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user show-environment >/dev/null 2>&1
    return $?
  fi
  if command -v launchctl >/dev/null 2>&1; then
    launchctl print "gui/$(id -u)" >/dev/null 2>&1
    return $?
  fi
  if command -v schtasks >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

start_gateway_fallback() {
  local log_dir="${OPENCLAW_HOME_DIR}/logs"
  local log_file="${log_dir}/studio-gateway-fallback.log"
  mkdir -p "${log_dir}"
  log "检测到当前环境无法管理用户级服务，改为后台拉起 Gateway（日志: ${log_file}）"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '[dry-run] nohup openclaw gateway run --force --ws-log compact > %q 2>&1 &\n' "${log_file}"
    return 0
  fi
  nohup openclaw gateway run --force --ws-log compact >"${log_file}" 2>&1 &
  sleep 2
  return 0
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"
}

download_file() {
  local url="$1"
  local output="$2"
  if command -v curl >/dev/null 2>&1; then
    run_cmd curl -fsSL "${url}" -o "${output}"
    return 0
  fi
  if command -v wget >/dev/null 2>&1; then
    run_cmd wget -qO "${output}" "${url}"
    return 0
  fi
  die "缺少 curl 或 wget，无法下载安装包"
}

version_lt() {
  node - "$1" "$2" <<'NODE'
const left = (process.argv[2].match(/\d+/g) || []).map(Number);
const right = (process.argv[3].match(/\d+/g) || []).map(Number);
const size = Math.max(left.length, right.length);
for (let i = 0; i < size; i += 1) {
  const a = left[i] ?? 0;
  const b = right[i] ?? 0;
  if (a < b) process.exit(0);
  if (a > b) process.exit(1);
}
process.exit(1);
NODE
}

read_config_json_field() {
  local expression="$1"
  node - "${OPENCLAW_CONFIG_FILE}" "${expression}" <<'NODE'
const fs = require('node:fs');
const configPath = process.argv[2];
const expression = process.argv[3];
let data = {};
try {
  data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {}
const fn = new Function('config', `return (${expression});`);
const value = fn(data);
if (value === undefined || value === null) {
  process.stdout.write('');
} else if (typeof value === 'object') {
  process.stdout.write(JSON.stringify(value));
} else {
  process.stdout.write(String(value));
}
NODE
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode)
        STUDIO_MODE="${2:-}"
        shift 2
        ;;
      --version)
        STUDIO_VERSION="${2:-}"
        VERSION_EXPLICIT=1
        shift 2
        ;;
      --site-base)
        STUDIO_SITE_BASE="${2:-}"
        shift 2
        ;;
      --package-url)
        STUDIO_PACKAGE_URL="${2:-}"
        PACKAGE_URL_EXPLICIT=1
        shift 2
        ;;
      --api-port)
        STUDIO_API_PORT="${2:-}"
        shift 2
        ;;
      --base-path)
        STUDIO_GATEWAY_BASE_PATH="${2:-}"
        shift 2
        ;;
      --gateway-bind)
        STUDIO_GATEWAY_BIND="${2:-}"
        GATEWAY_BIND_EXPLICIT=1
        shift 2
        ;;
      --config)
        OPENCLAW_CONFIG_FILE="${2:-}"
        shift 2
        ;;
      --extensions-dir)
        STUDIO_EXTENSIONS_DIR="${2:-}"
        INSTALL_DIR="${STUDIO_EXTENSIONS_DIR}/openclaw-studio"
        shift 2
        ;;
      --skip-upgrade)
        SKIP_UPGRADE=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "未知参数: $1"
        ;;
    esac
  done
}

parse_args "$@"
trap 'handle_install_error "$LINENO" "$?"' ERR

resolve_requested_release

STUDIO_GATEWAY_BASE_PATH="$(normalize_base_path "${STUDIO_GATEWAY_BASE_PATH}")"

case "${STUDIO_MODE}" in
  standalone|gateway) ;;
  *) die "--mode 只支持 standalone 或 gateway" ;;
esac

require_command node
require_command npm
require_command tar
require_command openclaw

CURRENT_OPENCLAW_VERSION="$(openclaw --version 2>/dev/null | grep -Eo '[0-9]{4}\.[0-9]+\.[0-9]+' | head -n1 || true)"
if [[ -z "${CURRENT_OPENCLAW_VERSION}" ]]; then
  die "无法读取 openclaw --version"
fi

log "当前 OpenClaw 版本: ${CURRENT_OPENCLAW_VERSION}"
log "目标 Studio 版本: ${STUDIO_VERSION}"
log "安装模式: ${STUDIO_MODE}"
if [[ "${STUDIO_MODE}" == "gateway" ]]; then
  log "单口模式会同时保留本机 standalone 入口: http://127.0.0.1:${STUDIO_API_PORT}/"
fi

if version_lt "${CURRENT_OPENCLAW_VERSION}" "${OPENCLAW_MIN_VERSION}"; then
  if [[ "${SKIP_UPGRADE}" -eq 1 ]]; then
    die "当前 OpenClaw 版本低于最低要求 ${OPENCLAW_MIN_VERSION}，且设置了 --skip-upgrade"
  fi
  log "OpenClaw 版本低于 ${OPENCLAW_MIN_VERSION}，准备升级"
  run_cmd npm install -g "openclaw@${OPENCLAW_MIN_VERSION}"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "dry-run 模式未实际升级 OpenClaw，后续版本检查以当前版本为准"
  else
    CURRENT_OPENCLAW_VERSION="$(openclaw --version 2>/dev/null | grep -Eo '[0-9]{4}\.[0-9]+\.[0-9]+' | head -n1 || true)"
    log "升级后 OpenClaw 版本: ${CURRENT_OPENCLAW_VERSION}"
    if version_lt "${CURRENT_OPENCLAW_VERSION}" "${OPENCLAW_MIN_VERSION}"; then
      die "升级后 OpenClaw 版本仍低于最低要求 ${OPENCLAW_MIN_VERSION}"
    fi
  fi
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

if [[ "${DRY_RUN}" -eq 0 ]]; then
  mkdir -p "${STUDIO_EXTENSIONS_DIR}"
  mkdir -p "$(dirname "${OPENCLAW_CONFIG_FILE}")"
  mkdir -p "${BACKUP_ROOT}"
  if [[ ! -f "${OPENCLAW_CONFIG_FILE}" ]]; then
    printf '{}\n' > "${OPENCLAW_CONFIG_FILE}"
  fi
fi

ARCHIVE_PATH="${TMP_DIR}/openclaw-studio.tar.gz"
log "下载安装包: ${STUDIO_PACKAGE_URL}"
download_file "${STUDIO_PACKAGE_URL}" "${ARCHIVE_PATH}"

log "解压安装包"
run_cmd tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  PACKAGE_DIR="${TMP_DIR}/openclaw-studio-${STUDIO_VERSION}"
else
  PACKAGE_DIR="$(find "${TMP_DIR}" -maxdepth 1 -mindepth 1 -type d -name 'openclaw-studio-*' | head -n1)"
fi
[[ -n "${PACKAGE_DIR}" ]] || die "未在安装包中找到 openclaw-studio-* 目录"

BACKUP_STAMP="$(date +%Y%m%d%H%M%S)"
cleanup_stale_extension_backup() {
  local entry="$1"
  [[ -e "${entry}" ]] || return 0
  local name
  name="$(basename "${entry}")"
  local backup_target="${BACKUP_ROOT}/${name}-${BACKUP_STAMP}"
  log "迁移旧扩展副本到备份目录: ${entry} -> ${backup_target}"
  run_cmd mv "${entry}" "${backup_target}"
}

cleanup_stale_extension_backup "${STUDIO_EXTENSIONS_DIR}/openclaw-studio.prev"
cleanup_stale_extension_backup "${STUDIO_EXTENSIONS_DIR}/openclaw-studio.bak"
cleanup_stale_extension_backup "${STUDIO_EXTENSIONS_DIR}/openclaw-studio.old"

if [[ -d "${INSTALL_DIR}" ]]; then
  ACTIVE_BACKUP_DIR="${BACKUP_ROOT}/openclaw-studio-${BACKUP_STAMP}"
  log "备份现有安装到 ${ACTIVE_BACKUP_DIR}"
  run_cmd mv "${INSTALL_DIR}" "${ACTIVE_BACKUP_DIR}"
fi
run_cmd mv "${PACKAGE_DIR}" "${INSTALL_DIR}"

log "修正发布包元数据"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  printf '[dry-run] node <repair-release-metadata> %q %q %q\n' "${INSTALL_DIR}" "${STUDIO_VERSION}" "${OPENCLAW_MIN_VERSION}"
else
  node - "${INSTALL_DIR}" "${STUDIO_VERSION}" "${OPENCLAW_MIN_VERSION}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const installDir = process.argv[2];
const version = process.argv[3];
const minHostVersion = process.argv[4];

const packagePath = path.join(installDir, 'package.json');
const manifestPath = path.join(installDir, 'openclaw.plugin.json');

if (!fs.existsSync(packagePath)) {
  throw new Error(`missing package.json: ${packagePath}`);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.version = version;
pkg.main = 'dist/index.js';
pkg.types = 'dist/index.d.ts';
pkg.exports = {
  '.': {
    import: './dist/index.js',
    types: './dist/index.d.ts',
  },
};
pkg.openclaw = pkg.openclaw && typeof pkg.openclaw === 'object' ? pkg.openclaw : {};
pkg.openclaw.id = 'studio';
pkg.openclaw.kind = 'ui';
pkg.openclaw.installDependencies = true;
pkg.openclaw.extensions = ['./dist/index.js'];
pkg.openclaw.install = pkg.openclaw.install && typeof pkg.openclaw.install === 'object' ? pkg.openclaw.install : {};
pkg.openclaw.install.minHostVersion = `>=${minHostVersion}`;
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.id = 'studio';
  manifest.version = version;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
NODE
fi

log "安装依赖"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  printf '[dry-run] cd %q && npm install --production --ignore-scripts\n' "${INSTALL_DIR}"
  printf '[dry-run] cd %q && npm rebuild @homebridge/node-pty-prebuilt-multiarch\n' "${INSTALL_DIR}"
else
  (
    cd "${INSTALL_DIR}"
    npm install --production --ignore-scripts
    npm rebuild @homebridge/node-pty-prebuilt-multiarch 2>/dev/null || warn "node-pty rebuild 失败，可稍后手工执行"
  )
fi

CONFIG_BACKUP="${OPENCLAW_CONFIG_FILE}.bak.$(date +%Y%m%d%H%M%S)"
if [[ "${DRY_RUN}" -eq 0 ]]; then
  cp "${OPENCLAW_CONFIG_FILE}" "${CONFIG_BACKUP}"
  log "已备份配置到 ${CONFIG_BACKUP}"
fi

log "写入 OpenClaw 配置"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  log "dry-run 模式下跳过配置写入"
else
  HAS_DOCKER=0
  if command -v docker >/dev/null 2>&1; then
    HAS_DOCKER=1
  fi
  node - "${OPENCLAW_CONFIG_FILE}" "${INSTALL_DIR}" "${STUDIO_MODE}" "${STUDIO_API_PORT}" "${STUDIO_GATEWAY_BASE_PATH}" "${HAS_DOCKER}" "${STUDIO_GATEWAY_BIND}" "${GATEWAY_BIND_EXPLICIT}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const configPath = process.argv[2];
const installDir = process.argv[3];
const mode = process.argv[4];
const apiPort = Number(process.argv[5] || 3760);
const basePath = String(process.argv[6] || '/studio');
const hasDocker = String(process.argv[7] || '0') === '1';
const preferredGatewayBind = String(process.argv[8] || 'lan');
const gatewayBindExplicit = String(process.argv[9] || '0') === '1';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items = [];
  for (const entry of value) {
    const normalized = normalizeString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push(normalized);
  }
  return items;
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) {
    parent[key] = {};
  }
  return parent[key];
}

function dreamingEnabled(entry) {
  return entry
    && typeof entry === 'object'
    && !Array.isArray(entry)
    && entry.config
    && typeof entry.config === 'object'
    && !Array.isArray(entry.config)
    && entry.config.dreaming
    && typeof entry.config.dreaming === 'object'
    && !Array.isArray(entry.config.dreaming)
    && entry.config.dreaming.enabled === true;
}

let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {
  config = {};
}

const projectRoot = path.resolve(installDir);
const projectRootKey = projectRoot.replace(/\\/g, '/');
const plugins = ensureObject(config, 'plugins');
plugins.enabled = true;
if (Array.isArray(plugins.deny)) {
  plugins.deny = normalizeStringList(plugins.deny).filter((item) => item !== 'studio');
}
const entries = ensureObject(plugins, 'entries');
const existingStudioEntry =
  entries.studio && typeof entries.studio === 'object' && !Array.isArray(entries.studio)
    ? entries.studio
    : {};
const studioEntry = {
  ...existingStudioEntry,
};
for (const key of Object.keys(studioEntry)) {
  if (!['enabled', 'hooks', 'subagent', 'config'].includes(key)) {
    delete studioEntry[key];
  }
}
entries.studio = studioEntry;
studioEntry.enabled = true;
const studioConfig = ensureObject(studioEntry, 'config');
studioConfig.autoStart = true;
studioConfig.apiPort = apiPort;
studioConfig.transport = studioConfig.transport && typeof studioConfig.transport === 'object' ? studioConfig.transport : {};
studioConfig.transport.preferredMode = mode;
studioConfig.transport.standalone = {
  enabled: true,
  port: apiPort,
};
studioConfig.transport.gateway = {
  enabled: mode === 'gateway',
  basePath,
};

if (Array.isArray(plugins.allow)) {
  const allow = normalizeStringList(plugins.allow).filter((item) => item !== 'studio');
  allow.push('studio');
  plugins.allow = allow;
}

if (plugins.installs && typeof plugins.installs === 'object' && !Array.isArray(plugins.installs)) {
  for (const [pluginId, record] of Object.entries(plugins.installs)) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const installPath = normalizeString(record.installPath);
    const installPathKey = installPath ? path.resolve(installPath).replace(/\\/g, '/') : '';
    if (pluginId === 'studio') {
      if (!installPathKey || installPathKey !== projectRootKey || /\/openclaw-studio\.(prev|bak|old)(\/|$)/.test(installPathKey)) {
        delete plugins.installs[pluginId];
      }
      continue;
    }
    if (installPathKey && /\/openclaw-studio\.(prev|bak|old)(\/|$)/.test(installPathKey)) {
      delete plugins.installs[pluginId];
    }
  }
  if (Object.keys(plugins.installs).length === 0) {
    delete plugins.installs;
  }
}

plugins.load = plugins.load && typeof plugins.load === 'object' ? plugins.load : {};
const loadPaths = normalizeStringList(plugins.load.paths).filter((item) => {
  const resolved = path.resolve(item).replace(/\\/g, '/');
  const isStudioLike = /\/openclaw-studio(?:\.[^/]+)?(\/|$)/.test(resolved);
  if (isStudioLike && resolved !== projectRootKey) return false;
  if (/\/openclaw-studio\.(prev|bak|old)(\/|$)/.test(resolved)) return false;
  return true;
});
if (!loadPaths.includes(projectRootKey)) {
  loadPaths.push(projectRootKey);
}
plugins.load.paths = loadPaths;

const gateway = ensureObject(config, 'gateway');
const supportedBinds = new Set(['auto', 'loopback', 'lan', 'tailnet', 'custom']);
const normalizedPreferredBind = normalizeString(preferredGatewayBind).toLowerCase();
const normalizedExistingBind = normalizeString(gateway.bind).toLowerCase();
if (gatewayBindExplicit) {
  gateway.bind = supportedBinds.has(normalizedPreferredBind) ? normalizedPreferredBind : 'lan';
} else if (supportedBinds.has(normalizedExistingBind)) {
  gateway.bind = normalizedExistingBind;
} else {
  gateway.bind = supportedBinds.has(normalizedPreferredBind) ? normalizedPreferredBind : 'lan';
}
gateway.port = Number(gateway.port) > 0 ? Number(gateway.port) : 31879;

gateway.controlUi = gateway.controlUi && typeof gateway.controlUi === 'object' ? gateway.controlUi : {};
const allowedOrigins = normalizeStringList(gateway.controlUi.allowedOrigins);
for (const origin of [`http://127.0.0.1:${gateway.port}`, `http://localhost:${gateway.port}`]) {
  if (!allowedOrigins.includes(origin)) {
    allowedOrigins.push(origin);
  }
}
gateway.controlUi.allowedOrigins = allowedOrigins;

gateway.auth = gateway.auth && typeof gateway.auth === 'object' ? gateway.auth : {};
if (!normalizeString(gateway.auth.mode)) {
  gateway.auth.mode = 'token';
}
if (gateway.auth.mode === 'token' && !normalizeString(gateway.auth.token)) {
  gateway.auth.token = require('node:crypto').randomBytes(24).toString('base64url');
}

const tools = ensureObject(config, 'tools');
const toolsExec = ensureObject(tools, 'exec');
toolsExec.host = 'auto';

config.agents = config.agents && typeof config.agents === 'object' ? config.agents : {};
config.agents.defaults = config.agents.defaults && typeof config.agents.defaults === 'object' ? config.agents.defaults : {};
config.agents.defaults.sandbox = config.agents.defaults.sandbox && typeof config.agents.defaults.sandbox === 'object'
  ? config.agents.defaults.sandbox
  : {};
if (!hasDocker) {
  config.agents.defaults.sandbox.mode = 'off';
  if (Array.isArray(config.agents.list)) {
    for (const agent of config.agents.list) {
      if (!agent || typeof agent !== 'object') continue;
      agent.sandbox = agent.sandbox && typeof agent.sandbox === 'object' ? agent.sandbox : {};
      const backend = normalizeString(agent.sandbox.backend || config.agents.defaults.sandbox.backend).toLowerCase();
      const modeValue = normalizeString(agent.sandbox.mode).toLowerCase();
      if (!modeValue || modeValue === 'off') continue;
      if (backend === 'ssh' || backend === 'openshell') continue;
      agent.sandbox.mode = 'off';
    }
  }
}

// Repair the common 4.8 -> 4.9 dreaming mismatch: memory-core dreaming enabled
// while plugins.slots.memory is still none/unset.
plugins.slots = plugins.slots && typeof plugins.slots === 'object' && !Array.isArray(plugins.slots)
  ? plugins.slots
  : {};
const memorySlot = normalizeString(plugins.slots.memory).toLowerCase();
const memoryCoreEntry = entries['memory-core'] && typeof entries['memory-core'] === 'object' && !Array.isArray(entries['memory-core'])
  ? entries['memory-core']
  : {};
entries['memory-core'] = memoryCoreEntry;
if ((!memorySlot || memorySlot === 'none') && dreamingEnabled(memoryCoreEntry)) {
  plugins.slots.memory = 'memory-core';
  memoryCoreEntry.enabled = true;
}
if (normalizeString(plugins.slots.memory).toLowerCase() === 'memory-core' && memoryCoreEntry.enabled === false) {
  memoryCoreEntry.enabled = true;
}

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
NODE
fi

if [[ "${DRY_RUN}" -eq 0 ]]; then
  log "校验 OpenClaw 配置"
  if ! run_cmd_allow_fail openclaw config validate; then
    warn "配置校验失败，尝试执行 doctor 自动修复"
    if run_cmd_allow_fail openclaw doctor --repair --non-interactive --yes; then
      if ! run_cmd_allow_fail openclaw config validate; then
        warn "doctor 修复后配置仍未通过校验，回滚到备份: ${CONFIG_BACKUP}"
        run_cmd cp "${CONFIG_BACKUP}" "${OPENCLAW_CONFIG_FILE}"
      fi
    else
      warn "doctor 自动修复执行失败，回滚到备份: ${CONFIG_BACKUP}"
      run_cmd cp "${CONFIG_BACKUP}" "${OPENCLAW_CONFIG_FILE}"
    fi
  fi
fi

GATEWAY_PORT="$(read_config_json_field "config.gateway?.port ?? 31879")"
GATEWAY_AUTH_MODE="$(read_config_json_field "config.gateway?.auth?.mode ?? 'token'")"
GATEWAY_TOKEN="$(read_config_json_field "config.gateway?.auth?.token ?? ''")"

GATEWAY_SERVICE_READY=0
if can_manage_gateway_service; then
  log "安装或刷新 OpenClaw Gateway service"
  if run_cmd_allow_fail openclaw gateway install --force; then
    GATEWAY_SERVICE_READY=1
  else
    warn "Gateway service 安装失败，将尝试降级为后台直接运行 Gateway。"
  fi
else
  warn "未检测到可用的用户级服务管理器（systemd/launchd/schtasks），将直接后台运行 Gateway。"
fi

if [[ "${GATEWAY_SERVICE_READY}" -eq 1 ]]; then
  log "重启 OpenClaw Gateway service"
  if ! run_cmd_allow_fail openclaw gateway restart; then
    warn "Gateway service 重启失败，将尝试降级为后台直接运行 Gateway。"
    GATEWAY_SERVICE_READY=0
  fi
fi

if [[ "${GATEWAY_SERVICE_READY}" -eq 0 ]]; then
  start_gateway_fallback || warn "后台拉起 Gateway 失败，请手工执行: openclaw gateway run --force"
fi

if [[ "${DRY_RUN}" -eq 1 ]]; then
  trap - ERR
  log "dry-run 模式跳过健康检查"
  exit 0
fi

sleep 2

probe_health() {
  local url="$1"
  local attempts="${2:-20}"
  local delay_seconds="${3:-2}"
  local body=""
  for _ in $(seq 1 "${attempts}"); do
    if body="$(http_get "${url}" 2>/dev/null)"; then
      printf '%s' "${body}"
      return 0
    fi
    sleep "${delay_seconds}"
  done
  return 1
}

if [[ "${STUDIO_MODE}" == "standalone" ]]; then
  HEALTH_URL="http://127.0.0.1:${STUDIO_API_PORT}/api/system/health"
  ACCESS_URL="http://HOST:${STUDIO_API_PORT}/"
  STANDALONE_HEALTH_URL=""
else
  HEALTH_URL="http://127.0.0.1:${GATEWAY_PORT}${STUDIO_GATEWAY_BASE_PATH}/api/system/health"
  ACCESS_URL="http://HOST:${GATEWAY_PORT}${STUDIO_GATEWAY_BASE_PATH}/"
  STANDALONE_HEALTH_URL="http://127.0.0.1:${STUDIO_API_PORT}/api/system/health"
  if [[ "${GATEWAY_AUTH_MODE}" == "token" && -n "${GATEWAY_TOKEN}" ]]; then
    HEALTH_URL="${HEALTH_URL}?token=${GATEWAY_TOKEN}"
    ACCESS_URL="${ACCESS_URL}?token=${GATEWAY_TOKEN}"
  fi
fi

log "执行健康检查: ${HEALTH_URL}"
HEALTH_OK=0
HEALTH_BODY=""
if HEALTH_BODY="$(probe_health "${HEALTH_URL}")"; then
  HEALTH_OK=1
fi

STANDALONE_HEALTH_OK=0
STANDALONE_HEALTH_BODY=""
if [[ -n "${STANDALONE_HEALTH_URL}" ]]; then
  log "执行 3760 回退入口健康检查: ${STANDALONE_HEALTH_URL}"
  if STANDALONE_HEALTH_BODY="$(probe_health "${STANDALONE_HEALTH_URL}" 8 2)"; then
    STANDALONE_HEALTH_OK=1
  fi
fi

printf '\n'
printf '=== OpenClaw Studio 安装完成 ===\n'
printf 'Studio 版本: %s\n' "${STUDIO_VERSION}"
printf 'OpenClaw 版本: %s\n' "${CURRENT_OPENCLAW_VERSION}"
printf '安装模式: %s\n' "${STUDIO_MODE}"
printf '配置文件: %s\n' "${OPENCLAW_CONFIG_FILE}"
printf '安装目录: %s\n' "${INSTALL_DIR}"
if [[ "${STUDIO_MODE}" == "standalone" ]]; then
  printf 'API 端口: %s\n' "${STUDIO_API_PORT}"
else
  printf 'Gateway 端口: %s\n' "${GATEWAY_PORT}"
  printf 'Gateway Base Path: %s\n' "${STUDIO_GATEWAY_BASE_PATH}"
  printf 'Standalone 回退端口: %s\n' "${STUDIO_API_PORT}"
fi
printf '访问地址: %s\n' "${ACCESS_URL}"
printf '健康检查: %s\n' "$([[ "${HEALTH_OK}" -eq 1 ]] && printf '成功' || printf '失败')"
if [[ "${HEALTH_OK}" -eq 1 ]]; then
  printf '健康检查响应: %s\n' "${HEALTH_BODY}"
else
  warn "健康检查未通过，请手工执行: openclaw gateway health 或通过浏览器访问 ${HEALTH_URL}"
fi
if [[ -n "${STANDALONE_HEALTH_URL}" ]]; then
  printf '3760 回退健康检查: %s\n' "$([[ "${STANDALONE_HEALTH_OK}" -eq 1 ]] && printf '成功' || printf '失败')"
  if [[ "${STANDALONE_HEALTH_OK}" -eq 1 ]]; then
    printf '3760 健康检查响应: %s\n' "${STANDALONE_HEALTH_BODY}"
  else
    warn "3760 回退入口健康检查未通过，请确认 Studio standalone transport 已启用: ${STANDALONE_HEALTH_URL}"
  fi
fi
trap - ERR
