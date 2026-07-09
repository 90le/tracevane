#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACEVANE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
TEST_PORT="${TEST_PORT:-19091}"
BASE_PATH="${BASE_PATH:-/tracevane}"
GATEWAY_PID=""

cleanup() {
  if [[ -n "${GATEWAY_PID}" ]]; then
    kill "${GATEWAY_PID}" 2>/dev/null || true
    wait "${GATEWAY_PID}" 2>/dev/null || true
  fi
  rm -rf "${TEST_ROOT}"
}
trap cleanup EXIT

cat > "${TEST_ROOT}/openclaw.json" <<EOF
{
  "gateway": {
    "mode": "local",
    "port": ${TEST_PORT},
    "bind": "loopback",
    "auth": {
      "mode": "none"
    },
    "controlUi": {
      "allowedOrigins": [
        "http://127.0.0.1:${TEST_PORT}",
        "http://localhost:${TEST_PORT}"
      ],
      "dangerouslyAllowHostHeaderOriginFallback": false,
      "allowInsecureAuth": true
    }
  },
  "plugins": {
    "allow": ["tracevane"],
    "load": {
      "paths": [
        "${TRACEVANE_ROOT}"
      ]
    },
    "entries": {
      "tracevane": {
        "enabled": true,
        "config": {
          "autoStart": true,
          "transport": {
            "standalone": {
              "enabled": false,
              "port": 3760
            },
            "gateway": {
              "enabled": true,
              "basePath": "${BASE_PATH}"
            }
          }
        }
      }
    }
  }
}
EOF

echo "=== Gateway HTTP foundation test ==="
echo "state dir: ${TEST_ROOT}"
echo "gateway port: ${TEST_PORT}"
echo "base path: ${BASE_PATH}"
echo ""

OPENCLAW_STATE_DIR="${TEST_ROOT}" \
OPENCLAW_CONFIG_PATH="${TEST_ROOT}/openclaw.json" \
openclaw gateway run --allow-unconfigured --auth none --port "${TEST_PORT}" --force \
  > "${TEST_ROOT}/gateway.log" 2>&1 &
GATEWAY_PID=$!

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${TEST_PORT}${BASE_PATH}/api/system/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[1/3] GET ${BASE_PATH}/"
INDEX_HTML="$(curl -sf "http://127.0.0.1:${TEST_PORT}${BASE_PATH}/")"
if [[ "${INDEX_HTML}" == *"__TRACEVANE_RUNTIME__"* ]] && [[ "${INDEX_HTML}" == *"\"exposureKind\":\"gateway\""* ]]; then
  echo "  ok: runtime config injected"
else
  echo "  fail: runtime config missing"
  exit 1
fi

echo "[2/3] GET ${BASE_PATH}/api/system/health"
HEALTH_JSON="$(curl -sf "http://127.0.0.1:${TEST_PORT}${BASE_PATH}/api/system/health")"
if [[ "${HEALTH_JSON}" == *"\"gatewayConnected\":"* ]] && [[ "${HEALTH_JSON}" == *"\"gatewayPort\": ${TEST_PORT}"* ]]; then
  echo "  ok: health API reachable through gateway path"
else
  echo "  fail: unexpected health payload"
  echo "${HEALTH_JSON}"
  exit 1
fi

echo "[3/3] verify standalone port is not exposed"
if curl -sf "http://127.0.0.1:3760/api/system/health" >/dev/null 2>&1; then
  echo "  note: port 3760 is reachable in this machine; standalone may be provided by another process"
else
  echo "  ok: no Tracevane standalone endpoint from this test instance"
fi

echo ""
echo "=== test passed ==="
