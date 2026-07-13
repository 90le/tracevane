#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TRACEVANE_DEFAULT_VERSION="${TRACEVANE_DEFAULT_VERSION:-latest}"
VERSION_EXPLICIT=0
PACKAGE_URL_EXPLICIT=0
GATEWAY_BIND_EXPLICIT=0
MIN_VERSION_EXPLICIT=0
if [[ -n "${TRACEVANE_VERSION:-}" ]]; then
  VERSION_EXPLICIT=1
fi
if [[ -n "${TRACEVANE_PACKAGE_URL:-}" ]]; then
  PACKAGE_URL_EXPLICIT=1
fi
if [[ -n "${TRACEVANE_GATEWAY_BIND:-}" ]]; then
  GATEWAY_BIND_EXPLICIT=1
fi
if [[ -n "${OPENCLAW_MIN_VERSION:-}" ]]; then
  MIN_VERSION_EXPLICIT=1
fi
TRACEVANE_VERSION="${TRACEVANE_VERSION:-}"
OPENCLAW_MIN_VERSION="${OPENCLAW_MIN_VERSION:-2026.5.28}"
TRACEVANE_RELEASE_BASE="${TRACEVANE_RELEASE_BASE:-https://github.com/90le/tracevane/releases/latest/download}"
TRACEVANE_PLATFORM=""
TRACEVANE_ARCH=""
TRACEVANE_PACKAGE_URL="${TRACEVANE_PACKAGE_URL:-}"
TRACEVANE_PACKAGE_SHA256="${TRACEVANE_PACKAGE_SHA256:-}"
TRACEVANE_MODE="${TRACEVANE_MODE:-standalone}"
TRACEVANE_API_PORT="${TRACEVANE_API_PORT:-3760}"
TRACEVANE_GATEWAY_BASE_PATH="${TRACEVANE_GATEWAY_BASE_PATH:-/tracevane}"
TRACEVANE_GATEWAY_BIND="${TRACEVANE_GATEWAY_BIND:-lan}"
TRACEVANE_EXTENSIONS_DIR="${TRACEVANE_EXTENSIONS_DIR:-${HOME}/.openclaw/extensions}"
OPENCLAW_HOME_DIR="${OPENCLAW_HOME_DIR:-${HOME}/.openclaw}"
OPENCLAW_CONFIG_FILE="${OPENCLAW_CONFIG_PATH:-${OPENCLAW_HOME_DIR}/openclaw.json}"
INSTALL_DIR="${TRACEVANE_EXTENSIONS_DIR}/tracevane"
BACKUP_ROOT="${OPENCLAW_HOME_DIR}/backups/tracevane"
DRY_RUN=0
SKIP_UPGRADE=0
CHECK_RELEASE=0
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
    TRACEVANE_DEFAULT_VERSION="${bundled_version}"
  fi
  if [[ -n "${bundled_min_version}" && "${MIN_VERSION_EXPLICIT}" -eq 0 ]]; then
    OPENCLAW_MIN_VERSION="${bundled_min_version}"
  fi
}

read_local_release_defaults

log() {
  printf '[tracevane-installer] %s\n' "$*"
}

warn() {
  printf '[tracevane-installer] WARN: %s\n' "$*" >&2
}

die() {
  printf '[tracevane-installer] ERROR: %s\n' "$*" >&2
  exit 1
}

detect_platform() {
  local kernel
  kernel="$(uname -s 2>/dev/null || true)"
  case "${kernel}" in
    Linux|Darwin) TRACEVANE_PLATFORM="${kernel}" ;;
    MINGW*|MSYS*|CYGWIN*) die "Git Bash/Cygwin/MSYS 暂不受支持；请使用 WSL，或等待 PowerShell 安装器。" ;;
    *) die "不受支持的 Bash 平台: ${kernel:-unknown}" ;;
  esac
  TRACEVANE_ARCH="$(uname -m 2>/dev/null || printf unknown)"
}

