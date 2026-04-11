#!/bin/bash
# OpenClaw Studio 打包脚本
# 用法: ./pack.sh [版本号]
# 示例: ./pack.sh 0.1.21

set -euo pipefail

VERSION=${1:-$(node -p "require('./package.json').version")}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/release"
PACKAGE_NAME="openclaw-studio-${VERSION}"
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"
ROOT_INSTALLER_PATH="${OUTPUT_DIR}/install-openclaw-studio.sh"
OPENCLAW_TARGET_VERSION="$(
  node -e "const fs=require('node:fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));const raw=String(pkg?.openclaw?.install?.minHostVersion||'2026.4.8');const match=raw.match(/[0-9]+(?:\\.[0-9A-Za-z-]+)+/g);console.log(match?match[match.length-1]:'2026.4.8');"
)"

echo "=== OpenClaw Studio 打包脚本 ==="
echo "版本: ${VERSION}"
echo "输出目录: ${OUTPUT_DIR}"
echo ""

echo "[1/6] 构建 API..."
cd "${SCRIPT_DIR}"
npm run build:api

echo "[2/6] 构建前端..."
npm run build:web

echo "[3/6] 准备打包目录..."
rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}/apps/web-vue"

echo "[4/6] 复制构建产物..."
cp -r "${SCRIPT_DIR}/dist" "${PACKAGE_DIR}/"
cp -r "${SCRIPT_DIR}/apps/web-vue/dist" "${PACKAGE_DIR}/apps/web-vue/"

echo "[5/6] 复制元数据..."
cp "${SCRIPT_DIR}/package.json" "${PACKAGE_DIR}/"
cp "${SCRIPT_DIR}/openclaw.plugin.json" "${PACKAGE_DIR}/"
cp "${SCRIPT_DIR}/DEPLOY.md" "${PACKAGE_DIR}/"
cp "${SCRIPT_DIR}/install-openclaw-studio.sh" "${PACKAGE_DIR}/"
cp "${SCRIPT_DIR}/install-openclaw-studio.sh" "${ROOT_INSTALLER_PATH}"

echo "[5.2/6] 同步 installer 默认版本..."
node "${SCRIPT_DIR}/scripts/studio-release-installer-utils.mjs" rewrite-installer-version \
  "${VERSION}" \
  "${OPENCLAW_TARGET_VERSION}" \
  "${PACKAGE_DIR}/install-openclaw-studio.sh" \
  "${ROOT_INSTALLER_PATH}"

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
pkg.openclaw.id = 'studio';
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

echo "[6/6] 生成安装脚本..."
cat > "${PACKAGE_DIR}/install.sh" << 'INSTALL_EOF'
#!/bin/bash
set -euo pipefail

echo "=== 安装 OpenClaw Studio 依赖 ==="
npm install --production --ignore-scripts

echo "构建原生模块..."
npm rebuild @homebridge/node-pty-prebuilt-multiarch 2>/dev/null || echo "警告: node-pty 构建可能需要编译环境"

echo ""
echo "安装完成。"
echo "请确认 OpenClaw 主程序版本 >= 2026.4.8。"
INSTALL_EOF
chmod +x "${PACKAGE_DIR}/install.sh"
chmod +x "${PACKAGE_DIR}/install-openclaw-studio.sh"
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
const packageUrl = `https://studio.90le.cn/openclaw-studio-${version}.tar.gz`;
const payload = {
  version,
  latestVersion: version,
  packageUrl,
  minOpenClawVersion: targetVersion,
  notes: [
    'OpenClaw Studio release package',
  ],
  publishedAt: new Date().toISOString(),
};

for (const fileName of ['openclaw-studio-latest.json', 'studio-version.json', 'version.json']) {
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
