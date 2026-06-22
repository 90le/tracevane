#!/bin/bash
# Tracevane 打包脚本
# 用法: ./pack.sh [版本号]
# 示例: ./pack.sh 0.1.63
# 测试打包: ./pack.sh --no-source-sync --output-dir /tmp/tracevane-release-test 0.1.26

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  cat <<'EOF'
Tracevane 打包脚本

用法:
  ./pack.sh [options] [版本号]

选项:
  --source-sync              同步本地源码版本后再打包，默认用于正式发布
  --no-source-sync           测试打包模式，不修改当前源码里的版本文件
  --output-dir <dir>         输出目录，默认 ./release
  -h, --help                 显示帮助

示例:
  ./pack.sh
  ./pack.sh 0.1.26
  ./pack.sh --no-source-sync --output-dir /tmp/tracevane-release-test 0.1.26
EOF
}

SOURCE_SYNC=1
OUTPUT_DIR_INPUT="${SCRIPT_DIR}/release"
VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-sync)
      SOURCE_SYNC=1
      shift
      ;;
    --no-source-sync)
      SOURCE_SYNC=0
      shift
      ;;
    --output-dir)
      if [[ $# -lt 2 ]]; then
        echo "错误: --output-dir 需要目录参数" >&2
        exit 2
      fi
      OUTPUT_DIR_INPUT="$2"
      shift 2
      ;;
    --output-dir=*)
      OUTPUT_DIR_INPUT="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "错误: 未知参数 $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -n "${VERSION}" ]]; then
        echo "错误: 只能指定一个版本号" >&2
        usage >&2
        exit 2
      fi
      VERSION="$1"
      shift
      ;;
  esac
done

VERSION=${VERSION:-$(node -p "require(process.argv[1]).version" "${SCRIPT_DIR}/package.json")}
mkdir -p "${OUTPUT_DIR_INPUT}"
OUTPUT_DIR="$(cd "${OUTPUT_DIR_INPUT}" && pwd)"
PACKAGE_NAME="tracevane-${VERSION}"
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"
ROOT_INSTALLER_PATH="${OUTPUT_DIR}/install-tracevane.sh"
ROOT_LANDING_PATH="${OUTPUT_DIR}/index.html"
LANDING_PAGE_PATH="${SCRIPT_DIR}/index.html"
APP_REACT_SOURCE_PATH="${SCRIPT_DIR}/apps/web/src/app/App.tsx"
OPENCLAW_TARGET_VERSION="$(
  node - "${SCRIPT_DIR}/package.json" <<'NODE'
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const raw = String(pkg?.openclaw?.install?.minHostVersion || '2026.4.8');
const match = raw.match(/[0-9]+(?:\.[0-9A-Za-z-]+)+/g);
console.log(match ? match[match.length - 1] : '2026.4.8');
NODE
)"

echo "=== Tracevane 打包脚本 ==="
echo "版本: ${VERSION}"
echo "输出目录: ${OUTPUT_DIR}"
if [[ "${SOURCE_SYNC}" -eq 1 ]]; then
  echo "源码同步: enabled (会覆盖本地版本源)"
else
  echo "源码同步: disabled (--no-source-sync，不修改本地版本源)"
fi
echo ""

if [[ "${SOURCE_SYNC}" -eq 1 ]]; then
  echo "[0.2/6] 同步 package/workspace 版本..."
  node - "${SCRIPT_DIR}" "${VERSION}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const scriptDir = process.argv[2];
const version = process.argv[3];
const packageFiles = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
];

