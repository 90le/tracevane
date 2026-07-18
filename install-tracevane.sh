#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TRACEVANE_DEFAULT_VERSION="${TRACEVANE_DEFAULT_VERSION:-0.2.0}"
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
JSON_OUTPUT=0
UNINSTALL=0
HELP_REQUESTED=0
RESULT_OUTPUT_FD=1
RESULT_JSON_ATTEMPTED=0
RESULT_JSON_EMITTING=0
RESULT_JSON_EMITTED=0
RESULT_WARNINGS=()
DEGRADED_FEATURES=()
RESULT_ACCESS_URLS=()
RESULT_HEALTH_CHECKS=()
BACKGROUND_PID=""
ACTIVE_BACKUP_DIR=""
CONFIG_BACKUP=""
ROLLBACK_DONE=0
UNINSTALL_CONFIG_MUTATED=0
UNINSTALL_EXTENSION_QUARANTINED=0
UNINSTALL_EXTENSION_QUARANTINE=""
UNINSTALL_EXTENSION_BACKUP=""
UNINSTALL_QUARANTINE_STATE_FILE=""
UNINSTALL_ROLLBACK_DONE=0
UNINSTALL_TRANSACTION_COMMITTED=0

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

emit_result_json() {
  local result_status="${1:-error}"
  local result_install_dir="${INSTALL_DIR}"
  local result_config_path="${OPENCLAW_CONFIG_FILE}"

  if [[ "${RESULT_JSON_EMITTED:-0}" -eq 1 ]]; then
    return 0
  fi
  if [[ "${RESULT_JSON_ATTEMPTED:-0}" -eq 1 || "${RESULT_JSON_EMITTING:-0}" -eq 1 ]]; then
    return 1
  fi
  RESULT_JSON_ATTEMPTED=1
  RESULT_JSON_EMITTING=1

  if [[ "${HELP_REQUESTED:-0}" -eq 1 \
    || ( "${CHECK_RELEASE:-0}" -eq 1 && "${UNINSTALL:-0}" -eq 0 ) ]]; then
    result_install_dir=""
    result_config_path=""
  fi
  if ! command -v node >/dev/null 2>&1; then
    RESULT_JSON_EMITTING=0
    return 1
  fi

  if TRACEVANE_RESULT_STATUS="${result_status}" \
    TRACEVANE_RESULT_VERSION="${TRACEVANE_VERSION:-}" \
    TRACEVANE_RESULT_MODE="${TRACEVANE_MODE:-}" \
    TRACEVANE_RESULT_PLATFORM="${TRACEVANE_PLATFORM:-}" \
    TRACEVANE_RESULT_INSTALL_DIR="${result_install_dir}" \
    TRACEVANE_RESULT_CONFIG_PATH="${result_config_path}" \
    TRACEVANE_RESULT_BACKUP_PATH="${ACTIVE_BACKUP_DIR:-${CONFIG_BACKUP:-}}" \
    TRACEVANE_RESULT_ACCESS_URLS="$(printf '%s\n' "${RESULT_ACCESS_URLS[@]:-}")" \
    TRACEVANE_RESULT_HEALTH_CHECKS="$(printf '%s\n' "${RESULT_HEALTH_CHECKS[@]:-}")" \
    TRACEVANE_RESULT_WARNINGS="$(printf '%s\n' "${RESULT_WARNINGS[@]:-}")" \
    TRACEVANE_RESULT_DEGRADED="$(printf '%s\n' "${DEGRADED_FEATURES[@]:-}")" \
    node - >&"${RESULT_OUTPUT_FD}" <<'NODE'
const lines = (name) => (process.env[name] || '').split('\n').filter(Boolean);
process.stdout.write(`${JSON.stringify({
  status: process.env.TRACEVANE_RESULT_STATUS,
  version: process.env.TRACEVANE_RESULT_VERSION,
  mode: process.env.TRACEVANE_RESULT_MODE,
  platform: process.env.TRACEVANE_RESULT_PLATFORM,
  installDir: process.env.TRACEVANE_RESULT_INSTALL_DIR,
  configPath: process.env.TRACEVANE_RESULT_CONFIG_PATH,
  accessUrls: lines('TRACEVANE_RESULT_ACCESS_URLS'),
  healthChecks: lines('TRACEVANE_RESULT_HEALTH_CHECKS'),
  backupPath: process.env.TRACEVANE_RESULT_BACKUP_PATH,
  warnings: lines('TRACEVANE_RESULT_WARNINGS'),
  degradedFeatures: lines('TRACEVANE_RESULT_DEGRADED'),
})}\n`);
NODE
  then
    RESULT_JSON_EMITTED=1
    RESULT_JSON_EMITTING=0
    return 0
  fi

  RESULT_JSON_EMITTING=0
  return 1
}

append_result_warning() {
  local candidate="${1:-}"
  local existing
  [[ -n "${candidate}" ]] || return 0
  for existing in "${RESULT_WARNINGS[@]:-}"; do
    [[ "${existing}" == "${candidate}" ]] && return 0
  done
  RESULT_WARNINGS+=("${candidate}")
}

record_warning() {
  append_result_warning "$1"
  warn "$1"
}

append_degraded_feature() {
  local candidate="${1:-}"
  local existing
  [[ -n "${candidate}" ]] || return 0
  for existing in "${DEGRADED_FEATURES[@]:-}"; do
    [[ "${existing}" == "${candidate}" ]] && return 0
  done
  DEGRADED_FEATURES+=("${candidate}")
}

