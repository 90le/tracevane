import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createStandaloneStudioConfig } from '../../dist/apps/api/config.js';
import {
  isStudioGatewayHttpAuthorized,
  syncStudioGatewayHttpAuthCookie,
} from '../../dist/apps/api/gateway-http-auth.js';

function createConfigWithGatewayAuth(auth) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-gateway-http-auth-'));
  const openclawConfigFile = path.join(root, 'openclaw.json');
  fs.writeFileSync(openclawConfigFile, JSON.stringify({ gateway: { auth } }, null, 2));
  return createStandaloneStudioConfig({
    openclawRoot: root,
    openclawConfigFile,
  });
}

function createConfigWithOpenClawConfig(openclawConfig) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-gateway-http-auth-'));
  const openclawConfigFile = path.join(root, 'openclaw.json');
  fs.writeFileSync(openclawConfigFile, JSON.stringify(openclawConfig, null, 2));
  return {
    config: createStandaloneStudioConfig({
      openclawRoot: root,
      openclawConfigFile,
    }),
    root,
  };
}

function createRequest(url, authorization, cookie) {
  return {
    method: 'GET',
    url,
    headers: {
      host: '127.0.0.1:31879',
      ...(authorization ? { authorization } : {}),
      ...(cookie ? { cookie } : {}),
    },
    socket: {},
  };
}

function createResponseRecorder() {
  const headers = new Map();
  return {
    getHeader(name) {
      return headers.get(name);
    },
    setHeader(name, value) {
      headers.set(name, value);
    },
  };
}

test('gateway HTTP auth accepts Bearer secret from Authorization header', () => {
  const config = createConfigWithGatewayAuth({ mode: 'token', token: 'secret-token' });
  assert.equal(
    isStudioGatewayHttpAuthorized(config, createRequest('/studio/', 'Bearer secret-token')),
    true,
  );
});

test('gateway HTTP auth accepts query token for first-page browser navigation', () => {
  const config = createConfigWithGatewayAuth({ mode: 'token', token: 'secret-token' });
  assert.equal(
    isStudioGatewayHttpAuthorized(config, createRequest('/studio/chat/workbench?token=secret-token')),
    true,
  );
});

test('gateway HTTP auth rejects missing or wrong shared secrets when gateway auth is enabled', () => {
  const config = createConfigWithGatewayAuth({ mode: 'token', token: 'secret-token' });
  assert.equal(isStudioGatewayHttpAuthorized(config, createRequest('/studio/')), false);
  assert.equal(
    isStudioGatewayHttpAuthorized(config, createRequest('/studio/?token=wrong-token')),
    false,
  );
});

test('gateway HTTP auth accepts persisted auth cookie for later top-level reloads', () => {
  const config = createConfigWithGatewayAuth({ mode: 'token', token: 'secret-token' });
  assert.equal(
    isStudioGatewayHttpAuthorized(config, createRequest('/studio/chat/s/agent:main', undefined, 'openclaw_studio_gateway_auth=secret-token')),
    true,
  );
});

test('gateway HTTP auth sync stores an HttpOnly cookie after a valid token navigation', () => {
  const config = createConfigWithGatewayAuth({ mode: 'token', token: 'secret-token' });
  const req = createRequest('/studio/chat/workbench?token=secret-token');
  const res = createResponseRecorder();
  syncStudioGatewayHttpAuthCookie(config, req, res);
  const cookie = res.getHeader('Set-Cookie');
  assert.equal(typeof cookie, 'string');
  assert.match(cookie, /openclaw_studio_gateway_auth=secret-token/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\/studio/);
});

test('gateway HTTP auth allows static asset requests without a token so nested routes can bootstrap', () => {
  const config = createConfigWithGatewayAuth({ mode: 'token', token: 'secret-token' });
  assert.equal(
    isStudioGatewayHttpAuthorized(config, createRequest('/studio/assets/index.js')),
    true,
  );
});