for (const relativePath of packageFiles) {
  const filePath = path.join(scriptDir, relativePath);
  if (!fs.existsSync(filePath)) continue;
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  payload.version = version;
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

const lockPath = path.join(scriptDir, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = version;
  for (const packageKey of ['', 'apps/api', 'apps/web']) {
    if (lock.packages?.[packageKey]) {
      lock.packages[packageKey].version = version;
    }
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

function rewriteTextFile(relativePath, replacements) {
  const filePath = path.join(scriptDir, relativePath);
  if (!fs.existsSync(filePath)) return;
  let source = fs.readFileSync(filePath, 'utf8');
  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(source)) {
      throw new Error(`version marker not found in ${relativePath}: ${pattern}`);
    }
    source = source.replace(pattern, replacement);
  }
  fs.writeFileSync(filePath, source, 'utf8');
}

rewriteTextFile('apps/api/config.ts', [
  [/const TRACEVANE_VERSION_FALLBACK = '[^']+';/, `const TRACEVANE_VERSION_FALLBACK = '${version}';`],
]);
rewriteTextFile('apps/web/vite.config.ts', [
  [/const TRACEVANE_PACKAGE_VERSION_FALLBACK = '[^']+';/, `const TRACEVANE_PACKAGE_VERSION_FALLBACK = '${version}';`],
]);
NODE
else
  echo "[0.2/6] 跳过本地 package/workspace 版本同步..."
fi

if [[ "${SOURCE_SYNC}" -eq 1 ]]; then
  echo "[0.4/6] 同步本地 installer 默认版本..."
  node "${SCRIPT_DIR}/scripts/tracevane-release-installer-utils.mjs" rewrite-installer-version \
    "${VERSION}" \
    "${OPENCLAW_TARGET_VERSION}" \
    "${SCRIPT_DIR}/install-tracevane.sh"
else
  echo "[0.4/6] 跳过本地 installer 版本同步..."
fi

if [[ "${SOURCE_SYNC}" -eq 1 ]]; then
  echo "[0.5/6] 同步站点安装页版本..."
  node "${SCRIPT_DIR}/scripts/tracevane-release-installer-utils.mjs" rewrite-landing-version \
    "${VERSION}" \
    "${OPENCLAW_TARGET_VERSION}" \
    "${LANDING_PAGE_PATH}"
else
  echo "[0.5/6] 跳过本地站点安装页版本同步..."
fi

echo "[0.8/6] 清理旧构建产物..."
node "${SCRIPT_DIR}/scripts/clean-build-output.mjs" all

echo "[1/6] 构建 API..."
cd "${SCRIPT_DIR}"
npm run build:api

echo "[2/6] 构建前端..."
TRACEVANE_BUILD_VERSION="${VERSION}" npm run build:web

echo "[3/6] 准备打包目录..."
rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}/apps/web"

echo "[4/6] 复制构建产物..."
cp -r "${SCRIPT_DIR}/dist" "${PACKAGE_DIR}/"
cp -r "${SCRIPT_DIR}/apps/web/dist" "${PACKAGE_DIR}/apps/web/"
if [[ -d "${SCRIPT_DIR}/resources" ]]; then
  cp -r "${SCRIPT_DIR}/resources" "${PACKAGE_DIR}/"
fi
mkdir -p "${PACKAGE_DIR}/apps/web/src"
mkdir -p "${PACKAGE_DIR}/apps/web/src/app"
cp "${APP_REACT_SOURCE_PATH}" "${PACKAGE_DIR}/apps/web/src/app/App.tsx"

echo "[5/6] 复制元数据..."
cp "${SCRIPT_DIR}/package.json" "${PACKAGE_DIR}/"
cp "${SCRIPT_DIR}/openclaw.plugin.json" "${PACKAGE_DIR}/"
cp "${SCRIPT_DIR}/DEPLOY.md" "${PACKAGE_DIR}/"
cp "${SCRIPT_DIR}/install-tracevane.sh" "${PACKAGE_DIR}/"
cp "${SCRIPT_DIR}/install-tracevane.sh" "${ROOT_INSTALLER_PATH}"
cp "${LANDING_PAGE_PATH}" "${ROOT_LANDING_PATH}"

echo "[5.2/6] 同步 installer 默认版本..."
node "${SCRIPT_DIR}/scripts/tracevane-release-installer-utils.mjs" rewrite-installer-version \
  "${VERSION}" \
  "${OPENCLAW_TARGET_VERSION}" \
  "${PACKAGE_DIR}/install-tracevane.sh" \
  "${ROOT_INSTALLER_PATH}"