usage() {
  cat <<'EOF'
Tracevane 一键安装脚本

用法:
  bash install-tracevane.sh [--mode standalone|gateway] [options]

常用示例:
  bash install-tracevane.sh --mode standalone
  bash install-tracevane.sh --mode gateway
  bash install-tracevane.sh --check-release
  chmod +x ./install-tracevane.sh
  ./install-tracevane.sh --mode gateway

说明:
  gateway 单口模式会挂载到 OpenClaw Gateway 的 /tracevane，同时保留本机 3760 standalone 入口用于健康检查和回退。
  默认 latest 需要能读取 GitHub Release metadata；离线或私有镜像安装请传 --version、--package-url 和 --package-sha256。

选项:
  --mode <standalone|gateway>   安装模式，默认 standalone
  --version <version>           Tracevane 版本，默认 latest（GitHub Release 最新版）
  --release-base <url>          Release 资源根地址，默认 GitHub latest/download
  --site-base <url>             已弃用；等同于 --release-base
  --package-url <url>           安装包地址，默认优先读取 Release metadata
  --package-sha256 <sha256>     安装包 SHA-256；必须由 metadata 或此参数提供
  --api-port <port>             standalone API 端口，默认 3760
  --base-path <path>            gateway basePath，默认 /tracevane
  --gateway-bind <mode>         gateway bind，默认 lan（auto|loopback|lan|tailnet|custom）
  --config <path>               OpenClaw 配置文件路径
  --extensions-dir <path>       扩展目录，默认 ~/.openclaw/extensions
  --skip-upgrade                不自动升级 OpenClaw
  --check-release               只解析 metadata 并检查安装包 URL，不安装
  --dry-run                     仅打印将执行的动作，不落盘
  -h, --help                    显示帮助
EOF
}