test('gateway HTTP auth resolves env SecretRef tokens', () => {
  const oldToken = process.env.STUDIO_TEST_GATEWAY_HTTP_TOKEN;
  process.env.STUDIO_TEST_GATEWAY_HTTP_TOKEN = 'secretref-token';
  try {
    const config = createConfigWithGatewayAuth({
      mode: 'token',
      token: {
        source: 'env',
        provider: 'default',
        id: 'STUDIO_TEST_GATEWAY_HTTP_TOKEN',
      },
    });
    assert.equal(
      isStudioGatewayHttpAuthorized(config, createRequest('/studio/', 'Bearer secretref-token')),
      true,
    );
  } finally {
    if (oldToken == null) delete process.env.STUDIO_TEST_GATEWAY_HTTP_TOKEN;
    else process.env.STUDIO_TEST_GATEWAY_HTTP_TOKEN = oldToken;
  }
});

test('gateway HTTP auth rejects unresolved configured SecretRefs', () => {
  const oldToken = process.env.STUDIO_TEST_MISSING_GATEWAY_HTTP_TOKEN;
  delete process.env.STUDIO_TEST_MISSING_GATEWAY_HTTP_TOKEN;
  try {
    const config = createConfigWithGatewayAuth({
      mode: 'token',
      token: {
        source: 'env',
        provider: 'default',
        id: 'STUDIO_TEST_MISSING_GATEWAY_HTTP_TOKEN',
      },
    });
    assert.equal(isStudioGatewayHttpAuthorized(config, createRequest('/studio/')), false);
    assert.equal(
      isStudioGatewayHttpAuthorized(config, createRequest('/studio/', 'Bearer anything')),
      false,
    );
  } finally {
    if (oldToken == null) delete process.env.STUDIO_TEST_MISSING_GATEWAY_HTTP_TOKEN;
    else process.env.STUDIO_TEST_MISSING_GATEWAY_HTTP_TOKEN = oldToken;
  }
});

test('gateway HTTP auth resolves file SecretRef tokens', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-gateway-http-auth-file-secretref-'));
  const secretFile = path.join(root, 'secrets.json');
  fs.writeFileSync(secretFile, JSON.stringify({ gatewayAuthToken: 'file-secret-token' }, null, 2));
  const { config } = createConfigWithOpenClawConfig({
    secrets: {
      providers: {
        'studio-local': {
          source: 'file',
          path: secretFile,
          mode: 'json',
        },
      },
    },
    gateway: {
      auth: {
        mode: 'token',
        token: {
          source: 'file',
          provider: 'studio-local',
          id: '/gatewayAuthToken',
        },
      },
    },
  });

  assert.equal(
    isStudioGatewayHttpAuthorized(config, createRequest('/studio/', 'Bearer file-secret-token')),
    true,
  );
});

test('gateway HTTP auth resolves env SecretRefs from the OpenClaw env file', () => {
  const oldToken = process.env.STUDIO_TEST_GATEWAY_HTTP_ENV_FILE_TOKEN;
  delete process.env.STUDIO_TEST_GATEWAY_HTTP_ENV_FILE_TOKEN;
  try {
    const { config, root } = createConfigWithOpenClawConfig({
      gateway: {
        auth: {
          mode: 'token',
          token: {
            source: 'env',
            provider: 'default',
            id: 'STUDIO_TEST_GATEWAY_HTTP_ENV_FILE_TOKEN',
          },
        },
      },
    });
    fs.writeFileSync(path.join(root, '.env'), 'STUDIO_TEST_GATEWAY_HTTP_ENV_FILE_TOKEN=http-env-file-token\n');

    assert.equal(
      isStudioGatewayHttpAuthorized(config, createRequest('/studio/', 'Bearer http-env-file-token')),
      true,
    );
  } finally {
    if (oldToken == null) delete process.env.STUDIO_TEST_GATEWAY_HTTP_ENV_FILE_TOKEN;
    else process.env.STUDIO_TEST_GATEWAY_HTTP_ENV_FILE_TOKEN = oldToken;
  }
});