echo "[5.3/6] 同步输出目录安装页版本..."
node "${SCRIPT_DIR}/scripts/tracevane-release-installer-utils.mjs" rewrite-landing-version \
  "${VERSION}" \
  "${OPENCLAW_TARGET_VERSION}" \
  "${ROOT_LANDING_PATH}"

echo "[5.5/6] 修正发布包元数据..."
node - "${PACKAGE_DIR}" "${VERSION}" "${OPENCLAW_TARGET_VERSION}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const packageDir = process.argv[2];
const version = process.argv[3];
const targetVersion = process.argv[4];

const packagePath = path.join(packageDir, 'package.json');
const manifestPath = path.join(packageDir, 'openclaw.plugin.json');

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.version = version;
pkg.openclaw = pkg.openclaw && typeof pkg.openclaw === 'object' ? pkg.openclaw : {};
pkg.openclaw.id = 'tracevane';
pkg.openclaw.kind = 'ui';
pkg.openclaw.installDependencies = true;
pkg.openclaw.extensions = ['./dist/index.js'];
pkg.openclaw.install = pkg.openclaw.install && typeof pkg.openclaw.install === 'object' ? pkg.openclaw.install : {};
pkg.openclaw.install.minHostVersion = `>=${targetVersion}`;
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = version;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
NODE

echo "[5.6/6] 记录发布源码快照..."
node - "${PACKAGE_DIR}" "${VERSION}" "${OPENCLAW_TARGET_VERSION}" "${APP_REACT_SOURCE_PATH}" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const packageDir = process.argv[2];
const version = process.argv[3];
const targetVersion = process.argv[4];
const appReactPath = process.argv[5];
const appReact = fs.readFileSync(appReactPath);
const payload = {
  version,
  minOpenClawVersion: targetVersion,
  builtAt: new Date().toISOString(),
  sourceSnapshot: {
    appReact: {
      path: 'apps/web/src/app/App.tsx',
      sha256: crypto.createHash('sha256').update(appReact).digest('hex'),
      bytes: appReact.length,
    },
  },
};
fs.writeFileSync(path.join(packageDir, 'release-build.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
NODE

echo "[6/6] 生成安装脚本..."
cat > "${PACKAGE_DIR}/install.sh" << 'INSTALL_EOF'
#!/bin/bash
set -euo pipefail

echo "=== 安装 Tracevane 依赖 ==="
npm install --production --ignore-scripts

echo "构建原生模块..."
npm rebuild @homebridge/node-pty-prebuilt-multiarch 2>/dev/null || echo "警告: node-pty 构建可能需要编译环境"

echo ""
echo "安装完成。"
echo "请确认 OpenClaw 主程序版本 >= 2026.4.8。"
INSTALL_EOF
chmod +x "${PACKAGE_DIR}/install.sh"
chmod +x "${PACKAGE_DIR}/install-tracevane.sh"
chmod +x "${ROOT_INSTALLER_PATH}"

echo ""
echo "创建压缩包..."
cd "${OUTPUT_DIR}"
tar -czvf "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}"

echo "[6.5/6] 生成站点升级元数据..."
node - "${OUTPUT_DIR}" "${VERSION}" "${OPENCLAW_TARGET_VERSION}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const outputDir = process.argv[2];
const version = process.argv[3];
const targetVersion = process.argv[4];
const packageUrl = `https://tracevane.90le.cn/tracevane-${version}.tar.gz`;
const payload = {
  version,
  latestVersion: version,
  packageUrl,
  minOpenClawVersion: targetVersion,
  notes: [
    'Tracevane release package',
  ],
  publishedAt: new Date().toISOString(),
};

for (const fileName of ['tracevane-latest.json', 'tracevane-version.json', 'version.json']) {
  fs.writeFileSync(path.join(outputDir, fileName), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
NODE

SIZE=$(du -sh "${PACKAGE_DIR}" | cut -f1)
ARCHIVE_SIZE=$(du -sh "${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz" | cut -f1)

echo ""
echo "=== 打包完成 ==="
echo "目录: ${PACKAGE_DIR}"
echo "压缩包: ${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"
echo "目录大小: ${SIZE}"
echo "压缩包大小: ${ARCHIVE_SIZE}"