sanitize_url_for_output() {
  local candidate="${1:-}"
  [[ -n "${candidate}" ]] || return 1
  if [[ "${candidate}" =~ ://[^/]*@ ]]; then
    return 1
  fi
  candidate="${candidate%%#*}"
  candidate="${candidate%%\?*}"
  printf '%s' "${candidate}"
}

record_access_url() {
  local candidate="${1:-}"
  local sanitized
  local existing
  sanitized="$(sanitize_url_for_output "${candidate}")" || return 1
  for existing in "${RESULT_ACCESS_URLS[@]:-}"; do
    [[ "${existing}" == "${sanitized}" ]] && return 0
  done
  RESULT_ACCESS_URLS+=("${sanitized}")
}

die() {
  printf '[tracevane-installer] ERROR: %s\n' "$*" >&2
  trap - ERR
  if [[ "${JSON_OUTPUT:-0}" -eq 1 \
    && "${RESULT_JSON_ATTEMPTED:-0}" -eq 0 \
    && "${RESULT_JSON_EMITTING:-0}" -eq 0 \
    && "${RESULT_JSON_EMITTED:-0}" -eq 0 ]]; then
    emit_result_json "error" || true
  fi
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
  --json                        仅向 stdout 输出一个机器可读的结果对象
  --uninstall                   安全卸载 Tracevane，保留 ~/.openclaw/tracevane 用户数据
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
  local release_base="${1:-${TRACEVANE_RELEASE_BASE}}"
  local manifest_url
  local manifest_body
  local parsed
  release_base="${release_base%/}"
  for manifest_url in \
    "${release_base}/tracevane-latest.json" \
    "${release_base}/tracevane-version.json" \
    "${release_base}/version.json"
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
  local release_base="${TRACEVANE_RELEASE_BASE%/}"
  local metadata_base="${release_base}"
  local explicit_concrete_version=0

  if [[ "${VERSION_EXPLICIT}" -eq 1 && -n "${TRACEVANE_VERSION}" && "${TRACEVANE_VERSION}" != "latest" && "${TRACEVANE_VERSION}" != "auto" ]]; then
    explicit_concrete_version=1
    if [[ "${release_base}" == "https://github.com/90le/tracevane/releases/latest/download" ]]; then
      metadata_base="https://github.com/90le/tracevane/releases/download/v${TRACEVANE_VERSION}"
    fi
  fi

  if [[ -z "${TRACEVANE_VERSION}" || "${TRACEVANE_VERSION}" == "latest" || "${TRACEVANE_VERSION}" == "auto" || "${PACKAGE_URL_EXPLICIT}" -eq 0 || -z "${TRACEVANE_PACKAGE_SHA256}" ]]; then
    if remote_metadata="$(resolve_remote_release_metadata "${metadata_base}")"; then
      IFS=$'\t' read -r remote_version remote_package_url remote_min_version remote_package_sha256 <<< "${remote_metadata}"
    fi
  fi

  if [[ "${explicit_concrete_version}" -eq 1 && -n "${remote_version}" && (
    "${remote_version}" != "${TRACEVANE_VERSION}" ||
    ( -n "${remote_package_url}" && "${remote_package_url}" != *"/tracevane-${TRACEVANE_VERSION}.tar.gz"* )
  ) ]]; then
    remote_version=""
    remote_package_url=""
    remote_min_version=""
    remote_package_sha256=""
  elif [[ "${PACKAGE_URL_EXPLICIT}" -eq 1 && -n "${remote_version}" && ( -z "${remote_package_url}" || "${remote_package_url}" != "${TRACEVANE_PACKAGE_URL}" ) ]]; then
    remote_version=""
    remote_package_url=""
    remote_min_version=""
    remote_package_sha256=""
  fi

  if [[ -z "${TRACEVANE_VERSION}" || "${TRACEVANE_VERSION}" == "latest" || "${TRACEVANE_VERSION}" == "auto" ]]; then
    if [[ -n "${remote_version}" ]]; then
      TRACEVANE_VERSION="${remote_version}"
    elif [[ "${PACKAGE_URL_EXPLICIT}" -eq 1 && "${TRACEVANE_PACKAGE_URL}" =~ tracevane-([0-9][0-9A-Za-z._-]*)\.tar\.gz ]]; then
      TRACEVANE_VERSION="${BASH_REMATCH[1]}"
    elif [[ "${PACKAGE_URL_EXPLICIT}" -eq 1 ]]; then
      die "使用 --package-url 且无法读取匹配的 Release metadata 时，请同时传入 --version"
    else
      TRACEVANE_VERSION="${TRACEVANE_DEFAULT_VERSION}"
    fi
  fi

  if [[ "${PACKAGE_URL_EXPLICIT}" -eq 0 && ( "${TRACEVANE_VERSION}" == "latest" || "${TRACEVANE_VERSION}" == "auto" ) ]]; then
    die "无法从 ${TRACEVANE_RELEASE_BASE} 解析最新 Tracevane 版本；请检查 Release metadata，或显式传入 --version / --package-url"
  fi

  if [[ "${PACKAGE_URL_EXPLICIT}" -eq 0 ]]; then
    if [[ -n "${remote_package_url}" ]]; then
      TRACEVANE_PACKAGE_URL="${remote_package_url}"
    else
      TRACEVANE_PACKAGE_URL="${metadata_base}/tracevane-${TRACEVANE_VERSION}.tar.gz"
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

run_background() {
  local log_file="$1"
  shift
  local grace_seconds="${TRACEVANE_BACKGROUND_GRACE_SECONDS:-2}"
  local child_status=0

  nohup "$@" >"${log_file}" 2>&1 &
  BACKGROUND_PID=$!
  sleep "${grace_seconds}"

  if kill -0 "${BACKGROUND_PID}" 2>/dev/null; then
    return 0
  fi

  if wait "${BACKGROUND_PID}"; then
    child_status=0
  else
    child_status=$?
  fi
  if [[ "${child_status}" -eq 0 ]]; then
    warn "后台进程在启动宽限期内正常退出，未保持运行（pid ${BACKGROUND_PID}）"
    return 1
  fi
  warn "后台进程在启动宽限期内退出（pid ${BACKGROUND_PID}，exit ${child_status}）"
  return "${child_status}"
}

start_gateway_fallback() {
  local log_dir="${OPENCLAW_HOME_DIR}/logs"
  local log_file="${log_dir}/tracevane-gateway-fallback.log"
  if ! mkdir -p "${log_dir}"; then
    warn "无法创建 Gateway 后台日志目录: ${log_dir}"
    return 1
  fi
  log "检测到当前环境无法管理用户级服务，改为后台拉起 Gateway（日志: ${log_file}）"
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '[dry-run] nohup openclaw gateway run --force --ws-log compact > %q 2>&1 &\n' "${log_file}"
    return 0
  fi
  run_background "${log_file}" openclaw gateway run --force --ws-log compact
}

restart_gateway_after_change() {
  GATEWAY_SERVICE_READY=0
  if can_manage_gateway_service; then
    log "安装或刷新 OpenClaw Gateway service"
    if run_cmd_allow_fail openclaw gateway install --force; then
      GATEWAY_SERVICE_READY=1
    else
      record_warning "Gateway service 安装失败，将尝试降级为后台直接运行 Gateway。"
    fi
  else
    record_warning "未检测到可用的用户级服务管理器（systemd/launchd/schtasks），将直接后台运行 Gateway。"
  fi

  if [[ "${GATEWAY_SERVICE_READY}" -eq 1 ]]; then
    log "重启 OpenClaw Gateway service"
    if ! run_cmd_allow_fail openclaw gateway restart --safe; then
      record_warning "Gateway safe restart 失败，尝试普通 restart。"
      if ! run_cmd_allow_fail openclaw gateway restart; then
        record_warning "Gateway service 重启失败，将尝试降级为后台直接运行 Gateway。"
        GATEWAY_SERVICE_READY=0
      fi
    fi
  fi

  if [[ "${GATEWAY_SERVICE_READY}" -eq 0 ]]; then
    if start_gateway_fallback; then
      RESULT_HEALTH_CHECKS+=("gateway-restart:fallback")
    else
      record_warning "后台拉起 Gateway 失败，请手工执行: openclaw gateway run --force"
      RESULT_HEALTH_CHECKS+=("gateway-restart:failed")
      return 1
    fi
  else
    RESULT_HEALTH_CHECKS+=("gateway-restart:ok")
  fi
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

is_port_in_use() {
  local port="$1"
  node - "${port}" <<'NODE'
const net = require('node:net');
const port = Number(process.argv[2]);
const socket = net.connect({ port, host: '127.0.0.1' });
const finish = (inUse) => {
  socket.destroy();
  process.exit(inUse ? 0 : 1);
};
socket.once('connect', () => finish(true));
socket.once('error', () => finish(false));
setTimeout(() => finish(false), 1500).unref();
NODE
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

pre_scan_json_output() {
  local argument
  for argument in "$@"; do
    if [[ "${argument}" == "--json" ]]; then
      JSON_OUTPUT=1
      return 0
    fi
  done
}

require_option_operand() {
  local option="${1:-option}"
  if [[ $# -lt 2 || "${2:-}" == --* ]]; then
    die "${option} 缺少参数值"
  fi
}

copy_uninstall_extension_to_backup() {
  node - "$1" "$2" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const source = process.argv[2];
const destination = process.argv[3];

function snapshot(root) {
  const records = [];
  function visit(absolutePath, relativePath) {
    const stat = fs.lstatSync(absolutePath);
    const record = { path: relativePath, mode: stat.mode & 0o777 };
    if (stat.isDirectory()) {
      record.type = 'directory';
      records.push(record);
      for (const entry of fs.readdirSync(absolutePath).sort()) {
        visit(path.join(absolutePath, entry), relativePath ? `${relativePath}/${entry}` : entry);
      }
      return;
    }
    if (stat.isFile()) {
      record.type = 'file';
      record.size = stat.size;
      record.sha256 = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
      records.push(record);
      return;
    }
    if (stat.isSymbolicLink()) {
      record.type = 'symlink';
      record.target = fs.readlinkSync(absolutePath);
      records.push(record);
      return;
    }
    throw new Error(`unsupported extension entry: ${absolutePath}`);
  }
  visit(root, '');
  return records;
}

if (fs.existsSync(destination)) {
  throw new Error(`extension backup destination already exists: ${destination}`);
}
fs.cpSync(source, destination, {
  recursive: true,
  force: false,
  errorOnExist: true,
  preserveTimestamps: true,
  verbatimSymlinks: true,
});
const sourceSnapshot = JSON.stringify(snapshot(source));
const destinationSnapshot = JSON.stringify(snapshot(destination));
if (sourceSnapshot !== destinationSnapshot) {
  throw new Error('extension backup verification failed');
}
NODE
}

quarantine_uninstall_extension() {
  node - "$1" "$2" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(process.argv[2]);
const stateFile = process.argv[3];
const parent = path.dirname(source);
const stateTemp = `${stateFile}.tmp-${process.pid}`;
const exists = (candidate) => {
  try {
    fs.lstatSync(candidate);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
};

if (!exists(source)) throw new Error(`extension source missing before quarantine: ${source}`);
for (let attempt = 0; attempt < 32; attempt += 1) {
  const candidate = path.join(parent, `.tracevane-uninstall-${crypto.randomBytes(12).toString('hex')}`);
  if (exists(candidate)) continue;
  fs.writeFileSync(stateTemp, `${candidate}\n`, { mode: 0o600 });
  fs.renameSync(stateTemp, stateFile);
  try {
    fs.renameSync(source, candidate);
  } catch (error) {
    if (exists(source) && !exists(candidate)) fs.rmSync(stateFile, { force: true });
    throw error;
  }
  if (exists(source) || !exists(candidate)) {
    throw new Error('extension quarantine verification failed');
  }
  process.stdout.write(candidate);
  process.exit(0);
}
throw new Error('unable to allocate a unique extension quarantine path');
NODE
}

restore_quarantined_extension() {
  node - "$1" "$2" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const quarantine = path.resolve(process.argv[2]);
const installDir = path.resolve(process.argv[3]);
const exists = (candidate) => {
  try {
    fs.lstatSync(candidate);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
};

if (path.dirname(quarantine) !== path.dirname(installDir)
  || !path.basename(quarantine).startsWith('.tracevane-uninstall-')) {
  throw new Error(`invalid quarantine path: ${quarantine}`);
}
if (!exists(quarantine)) throw new Error(`quarantine missing: ${quarantine}`);
if (exists(installDir)) throw new Error(`install path occupied during rollback: ${installDir}`);
fs.renameSync(quarantine, installDir);
if (!exists(installDir) || exists(quarantine)) {
  throw new Error('extension rollback verification failed');
}
NODE
}

classify_uninstall_path_relation() {
  node - "$1" "$2" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

function canonicalize(candidate) {
  let current = path.resolve(candidate);
  const missingSegments = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    missingSegments.unshift(path.basename(current));
    current = parent;
  }
  const canonicalParent = fs.existsSync(current) ? fs.realpathSync(current) : current;
  return path.resolve(canonicalParent, ...missingSegments);
}

function contains(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === ''
    || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

const installDir = canonicalize(process.argv[2]);
const retainedDataDir = canonicalize(process.argv[3]);
process.stdout.write(
  contains(installDir, retainedDataDir) || contains(retainedDataDir, installDir)
    ? 'overlap'
    : 'separate',
);
NODE
}

rollback_uninstall() {
  local restore_tmp="${OPENCLAW_CONFIG_FILE}.tracevane-uninstall-restore.tmp"
  local rollback_failed=0
  local discovered_quarantine=""

  if [[ "${UNINSTALL_ROLLBACK_DONE}" -eq 1 ]]; then
    return 0
  fi
  UNINSTALL_ROLLBACK_DONE=1
  trap - ERR
  set +e

  if [[ "${UNINSTALL_EXTENSION_QUARANTINED}" -eq 0 \
    && -n "${UNINSTALL_QUARANTINE_STATE_FILE}" \
    && -f "${UNINSTALL_QUARANTINE_STATE_FILE}" ]]; then
    IFS= read -r discovered_quarantine < "${UNINSTALL_QUARANTINE_STATE_FILE}" || true
    if [[ -n "${discovered_quarantine}" \
      && ! -e "${INSTALL_DIR}" \
      && ! -L "${INSTALL_DIR}" \
      && ( -e "${discovered_quarantine}" || -L "${discovered_quarantine}" ) ]]; then
      UNINSTALL_EXTENSION_QUARANTINE="${discovered_quarantine}"
      UNINSTALL_EXTENSION_QUARANTINED=1
    elif [[ ( -e "${INSTALL_DIR}" || -L "${INSTALL_DIR}" ) \
      && -n "${discovered_quarantine}" \
      && ! -e "${discovered_quarantine}" \
      && ! -L "${discovered_quarantine}" ]]; then
      rm -f "${UNINSTALL_QUARANTINE_STATE_FILE}" >/dev/null 2>&1 || true
    else
      warn "无法确定 Tracevane 隔离目录状态: ${discovered_quarantine:-unknown}"
      rollback_failed=1
    fi
  fi

  if [[ "${UNINSTALL_EXTENSION_QUARANTINED}" -eq 1 ]]; then
    if restore_quarantined_extension "${UNINSTALL_EXTENSION_QUARANTINE}" "${INSTALL_DIR}"; then
      UNINSTALL_EXTENSION_QUARANTINED=0
      rm -f "${UNINSTALL_QUARANTINE_STATE_FILE}" >/dev/null 2>&1 || true
    else
      warn "从同文件系统隔离目录恢复 Tracevane 扩展失败: ${UNINSTALL_EXTENSION_QUARANTINE}"
      rollback_failed=1
    fi
  fi

  if [[ "${UNINSTALL_CONFIG_MUTATED}" -eq 1 ]]; then
    rm -f "${restore_tmp}" >/dev/null 2>&1 || true
    if [[ -f "${CONFIG_BACKUP}" ]] \
      && cp "${CONFIG_BACKUP}" "${restore_tmp}" \
      && mv "${restore_tmp}" "${OPENCLAW_CONFIG_FILE}"
    then
      UNINSTALL_CONFIG_MUTATED=0
    else
      rm -f "${restore_tmp}" >/dev/null 2>&1 || true
      warn "恢复 OpenClaw 配置失败: ${CONFIG_BACKUP}"
      rollback_failed=1
    fi
  fi

  set -e
  return "${rollback_failed}"
}

handle_uninstall_error() {
  local line_no="${1:-unknown}"
  local exit_code="${2:-1}"
  if rollback_uninstall; then
    die "卸载失败（line ${line_no}，exit ${exit_code}）；已有更改已回滚"
  fi
  die "卸载失败（line ${line_no}，exit ${exit_code}），且自动回滚不完整；请检查备份"
}

handle_committed_uninstall_error() {
  local line_no="${1:-unknown}"
  local exit_code="${2:-1}"
  trap - ERR
  die "卸载已提交，但结果输出失败（line ${line_no}，exit ${exit_code}）；配置和扩展保持已卸载状态，请检查备份: ${ACTIVE_BACKUP_DIR:-unknown}"
}

commit_uninstall_transaction() {
  UNINSTALL_CONFIG_MUTATED=0
  UNINSTALL_EXTENSION_QUARANTINED=0
  UNINSTALL_ROLLBACK_DONE=1
  UNINSTALL_TRANSACTION_COMMITTED=1
  trap 'handle_committed_uninstall_error "$LINENO" "$?"' ERR
}

uninstall_tracevane() {
  local uninstall_stamp
  local uninstall_backup_template
  local uninstall_backup_dir
  local extension_backup_dir
  local config_backup_path
  local path_relation
  local retained_data_dir="${OPENCLAW_HOME_DIR}/tracevane"

  trap 'handle_uninstall_error "$LINENO" "$?"' ERR
  TRACEVANE_MODE="uninstall"
  path_relation="$(classify_uninstall_path_relation "${INSTALL_DIR}" "${retained_data_dir}")"
  if [[ "${path_relation}" == "overlap" ]]; then
    append_result_warning "安装目录与保留用户数据目录重叠；安全卸载已停止，配置和文件均未更改。"
    die "安装目录与保留用户数据目录重叠: ${INSTALL_DIR}；请将扩展安装到独立目录后重试"
  fi
  if [[ "${path_relation}" != "separate" ]]; then
    die "无法确认安装目录与保留用户数据目录是否安全分离"
  fi

  uninstall_stamp="$(date +%Y%m%d%H%M%S)"
  uninstall_backup_template="${BACKUP_ROOT}/uninstall-${uninstall_stamp}-XXXXXX"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "[dry-run] 将创建唯一备份目录 ${uninstall_backup_template}"
    log "[dry-run] 将备份配置到新目录中的 openclaw.json"
    log "[dry-run] 将从配置中移除 Tracevane 并移动扩展到新目录中的 tracevane"
    RESULT_HEALTH_CHECKS+=("uninstall:dry-run")
    append_result_warning "用户数据将保留在: ${retained_data_dir}"
    if [[ "${JSON_OUTPUT}" -eq 1 ]]; then
      emit_result_json "ok"
    else
      printf 'Tracevane 卸载 dry-run 完成；用户数据将保留在: %s\n' "${retained_data_dir}"
    fi
    trap - ERR
    return 0
  fi

  [[ -f "${OPENCLAW_CONFIG_FILE}" ]] || die "找不到 OpenClaw 配置文件: ${OPENCLAW_CONFIG_FILE}"
  mkdir -p "${BACKUP_ROOT}"
  uninstall_backup_dir="$(mktemp -d "${uninstall_backup_template}")"
  if [[ -z "${uninstall_backup_dir}" || ! -d "${uninstall_backup_dir}" ]]; then
    die "无法创建唯一卸载备份目录: ${uninstall_backup_template}"
  fi
  extension_backup_dir="${uninstall_backup_dir}/tracevane"
  config_backup_path="${uninstall_backup_dir}/openclaw.json"
  UNINSTALL_EXTENSION_BACKUP=""
  UNINSTALL_QUARANTINE_STATE_FILE="${uninstall_backup_dir}/extension-quarantine-path"
  cp "${OPENCLAW_CONFIG_FILE}" "${config_backup_path}"
  CONFIG_BACKUP="${config_backup_path}"
  ACTIVE_BACKUP_DIR="${uninstall_backup_dir}"
  UNINSTALL_CONFIG_MUTATED=1

  if ! node - "${OPENCLAW_CONFIG_FILE}" "${INSTALL_DIR}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const configPath = process.argv[2];
const installDir = path.resolve(process.argv[3]);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const plugins = config.plugins && typeof config.plugins === 'object' ? config.plugins : {};
if (plugins.entries && typeof plugins.entries === 'object') {
  delete plugins.entries.tracevane;
}
if (plugins.load && Array.isArray(plugins.load.paths)) {
  plugins.load.paths = plugins.load.paths.filter((entry) => {
    if (typeof entry !== 'string') return true;
    return path.resolve(entry) !== installDir;
  });
}
config.plugins = plugins;
const temporaryPath = `${configPath}.tracevane-uninstall.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(temporaryPath, configPath);
NODE
  then
    rm -f "${OPENCLAW_CONFIG_FILE}.tracevane-uninstall.tmp" || true
    if rollback_uninstall; then
      die "无法安全更新 OpenClaw 配置；已恢复原配置"
    fi
    die "卸载配置写入失败，且无法从备份恢复: ${CONFIG_BACKUP}"
  fi

  if ! openclaw config validate; then
    if rollback_uninstall; then
      die "卸载后的配置校验失败；已恢复原配置"
    fi
    die "卸载后的配置校验失败，且无法从备份恢复: ${CONFIG_BACKUP}"
  fi
  RESULT_HEALTH_CHECKS+=("config-validate:ok")

  if [[ -d "${INSTALL_DIR}" ]]; then
    UNINSTALL_EXTENSION_BACKUP="${extension_backup_dir}"
    if [[ -e "${extension_backup_dir}" || -L "${extension_backup_dir}" ]]; then
      if rollback_uninstall; then
        die "唯一备份目录中的扩展目标已被占用；已恢复原配置"
      fi
      die "扩展备份目标被占用，且无法恢复配置: ${extension_backup_dir}"
    fi
    if ! copy_uninstall_extension_to_backup "${INSTALL_DIR}" "${extension_backup_dir}"; then
      rm -rf "${extension_backup_dir}" >/dev/null 2>&1 || record_warning "清理不完整的扩展备份失败: ${extension_backup_dir}"
      if rollback_uninstall; then
        die "复制 Tracevane 扩展备份失败；源目录未移动，已恢复原配置"
      fi
      die "复制 Tracevane 扩展备份失败，且无法恢复配置: ${CONFIG_BACKUP}"
    fi
    if [[ ! -d "${extension_backup_dir}" && ! -L "${extension_backup_dir}" ]]; then
      if rollback_uninstall; then
        die "扩展备份校验后的目录形状不符合预期；源目录未移动，已恢复原配置"
      fi
      die "扩展备份校验后的目录形状不符合预期，且自动回滚不完整"
    fi
    if ! UNINSTALL_EXTENSION_QUARANTINE="$(quarantine_uninstall_extension "${INSTALL_DIR}" "${UNINSTALL_QUARANTINE_STATE_FILE}")"; then
      if rollback_uninstall; then
        die "隔离 Tracevane 扩展失败；已恢复原配置和扩展"
      fi
      die "隔离 Tracevane 扩展失败，且自动回滚不完整"
    fi
    UNINSTALL_EXTENSION_QUARANTINED=1
    if [[ -e "${INSTALL_DIR}" || -L "${INSTALL_DIR}" \
      || ( ! -e "${UNINSTALL_EXTENSION_QUARANTINE}" && ! -L "${UNINSTALL_EXTENSION_QUARANTINE}" ) ]]; then
      if rollback_uninstall; then
        die "扩展隔离后的目录形状不符合预期；已恢复原配置和扩展"
      fi
      die "扩展隔离后的目录形状不符合预期，且自动回滚不完整"
    fi
    RESULT_HEALTH_CHECKS+=("extension-backup:ok")
  else
    RESULT_HEALTH_CHECKS+=("extension-backup:not-installed")
    append_result_warning "Tracevane 扩展未安装；未创建扩展备份。"
  fi

  restart_gateway_after_change
  if [[ "${UNINSTALL_EXTENSION_QUARANTINED}" -eq 1 ]]; then
    if rm -rf "${UNINSTALL_EXTENSION_QUARANTINE}"; then
      UNINSTALL_EXTENSION_QUARANTINED=0
      if ! rm -f "${UNINSTALL_QUARANTINE_STATE_FILE}"; then
        record_warning "扩展隔离目录已清理，但无法删除事务状态文件: ${UNINSTALL_QUARANTINE_STATE_FILE}"
      fi
    else
      record_warning "Gateway 已重启，但清理扩展隔离目录失败；已验证的备份仍保留在: ${extension_backup_dir}"
    fi
  fi
  if [[ "${UNINSTALL_EXTENSION_QUARANTINED}" -eq 0 ]]; then
    commit_uninstall_transaction
  fi
  append_result_warning "用户数据已保留在: ${retained_data_dir}"
  if [[ "${JSON_OUTPUT}" -eq 1 ]]; then
    emit_result_json "ok"
  else
    printf '\n=== Tracevane 卸载完成 ===\n'
    printf '配置备份: %s\n' "${CONFIG_BACKUP}"
    if [[ -n "${UNINSTALL_EXTENSION_BACKUP}" ]]; then
      printf '扩展备份: %s\n' "${UNINSTALL_EXTENSION_BACKUP}"
    else
      printf '扩展备份: 未安装（无需备份）\n'
    fi
    printf '保留用户数据: %s\n' "${retained_data_dir}"
  fi
  if [[ "${UNINSTALL_TRANSACTION_COMMITTED}" -eq 0 ]]; then
    commit_uninstall_transaction
  fi
  trap - ERR
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode)
        require_option_operand "$@"
        TRACEVANE_MODE="$2"
        shift 2
        ;;
      --version)
        require_option_operand "$@"
        TRACEVANE_VERSION="$2"
        VERSION_EXPLICIT=1
        shift 2
        ;;
      --release-base)
        require_option_operand "$@"
        TRACEVANE_RELEASE_BASE="$2"
        shift 2
        ;;
      --site-base)
        require_option_operand "$@"
        TRACEVANE_RELEASE_BASE="$2"
        warn "--site-base 已弃用；请改用 --release-base。"
        shift 2
        ;;
      --package-url)
        require_option_operand "$@"
        TRACEVANE_PACKAGE_URL="$2"
        PACKAGE_URL_EXPLICIT=1
        shift 2
        ;;
      --package-sha256)
        require_option_operand "$@"
        TRACEVANE_PACKAGE_SHA256="$2"
        shift 2
        ;;
      --api-port)
        require_option_operand "$@"
        TRACEVANE_API_PORT="$2"
        shift 2
        ;;
      --base-path)
        require_option_operand "$@"
        TRACEVANE_GATEWAY_BASE_PATH="$2"
        shift 2
        ;;
      --gateway-bind)
        require_option_operand "$@"
        TRACEVANE_GATEWAY_BIND="$2"
        GATEWAY_BIND_EXPLICIT=1
        shift 2
        ;;
      --config)
        require_option_operand "$@"
        OPENCLAW_CONFIG_FILE="$2"
        shift 2
        ;;
      --extensions-dir)
        require_option_operand "$@"
        TRACEVANE_EXTENSIONS_DIR="$2"
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
      --json)
        JSON_OUTPUT=1
        shift
        ;;
      --uninstall)
        UNINSTALL=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      -h|--help)
        HELP_REQUESTED=1
        usage
        if [[ "${JSON_OUTPUT}" -eq 1 ]]; then
          RESULT_HEALTH_CHECKS+=("help")
          emit_result_json "ok"
        fi
        exit 0
        ;;
      *)
        die "未知参数: $1"
        ;;
    esac
  done
}

pre_scan_json_output "$@"
if [[ "${JSON_OUTPUT}" -eq 1 ]]; then
  exec 3>&1
  RESULT_OUTPUT_FD=3
  exec 1>&2
fi
parse_args "$@"
detect_platform
if [[ "${UNINSTALL}" -eq 1 ]]; then
  require_command node
  require_command openclaw
  uninstall_tracevane
  exit 0
fi
trap 'handle_install_error "$LINENO" "$?"' ERR

resolve_requested_release

if [[ ! "${TRACEVANE_PACKAGE_SHA256}" =~ ^[0-9A-Fa-f]{64}$ ]]; then
  die "缺少有效的安装包 SHA-256；请使用官方 Release metadata，或同时传入 --package-sha256。"
fi
TRACEVANE_PACKAGE_SHA256="$(printf '%s' "${TRACEVANE_PACKAGE_SHA256}" | tr '[:upper:]' '[:lower:]')"
if PACKAGE_URL_DISPLAY="$(sanitize_url_for_output "${TRACEVANE_PACKAGE_URL}")"; then
  record_access_url "${TRACEVANE_PACKAGE_URL}" || true
else
  PACKAGE_URL_DISPLAY="[credential-bearing URL redacted]"
  record_warning "安装包 URL 包含凭据；结果输出已隐藏该 URL。"
fi
RESULT_HEALTH_CHECKS+=("release-metadata:ok")

TRACEVANE_GATEWAY_BASE_PATH="$(normalize_base_path "${TRACEVANE_GATEWAY_BASE_PATH}")"

case "${TRACEVANE_MODE}" in
  standalone|gateway) ;;
  *) die "--mode 只支持 standalone 或 gateway" ;;
esac

if ! [[ "${TRACEVANE_API_PORT}" =~ ^[0-9]+$ ]] || [[ "${TRACEVANE_API_PORT}" -lt 1 || "${TRACEVANE_API_PORT}" -gt 65535 ]]; then
  die "--api-port 必须是 1-65535 的数字（当前: ${TRACEVANE_API_PORT}）"
fi
case "${TRACEVANE_GATEWAY_BIND}" in
  auto|loopback|lan|tailnet|custom) ;;
  *) die "--gateway-bind 只支持 auto|loopback|lan|tailnet|custom（当前: ${TRACEVANE_GATEWAY_BIND}）" ;;
esac

require_command node
if ! node -e 'const major = Number(process.versions.node.split(".")[0]); process.exit(major >= 18 ? 0 : 1)'; then
  die "Node.js 版本过低（当前 $(node --version 2>/dev/null || printf '未知')），Tracevane 需要 Node.js >= 18"
fi
if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
  die "缺少 curl 或 wget，无法读取站点 metadata 或下载安装包"
fi
if [[ "${CHECK_RELEASE}" -eq 1 ]]; then
  log "Tracevane release metadata OK"
  log "版本: ${TRACEVANE_VERSION}"
  log "最低 OpenClaw: ${OPENCLAW_MIN_VERSION}"
  log "安装包: ${PACKAGE_URL_DISPLAY}"
  log "安装包 SHA-256: ${TRACEVANE_PACKAGE_SHA256}"
  if probe_url "${TRACEVANE_PACKAGE_URL}"; then
    log "安装包 URL 可访问"
    RESULT_HEALTH_CHECKS+=("package-url:ok")
  else
    die "安装包 URL 不可访问: ${PACKAGE_URL_DISPLAY}"
  fi
  if [[ "${JSON_OUTPUT}" -eq 1 ]]; then
    INSTALL_DIR=""
    OPENCLAW_CONFIG_FILE=""
    ACTIVE_BACKUP_DIR=""
    CONFIG_BACKUP=""
    emit_result_json "ok"
  fi
  exit 0
fi
RESULT_ACCESS_URLS=()
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

if [[ "${DRY_RUN}" -eq 0 ]] && is_port_in_use "${TRACEVANE_API_PORT}"; then
  if http_get "http://127.0.0.1:${TRACEVANE_API_PORT}/api/system/health" 2>/dev/null | grep -q '"sseConnections"'; then
    log "端口 ${TRACEVANE_API_PORT} 上已有运行中的 Tracevane，本次执行升级替换"
  else
    die "端口 ${TRACEVANE_API_PORT} 已被占用且未响应 Tracevane 健康检查；请释放该端口、重启异常的旧实例（openclaw gateway restart），或通过 --api-port 指定其它端口"
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
log "下载安装包: ${PACKAGE_URL_DISPLAY}"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  printf '[dry-run] download %q -> %q\n' "${PACKAGE_URL_DISPLAY}" "${ARCHIVE_PATH}"
else
  download_file "${TRACEVANE_PACKAGE_URL}" "${ARCHIVE_PATH}"
fi
log "校验安装包 SHA-256"
verify_package_checksum "${ARCHIVE_PATH}" "${TRACEVANE_PACKAGE_SHA256}"

log "解压安装包"
run_cmd tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  PACKAGE_DIR="${TMP_DIR}/tracevane-${TRACEVANE_VERSION}"
else
  PACKAGE_DIR=""
  for package_candidate in "${TMP_DIR}"/tracevane-*; do
    [[ -d "${package_candidate}" ]] || continue
    PACKAGE_DIR="${package_candidate}"
    break
  done
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
// 安装后的插件目录不是 monorepo workspace 根，移除 workspaces 避免 npm 按 workspace 解析缺失的 apps/*。
delete pkg.workspaces;
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
  NODE_PTY_STATE_FILE="${TMP_DIR}/node-pty-degraded"
  rm -f "${NODE_PTY_STATE_FILE}"
  (
    cd "${INSTALL_DIR}"
    npm install --production --ignore-scripts
    npm rebuild @homebridge/node-pty-prebuilt-multiarch 2>&1 || warn "node-pty rebuild 失败，终端功能可能不可用。请确保已安装 build-essential 和 cmake。"
    if ! node -e "require('@homebridge/node-pty-prebuilt-multiarch')" 2>/dev/null; then
      printf 'terminal\n' > "${NODE_PTY_STATE_FILE}"
    fi
  )
  if [[ -f "${NODE_PTY_STATE_FILE}" ]]; then
    append_degraded_feature "terminal"
    if [[ "${TRACEVANE_PLATFORM}" == "Darwin" ]]; then
      record_warning "node-pty 原生模块加载失败（Node ABI $(node -e 'process.stdout.write(process.versions.modules)')）；终端功能不可用。请确认 Xcode Command Line Tools 已安装。"
    else
      record_warning "node-pty 原生模块加载失败（Node ABI $(node -e 'process.stdout.write(process.versions.modules)')）；终端功能不可用。请确认 build-essential 和 cmake 已安装。"
    fi
    warn "可稍后手工执行: cd ${INSTALL_DIR} && npm rebuild @homebridge/node-pty-prebuilt-multiarch"
    rm -f "${NODE_PTY_STATE_FILE}"
  fi
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

restart_gateway_after_change

if [[ "${DRY_RUN}" -eq 1 ]]; then
  trap - ERR
  log "dry-run 模式跳过健康检查"
  RESULT_HEALTH_CHECKS+=("health:dry-run")
  if [[ "${TRACEVANE_MODE}" == "standalone" ]]; then
    record_access_url "http://HOST:${TRACEVANE_API_PORT}/" || true
  else
    record_access_url "http://HOST:${GATEWAY_PORT}${TRACEVANE_GATEWAY_BASE_PATH}/" || true
  fi
  if [[ "${JSON_OUTPUT}" -eq 1 ]]; then
    emit_result_json "ok"
  fi
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
fi
HEALTH_REQUEST_URL="${HEALTH_URL}"
if [[ "${TRACEVANE_MODE}" == "gateway" && "${GATEWAY_AUTH_MODE}" == "token" && -n "${GATEWAY_TOKEN}" ]]; then
  HEALTH_REQUEST_URL="${HEALTH_URL}?token=${GATEWAY_TOKEN}"
fi

log "执行健康检查: ${HEALTH_URL}"
HEALTH_OK=0
HEALTH_BODY=""
if HEALTH_BODY="$(probe_health "${HEALTH_REQUEST_URL}")"; then
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

record_access_url "${ACCESS_URL}" || true
if [[ "${HEALTH_OK}" -eq 1 ]]; then
  RESULT_HEALTH_CHECKS+=("primary-health:ok")
else
  RESULT_HEALTH_CHECKS+=("primary-health:failed")
  record_warning "健康检查未通过，请手工执行: openclaw gateway health 或通过浏览器访问 ${HEALTH_URL}"
fi
if [[ -n "${STANDALONE_HEALTH_URL}" ]]; then
  if [[ "${STANDALONE_HEALTH_OK}" -eq 1 ]]; then
    RESULT_HEALTH_CHECKS+=("standalone-health:ok")
  else
    RESULT_HEALTH_CHECKS+=("standalone-health:failed")
    record_warning "3760 回退入口健康检查未通过，请确认 Tracevane standalone transport 已启用: ${STANDALONE_HEALTH_URL}"
  fi
fi

if [[ "${JSON_OUTPUT}" -eq 1 ]]; then
  emit_result_json "ok"
  trap - ERR
  exit 0
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
fi
if [[ -n "${STANDALONE_HEALTH_URL}" ]]; then
  printf '3760 回退健康检查: %s\n' "$([[ "${STANDALONE_HEALTH_OK}" -eq 1 ]] && printf '成功' || printf '失败')"
  if [[ "${STANDALONE_HEALTH_OK}" -eq 1 ]]; then
    printf '3760 健康检查响应: %s\n' "${STANDALONE_HEALTH_BODY}"
  fi
fi
trap - ERR