normalize_base_path() {
  local value="${1:-/tracevane}"
  if [[ -z "${value}" ]]; then
    printf '/tracevane'
    return 0
  fi
  if [[ "${value}" != /* ]]; then
    value="/${value}"
  fi
  value="${value%/}"
  if [[ -z "${value}" ]]; then
    value="/tracevane"
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
    mv "${ACTIVE_BACKUP_DIR}" "${INSTALL_DIR}" >/dev/null 2>&1 || warn "恢复旧版 Tracevane 安装失败: ${ACTIVE_BACKUP_DIR}"
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
    "${TRACEVANE_RELEASE_BASE}/tracevane-latest.json" \
    "${TRACEVANE_RELEASE_BASE}/tracevane-version.json" \
    "${TRACEVANE_RELEASE_BASE}/version.json"
  do
    if ! manifest_body="$(http_get "${manifest_url}" 2>/dev/null)"; then
      continue
    fi
    if ! parsed="$(
      TRACEVANE_RELEASE_METADATA="${manifest_body}" node - <<'NODE'
const raw = process.env.TRACEVANE_RELEASE_METADATA || '';
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
const checksum = record.checksum && typeof record.checksum === 'object' && !Array.isArray(record.checksum)
  ? record.checksum
  : {};
const sha256 = typeof record.sha256 === 'string'
  ? record.sha256.trim()
  : typeof record.packageSha256 === 'string'
    ? record.packageSha256.trim()
    : typeof checksum.sha256 === 'string'
      ? checksum.sha256.trim()
      : '';
process.stdout.write([version, packageUrl, minVersion, sha256].join('\t'));
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
  local remote_package_sha256=""
  local remote_metadata=""

  if [[ -z "${TRACEVANE_VERSION}" || "${TRACEVANE_VERSION}" == "latest" || "${TRACEVANE_VERSION}" == "auto" || "${PACKAGE_URL_EXPLICIT}" -eq 0 ]]; then
    if remote_metadata="$(resolve_remote_release_metadata)"; then
      IFS=$'\t' read -r remote_version remote_package_url remote_min_version remote_package_sha256 <<< "${remote_metadata}"
    fi
  fi

  if [[ -z "${TRACEVANE_VERSION}" || "${TRACEVANE_VERSION}" == "latest" || "${TRACEVANE_VERSION}" == "auto" ]]; then
    TRACEVANE_VERSION="${remote_version:-${TRACEVANE_DEFAULT_VERSION}}"
  fi

  if [[ "${PACKAGE_URL_EXPLICIT}" -eq 1 && "${VERSION_EXPLICIT}" -eq 0 && -z "${remote_version}" ]]; then
    if [[ "${TRACEVANE_PACKAGE_URL}" =~ tracevane-([0-9][0-9A-Za-z._-]*)\.tar\.gz ]]; then
      TRACEVANE_VERSION="${BASH_REMATCH[1]}"
    else
      die "使用 --package-url 且无法读取站点 metadata 时，请同时传入 --version"
    fi
  fi

  if [[ "${PACKAGE_URL_EXPLICIT}" -eq 0 && ( "${TRACEVANE_VERSION}" == "latest" || "${TRACEVANE_VERSION}" == "auto" ) ]]; then
    die "无法从 ${TRACEVANE_RELEASE_BASE} 解析最新 Tracevane 版本；请检查 Release metadata，或显式传入 --version / --package-url"
  fi

  if [[ "${PACKAGE_URL_EXPLICIT}" -eq 0 ]]; then
    if [[ -n "${remote_package_url}" ]]; then
      TRACEVANE_PACKAGE_URL="${remote_package_url}"
    else
      TRACEVANE_PACKAGE_URL="${TRACEVANE_RELEASE_BASE}/tracevane-${TRACEVANE_VERSION}.tar.gz"
    fi
  fi

  if [[ -n "${remote_min_version}" && "${MIN_VERSION_EXPLICIT}" -eq 0 ]]; then
    OPENCLAW_MIN_VERSION="${remote_min_version}"
  fi
  if [[ -n "${remote_package_sha256}" && -z "${TRACEVANE_PACKAGE_SHA256}" ]]; then
    TRACEVANE_PACKAGE_SHA256="${remote_package_sha256}"
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
  local log_file="${log_dir}/tracevane-gateway-fallback.log"
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

probe_url() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsIL --max-time 20 "${url}" >/dev/null \
      || curl -fsL --range 0-0 --max-time 20 "${url}" -o /dev/null
    return $?
  fi
  if command -v wget >/dev/null 2>&1; then
    wget --spider -q "${url}" \
      || wget -qO /dev/null --header='Range: bytes=0-0' "${url}"
    return $?
  fi
  return 127
}

verify_package_checksum() {
  local archive_path="$1"
  local expected_sha256="$2"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '[dry-run] verify sha256 %q %q\n' "${archive_path}" "${expected_sha256}"
    return 0
  fi

  node - "${archive_path}" "${expected_sha256}" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');

const archivePath = process.argv[2];
const expected = String(process.argv[3] || '').trim().toLowerCase();
const actual = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
if (actual !== expected) {
  console.error(`SHA-256 mismatch: expected ${expected}, got ${actual}`);
  process.exit(1);
}
NODE
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

auto_fix_missing_dependencies() {
  log "自动检测并修复缺失的依赖模块..."
  
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "[dry-run] 跳过依赖检测（将执行 openclaw doctor --fix）"
    return 0
  fi
  
  local error_output
  local missing_modules=()
  
  error_output="$("${OPENCLAW_HOME_DIR}/node_modules/.bin/openclaw" --version 2>&1 || true)" || true
  
  while IFS= read -r line; do
    local match
    if match=$(echo "$line" | grep -Eo "Cannot find module '([^']+)'" | sed "s/Cannot find module '\([^']\+\)'/\1/"); then
      missing_modules+=("$match")
    fi
  done <<< "$error_output"
  
  if [[ ${#missing_modules[@]} -gt 0 ]]; then
    log "检测到缺失的模块: ${missing_modules[*]}"
    for module in "${missing_modules[@]}"; do
      log "安装缺失依赖: ${module}"
      npm install -g "${module}" 2>/dev/null || warn "安装 ${module} 失败"
    done
  fi
  
  log "执行 openclaw doctor --fix 进行自动修复..."
  if ! run_cmd_allow_fail openclaw doctor --fix; then
    warn "openclaw doctor --fix 执行失败，尝试手动修复"
    
    local check_output
    check_output=$(openclaw gateway run --force 2>&1 || true) || true
    
    while IFS= read -r line; do
      local match
      if match=$(echo "$line" | grep -Eo "Cannot find module '([^']+)'" | sed "s/Cannot find module '\([^']\+\)'/\1/"); then
        log "安装缺失依赖: ${match}"
        npm install -g "${match}" 2>/dev/null || warn "安装 ${match} 失败"
      fi
    done <<< "$check_output"
  fi
}

auto_cleanup_incompatible_config() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "[dry-run] 跳过配置清理（将执行 openclaw config validate 和 doctor --repair）"
    return 0
  fi
  
  log "自动检测并清理不兼容的配置..."
  
  local validate_output
  validate_output=$(openclaw config validate 2>&1 || true)
  
  if echo "$validate_output" | grep -q "valid"; then
    log "配置验证通过"
    return 0
  fi
  
  log "配置验证失败，尝试自动修复..."
  
  run_cmd_allow_fail openclaw doctor --repair --non-interactive --yes
  
  validate_output=$(openclaw config validate 2>&1 || true)
  
  if echo "$validate_output" | grep -q "valid"; then
    log "配置修复成功"
    return 0
  fi
  
  log "尝试智能清理配置项..."
  
  node - "${OPENCLAW_CONFIG_FILE}" <<'NODE'
const fs = require('node:fs');

const configPath = process.argv[2];
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {
  console.log('无法读取配置文件');
  process.exit(0);
}

let changed = false;

function cleanInvalidPlugins(entries) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return;
  
  for (const [key, value] of Object.entries(entries)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      delete entries[key];
      changed = true;
      console.log(`Removed invalid plugin entry: ${key}`);
      continue;
    }
    
    if (value.config && typeof value.config === 'object' && !Array.isArray(value.config)) {
      for (const [configKey, configValue] of Object.entries(value.config)) {
        if (configValue === null || configValue === undefined) {
          delete value.config[configKey];
          changed = true;
          console.log(`Removed null/undefined config: ${key}.config.${configKey}`);
        }
      }
    }
  }
}

function cleanInvalidChannels(channels) {
  if (!channels || typeof channels !== 'object' || Array.isArray(channels)) return;
  
  for (const [channelId, channelConfig] of Object.entries(channels)) {
    if (!channelConfig || typeof channelConfig !== 'object' || Array.isArray(channelConfig)) {
      delete channels[channelId];
      changed = true;
      console.log(`Removed invalid channel: ${channelId}`);
      continue;
    }
    
    if (channelConfig.tools && typeof channelConfig.tools === 'object') {
      delete channelConfig.tools;
      changed = true;
      console.log(`Removed tools config from channel: ${channelId}`);
    }
  }
}

function cleanInvalidSlots(slots) {
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return;
  
  for (const [slotKey, slotValue] of Object.entries(slots)) {
    if (slotValue === null || slotValue === undefined || slotValue === '') {
      delete slots[slotKey];
      changed = true;
      console.log(`Removed invalid slot: ${slotKey}`);
    }
  }
}

if (config.plugins?.entries) {
  cleanInvalidPlugins(config.plugins.entries);
}

if (config.channels) {
  cleanInvalidChannels(config.channels);
}

if (config.plugins?.slots) {
  cleanInvalidSlots(config.plugins.slots);
}

if (changed) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log('已自动清理不兼容的配置项');
} else {
  console.log('未发现需要清理的配置项');
}
NODE
  
  run_cmd_allow_fail openclaw doctor --repair --non-interactive --yes || true
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode)
        TRACEVANE_MODE="${2:-}"
        shift 2
        ;;
      --version)
        TRACEVANE_VERSION="${2:-}"
        VERSION_EXPLICIT=1
        shift 2
        ;;
      --release-base)
        TRACEVANE_RELEASE_BASE="${2:-}"
        shift 2
        ;;
      --site-base)
        TRACEVANE_RELEASE_BASE="${2:-}"
        warn "--site-base 已弃用；请改用 --release-base。"
        shift 2
        ;;
      --package-url)
        TRACEVANE_PACKAGE_URL="${2:-}"
        PACKAGE_URL_EXPLICIT=1
        shift 2
        ;;
      --package-sha256)
        TRACEVANE_PACKAGE_SHA256="${2:-}"
        shift 2
        ;;
      --api-port)
        TRACEVANE_API_PORT="${2:-}"
        shift 2
        ;;
      --base-path)
        TRACEVANE_GATEWAY_BASE_PATH="${2:-}"
        shift 2
        ;;
      --gateway-bind)
        TRACEVANE_GATEWAY_BIND="${2:-}"
        GATEWAY_BIND_EXPLICIT=1
        shift 2
        ;;
      --config)
        OPENCLAW_CONFIG_FILE="${2:-}"
        shift 2
        ;;
      --extensions-dir)
        TRACEVANE_EXTENSIONS_DIR="${2:-}"
        INSTALL_DIR="${TRACEVANE_EXTENSIONS_DIR}/tracevane"
        shift 2
        ;;
      --skip-upgrade)
        SKIP_UPGRADE=1
        shift
        ;;
      --check-release)
        CHECK_RELEASE=1
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
detect_platform
trap 'handle_install_error "$LINENO" "$?"' ERR

resolve_requested_release

if [[ ! "${TRACEVANE_PACKAGE_SHA256}" =~ ^[0-9A-Fa-f]{64}$ ]]; then
  die "缺少有效的安装包 SHA-256；请使用官方 Release metadata，或同时传入 --package-sha256。"
fi
TRACEVANE_PACKAGE_SHA256="$(printf '%s' "${TRACEVANE_PACKAGE_SHA256}" | tr '[:upper:]' '[:lower:]')"

TRACEVANE_GATEWAY_BASE_PATH="$(normalize_base_path "${TRACEVANE_GATEWAY_BASE_PATH}")"

case "${TRACEVANE_MODE}" in
  standalone|gateway) ;;
  *) die "--mode 只支持 standalone 或 gateway" ;;
esac

require_command node
if [[ "${CHECK_RELEASE}" -eq 1 ]]; then
  log "Tracevane release metadata OK"
  log "版本: ${TRACEVANE_VERSION}"
  log "最低 OpenClaw: ${OPENCLAW_MIN_VERSION}"
  log "安装包: ${TRACEVANE_PACKAGE_URL}"
  log "安装包 SHA-256: ${TRACEVANE_PACKAGE_SHA256}"
  if probe_url "${TRACEVANE_PACKAGE_URL}"; then
    log "安装包 URL 可访问"
  else
    die "安装包 URL 不可访问: ${TRACEVANE_PACKAGE_URL}"
  fi
  exit 0
fi
require_command npm
require_command tar
require_command openclaw

CURRENT_OPENCLAW_VERSION="$(openclaw --version 2>/dev/null | grep -Eo '[0-9]{4}\.[0-9]+\.[0-9]+' | head -n1 || true)"
if [[ -z "${CURRENT_OPENCLAW_VERSION}" ]]; then
  die "无法读取 openclaw --version"
fi

log "当前 OpenClaw 版本: ${CURRENT_OPENCLAW_VERSION}"
log "目标 Tracevane 版本: ${TRACEVANE_VERSION}"
log "安装模式: ${TRACEVANE_MODE}"
if [[ "${TRACEVANE_MODE}" == "gateway" ]]; then
  log "单口模式会同时保留本机 standalone 入口: http://127.0.0.1:${TRACEVANE_API_PORT}/"
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
    
    auto_fix_missing_dependencies
  fi
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

if [[ "${DRY_RUN}" -eq 0 ]]; then
  mkdir -p "${TRACEVANE_EXTENSIONS_DIR}"
  mkdir -p "$(dirname "${OPENCLAW_CONFIG_FILE}")"
  mkdir -p "${BACKUP_ROOT}"
  if [[ ! -f "${OPENCLAW_CONFIG_FILE}" ]]; then
    printf '{}\n' > "${OPENCLAW_CONFIG_FILE}"
  fi
fi

ARCHIVE_PATH="${TMP_DIR}/tracevane.tar.gz"
log "下载安装包: ${TRACEVANE_PACKAGE_URL}"
download_file "${TRACEVANE_PACKAGE_URL}" "${ARCHIVE_PATH}"
log "校验安装包 SHA-256"
verify_package_checksum "${ARCHIVE_PATH}" "${TRACEVANE_PACKAGE_SHA256}"

log "解压安装包"
run_cmd tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  PACKAGE_DIR="${TMP_DIR}/tracevane-${TRACEVANE_VERSION}"
else
  PACKAGE_DIR="$(find "${TMP_DIR}" -maxdepth 1 -mindepth 1 -name 'tracevane-*' | head -n1)"
fi
[[ -n "${PACKAGE_DIR}" ]] || die "未在安装包中找到 tracevane-* 目录"

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

cleanup_stale_extension_backup "${TRACEVANE_EXTENSIONS_DIR}/tracevane.prev"
cleanup_stale_extension_backup "${TRACEVANE_EXTENSIONS_DIR}/tracevane.bak"
cleanup_stale_extension_backup "${TRACEVANE_EXTENSIONS_DIR}/tracevane.old"
RETIRED_PRODUCT_ID="$(printf '%s%s' 'st' 'udio')"
for retired_extension_name in "${RETIRED_PRODUCT_ID}" "openclaw-${RETIRED_PRODUCT_ID}"; do
  cleanup_stale_extension_backup "${TRACEVANE_EXTENSIONS_DIR}/${retired_extension_name}"
  cleanup_stale_extension_backup "${TRACEVANE_EXTENSIONS_DIR}/${retired_extension_name}.prev"
  cleanup_stale_extension_backup "${TRACEVANE_EXTENSIONS_DIR}/${retired_extension_name}.bak"
  cleanup_stale_extension_backup "${TRACEVANE_EXTENSIONS_DIR}/${retired_extension_name}.old"
done

if [[ -d "${INSTALL_DIR}" ]]; then
  ACTIVE_BACKUP_DIR="${BACKUP_ROOT}/tracevane-${BACKUP_STAMP}"
  log "备份现有安装到 ${ACTIVE_BACKUP_DIR}"
  run_cmd mv "${INSTALL_DIR}" "${ACTIVE_BACKUP_DIR}"
fi
run_cmd mv "${PACKAGE_DIR}" "${INSTALL_DIR}"

log "修正发布包元数据"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  printf '[dry-run] node <repair-release-metadata> %q %q %q\n' "${INSTALL_DIR}" "${TRACEVANE_VERSION}" "${OPENCLAW_MIN_VERSION}"
else
  node - "${INSTALL_DIR}" "${TRACEVANE_VERSION}" "${OPENCLAW_MIN_VERSION}" <<'NODE'
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
pkg.openclaw.id = 'tracevane';
pkg.openclaw.kind = 'ui';
pkg.openclaw.installDependencies = true;
pkg.openclaw.extensions = ['./dist/index.js'];
pkg.openclaw.install = pkg.openclaw.install && typeof pkg.openclaw.install === 'object' ? pkg.openclaw.install : {};
pkg.openclaw.install.minHostVersion = `>=${minHostVersion}`;
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.id = 'tracevane';
  manifest.version = version;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
NODE
fi

log "安装依赖"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  printf '[dry-run] cd %q && npm install --production --ignore-scripts\n' "${INSTALL_DIR}"
  printf '[dry-run] cd %q && npm rebuild @homebridge/node-pty-prebuilt-multiarch\n' "${INSTALL_DIR}"
  printf '[dry-run] node -e "require(\x27@homebridge/node-pty-prebuilt-multiarch\x27)"\n'
else
  (
    cd "${INSTALL_DIR}"
    npm install --production --ignore-scripts
    npm rebuild @homebridge/node-pty-prebuilt-multiarch 2>&1 || warn "node-pty rebuild 失败，终端功能可能不可用。请确保已安装 build-essential 和 cmake。"
    if ! node -e "require('@homebridge/node-pty-prebuilt-multiarch')" 2>/dev/null; then
      warn "node-pty 原生模块加载失败（Node ABI $(node -e 'process.stdout.write(process.versions.modules)')）"
      warn "终端功能将不可用。常见原因："
      warn "  1. Node.js 版本过新，prebuilt 尚未支持（当前 Node $(node --version)）"
      warn "  2. 缺少编译工具：sudo apt install build-essential cmake（Debian/Ubuntu）或 xcode-select --install（macOS）"
      warn "可稍后手工执行: cd ${INSTALL_DIR} && npm rebuild @homebridge/node-pty-prebuilt-multiarch"
    fi
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
  node - "${OPENCLAW_CONFIG_FILE}" "${INSTALL_DIR}" "${TRACEVANE_MODE}" "${TRACEVANE_API_PORT}" "${TRACEVANE_GATEWAY_BASE_PATH}" "${HAS_DOCKER}" "${TRACEVANE_GATEWAY_BIND}" "${GATEWAY_BIND_EXPLICIT}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const configPath = process.argv[2];
const installDir = process.argv[3];
const mode = process.argv[4];
const apiPort = Number(process.argv[5] || 3760);
const basePath = String(process.argv[6] || '/tracevane');
const hasDocker = String(process.argv[7] || '0') === '1';
const preferredGatewayBind = String(process.argv[8] || 'lan');
const gatewayBindExplicit = String(process.argv[9] || '0') === '1';
const currentPluginId = 'tracevane';
const retiredProductId = ['st', 'udio'].join('');
const retiredPluginIds = new Set([retiredProductId, `openclaw-${retiredProductId}`]);

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

function isRetiredPluginId(value) {
  return retiredPluginIds.has(normalizeString(value).toLowerCase());
}

function normalizedPathKey(value) {
  const normalized = normalizeString(value);
  return normalized ? path.resolve(normalized).replace(/\\/g, '/') : '';
}

function pathReferencesRetiredInstall(value) {
  const resolved = normalizedPathKey(value).toLowerCase();
  if (!resolved) return false;
  return resolved.split('/').some((segment) => {
    if (segment === retiredProductId || segment === `openclaw-${retiredProductId}`) return true;
    return segment.startsWith(`${retiredProductId}.`)
      || segment.startsWith(`openclaw-${retiredProductId}.`);
  });
}

function pathReferencesTracevaneBackup(value) {
  return /\/tracevane\.(prev|bak|old)(\/|$)/.test(normalizedPathKey(value).toLowerCase());
}

function pathReferencesAlternateTracevaneInstall(value, projectRootKey) {
  const resolved = normalizedPathKey(value);
  if (!resolved) return false;
  const normalized = resolved.toLowerCase();
  if (pathReferencesTracevaneBackup(resolved)) return true;
  if (pathReferencesRetiredInstall(resolved)) return true;
  const isTracevaneLike = /\/tracevane(?:\.[^/]+)?(\/|$)/.test(normalized);
  return isTracevaneLike && resolved !== projectRootKey;
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
  plugins.deny = normalizeStringList(plugins.deny).filter((item) => item !== currentPluginId && !isRetiredPluginId(item));
}
const entries = ensureObject(plugins, 'entries');
for (const pluginId of Object.keys(entries)) {
  if (isRetiredPluginId(pluginId)) {
    delete entries[pluginId];
  }
}
const existingTracevaneEntry =
  entries.tracevane && typeof entries.tracevane === 'object' && !Array.isArray(entries.tracevane)
    ? entries.tracevane
    : {};
const tracevaneEntry = {
  ...existingTracevaneEntry,
};
for (const key of Object.keys(tracevaneEntry)) {
  if (!['enabled', 'hooks', 'subagent', 'config'].includes(key)) {
    delete tracevaneEntry[key];
  }
}
entries.tracevane = tracevaneEntry;
tracevaneEntry.enabled = true;
const tracevaneConfig = ensureObject(tracevaneEntry, 'config');
tracevaneConfig.autoStart = true;
tracevaneConfig.apiPort = apiPort;
tracevaneConfig.transport = tracevaneConfig.transport && typeof tracevaneConfig.transport === 'object' ? tracevaneConfig.transport : {};
tracevaneConfig.transport.preferredMode = mode;
tracevaneConfig.transport.standalone = {
  enabled: true,
  port: apiPort,
};
tracevaneConfig.transport.gateway = {
  enabled: mode === 'gateway',
  basePath,
};

if (Array.isArray(plugins.allow)) {
  const allow = normalizeStringList(plugins.allow).filter((item) => item !== currentPluginId && !isRetiredPluginId(item));
  allow.push(currentPluginId);
  plugins.allow = allow;
}

if (plugins.installs && typeof plugins.installs === 'object' && !Array.isArray(plugins.installs)) {
  for (const [pluginId, record] of Object.entries(plugins.installs)) {
    if (isRetiredPluginId(pluginId)) {
      delete plugins.installs[pluginId];
      continue;
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const installPath = normalizeString(record.installPath);
    const installPathKey = normalizedPathKey(installPath);
    if (pluginId === currentPluginId) {
      if (!installPathKey || installPathKey !== projectRootKey || pathReferencesTracevaneBackup(installPathKey)) {
        delete plugins.installs[pluginId];
      }
      continue;
    }
    if (installPathKey && pathReferencesAlternateTracevaneInstall(installPathKey, projectRootKey)) {
      delete plugins.installs[pluginId];
    }
  }
  if (Object.keys(plugins.installs).length === 0) {
    delete plugins.installs;
  }
}

plugins.load = plugins.load && typeof plugins.load === 'object' ? plugins.load : {};
const loadPaths = normalizeStringList(plugins.load.paths).filter((item) => {
  return !pathReferencesAlternateTracevaneInstall(item, projectRootKey);
});
if (!loadPaths.includes(projectRootKey)) {
  loadPaths.push(projectRootKey);
}
plugins.load.paths = loadPaths;

if (plugins.slots && typeof plugins.slots === 'object' && !Array.isArray(plugins.slots)) {
  for (const [slotKey, slotValue] of Object.entries(plugins.slots)) {
    if (isRetiredPluginId(slotValue)) {
      delete plugins.slots[slotKey];
    }
  }
}

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
gateway.controlUi.enabled = true;
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
    warn "配置校验失败，尝试执行自动修复"
    auto_cleanup_incompatible_config
    if ! run_cmd_allow_fail openclaw config validate; then
      warn "自动修复后配置仍未通过校验，回滚到备份: ${CONFIG_BACKUP}"
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
  if ! run_cmd_allow_fail openclaw gateway restart --safe; then
    warn "Gateway safe restart 失败，尝试普通 restart。"
    if ! run_cmd_allow_fail openclaw gateway restart; then
      warn "Gateway service 重启失败，将尝试降级为后台直接运行 Gateway。"
      GATEWAY_SERVICE_READY=0
    fi
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

if [[ "${TRACEVANE_MODE}" == "standalone" ]]; then
  HEALTH_URL="http://127.0.0.1:${TRACEVANE_API_PORT}/api/system/health"
  ACCESS_URL="http://HOST:${TRACEVANE_API_PORT}/"
  STANDALONE_HEALTH_URL=""
else
  HEALTH_URL="http://127.0.0.1:${GATEWAY_PORT}${TRACEVANE_GATEWAY_BASE_PATH}/api/system/health"
  ACCESS_URL="http://HOST:${GATEWAY_PORT}${TRACEVANE_GATEWAY_BASE_PATH}/"
  STANDALONE_HEALTH_URL="http://127.0.0.1:${TRACEVANE_API_PORT}/api/system/health"
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
printf '=== Tracevane 安装完成 ===\n'
printf 'Tracevane 版本: %s\n' "${TRACEVANE_VERSION}"
printf 'OpenClaw 版本: %s\n' "${CURRENT_OPENCLAW_VERSION}"
printf '安装模式: %s\n' "${TRACEVANE_MODE}"
printf '配置文件: %s\n' "${OPENCLAW_CONFIG_FILE}"
printf '安装目录: %s\n' "${INSTALL_DIR}"
if [[ "${TRACEVANE_MODE}" == "standalone" ]]; then
  printf 'API 端口: %s\n' "${TRACEVANE_API_PORT}"
else
  printf 'Gateway 端口: %s\n' "${GATEWAY_PORT}"
  printf 'Gateway Base Path: %s\n' "${TRACEVANE_GATEWAY_BASE_PATH}"
  printf 'Standalone 回退端口: %s\n' "${TRACEVANE_API_PORT}"
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
    warn "3760 回退入口健康检查未通过，请确认 Tracevane standalone transport 已启用: ${STANDALONE_HEALTH_URL}"
  fi
fi
trap - ERR
