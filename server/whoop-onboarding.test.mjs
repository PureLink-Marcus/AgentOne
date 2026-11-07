import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWhoopOnboardingStart,
  normalizeWhoopOnboardingConfig,
  resolveWhoopRedirectUri,
  verifyWhoopOnboardingState,
  whoopOnboardingCapabilities,
  whoopOnboardingStatus,
  whoopOnboardingViewModel,
} from './whoop-onboarding.mjs';

const CONFIG = Object.freeze({
  WHOOP_CLIENT_ID: 'public-client-id',
  WHOOP_CLIENT_SECRET: 'test-client-secret-not-real',
  WHOOP_OAUTH_STATE_SECRET: 'test-state-secret-is-at-least-32-bytes-long',
  PUBLIC_ORIGIN: 'https://guenni.example.test',
});

function expectCode(code) {
  return (error) => {
    assert.equal(error?.code, code);
    return true;
  };
}

test('reports NOT_CONFIGURED without serializing credentials', () => {
  const config = normalizeWhoopOnboardingConfig({
    WHOOP_CLIENT_ID: 'public-client-id',
    WHOOP_CLIENT_SECRET: 'must-not-leak',
    WHOOP_OAUTH_STATE_SECRET: 'short',
    PUBLIC_ORIGIN: 'https://guenni.example.test',
  });
  const status = whoopOnboardingStatus({ config });
  const serialized = JSON.stringify({ config, status });

  assert.equal(status.status, 'NOT_CONFIGURED');
  assert.equal(status.configured, false);
  assert.match(status.missing.join(' '), /WHOOP_OAUTH_STATE_SECRET/);
  assert.equal(serialized.includes('must-not-leak'), false);
  assert.equal(serialized.includes('short'), false);
  assert.equal(serialized.includes('clientSecret'), false);
  assert.equal(serialized.includes('stateSecret'), false);
});

test('derives the exact HTTPS callback and rejects redirect confusion', () => {
  assert.equal(
    resolveWhoopRedirectUri({ publicOrigin: 'https://guenni.example.test/some/path?ignored=1' }),
    'https://guenni.example.test/agentone/whoop/callback',
  );
  assert.equal(
    resolveWhoopRedirectUri({ explicitRedirectUri: 'https://guenni.example.test/agentone/whoop/callback' }),
    'https://guenni.example.test/agentone/whoop/callback',
  );
  assert.throws(
    () => resolveWhoopRedirectUri({ publicOrigin: 'http://guenni.example.test' }),
    expectCode('WHOOP_REDIRECT_INVALID'),
  );
  assert.throws(
    () => resolveWhoopRedirectUri({
      publicOrigin: 'https://guenni.example.test',
      explicitRedirectUri: 'https://attacker.example/agentone/whoop/callback',
    }),
    expectCode('WHOOP_REDIRECT_MISMATCH'),
  );
  assert.throws(
    () => resolveWhoopRedirectUri({ explicitRedirectUri: 'https://guenni.example.test/agentone/whoop/callback?next=evil' }),
    expectCode('WHOOP_REDIRECT_MISMATCH'),
  );
});

test('uses honest READY and LIVE states', () => {
  const config = normalizeWhoopOnboardingConfig(CONFIG);
  assert.equal(whoopOnboardingStatus({ config }).status, 'READY');
  assert.equal(whoopOnboardingStatus({
    config,
    connection: { authorizedAt: '2026-11-07T10:00:00.000Z', lastSync: { status: 'DEGRADED' } },
  }).status, 'READY');
  assert.equal(whoopOnboardingStatus({
    config,
    connection: { authorizedAt: '2026-11-07T10:00:00.000Z', lastSync: { status: 'LIVE' } },
  }).status, 'READY');
  const live = whoopOnboardingStatus({
    config,
    connection: {
      authorizedAt: '2026-11-07T10:00:00.000Z',
      lastSync: { status: 'LIVE', syncedAt: '2026-11-07T10:01:00.000Z' },
    },
  });
  assert.equal(live.status, 'LIVE');
  assert.equal(live.connected, true);
});

test('creates an authorization-code start with signed server-side state and no PKCE claim', () => {
  const config = normalizeWhoopOnboardingConfig(CONFIG);
  const start = createWhoopOnboardingStart({
    config,
    userId: 'user-private-42',
    now: new Date('2026-11-07T10:00:00.000Z'),
  });
  const url = new URL(start.authorizationUrl);
  const serialized = JSON.stringify(start);

  assert.equal(url.origin, 'https://api.prod.whoop.com');
  assert.equal(url.pathname, '/oauth/oauth2/auth');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'public-client-id');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://guenni.example.test/agentone/whoop/callback');
  assert.equal(url.searchParams.get('state'), start.state);
  assert.match(start.state, /^[A-Za-z0-9_-]{8,128}$/);
  assert.equal(url.searchParams.has('code_challenge'), false);
  assert.equal(start.oauth.pkceSupported, false);
  assert.ok(start.stateRecord);
  assert.equal(Object.keys(start).includes('stateRecord'), false);
  assert.equal(serialized.includes('user-private-42'), false);
  assert.equal(serialized.includes(CONFIG.WHOOP_CLIENT_SECRET), false);
  assert.equal(serialized.includes(CONFIG.WHOOP_OAUTH_STATE_SECRET), false);
});

test('verifies state once and blocks replay, tampering, wrong user and wrong redirect', () => {
  const config = normalizeWhoopOnboardingConfig(CONFIG);
  const now = new Date('2026-11-07T10:00:00.000Z');
  const start = createWhoopOnboardingStart({ config, userId: 'user-42', now });

  assert.throws(
    () => verifyWhoopOnboardingState({
      config,
      state: start.state,
      stateRecord: start.stateRecord,
      userId: 'user-42',
      now: new Date('2026-11-07T10:01:00.000Z'),
    }),
    expectCode('WHOOP_STATE_STORE_REQUIRED'),
  );

  assert.throws(
    () => verifyWhoopOnboardingState({
      config,
      state: `${start.state[0] === 'A' ? 'B' : 'A'}${start.state.slice(1)}`,
      stateRecord: start.stateRecord,
      userId: 'user-42',
      usedNonces: new Set(),
      now: new Date('2026-11-07T10:01:00.000Z'),
    }),
    expectCode('WHOOP_STATE_INVALID'),
  );

  assert.throws(
    () => verifyWhoopOnboardingState({
      config,
      state: start.state,
      stateRecord: start.stateRecord,
      userId: 'someone-else',
      usedNonces: new Set(),
      now: new Date('2026-11-07T10:01:00.000Z'),
    }),
    expectCode('WHOOP_STATE_USER_MISMATCH'),
  );

  assert.throws(
    () => verifyWhoopOnboardingState({
      config,
      state: start.state,
      stateRecord: start.stateRecord,
      userId: 'user-42',
      redirectUri: 'https://guenni.example.test/agentone/whoop/callback?wrong=1',
      usedNonces: new Set(),
      now: new Date('2026-11-07T10:01:00.000Z'),
    }),
    expectCode('WHOOP_REDIRECT_MISMATCH'),
  );

  const usedNonces = new Set();
  const verified = verifyWhoopOnboardingState({
    config,
    state: start.state,
    stateRecord: start.stateRecord,
    userId: 'user-42',
    usedNonces,
    now: new Date('2026-11-07T10:01:00.000Z'),
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.consumed, true);
  assert.equal(usedNonces.has(start.stateRecord.nonce), true);

  assert.throws(
    () => verifyWhoopOnboardingState({
      config,
      state: start.state,
      stateRecord: start.stateRecord,
      userId: 'user-42',
      usedNonces,
      now: new Date('2026-11-07T10:02:00.000Z'),
    }),
    expectCode('WHOOP_STATE_REPLAY'),
  );
});

test('rejects expired state and scopes outside the configured allowlist', () => {
  const config = normalizeWhoopOnboardingConfig({ ...CONFIG, scopes: ['offline', 'read:sleep'] });
  const start = createWhoopOnboardingStart({
    config,
    userId: 'user-42',
    now: new Date('2026-11-07T10:00:00.000Z'),
    ttlSeconds: 60,
  });
  assert.throws(
    () => verifyWhoopOnboardingState({
      config,
      state: start.state,
      stateRecord: start.stateRecord,
      userId: 'user-42',
      usedNonces: new Set(),
      now: new Date('2026-11-07T10:01:00.000Z'),
    }),
    expectCode('WHOOP_STATE_EXPIRED'),
  );
  assert.throws(
    () => createWhoopOnboardingStart({ config, userId: 'user-42', scopes: ['read:recovery'] }),
    expectCode('WHOOP_SCOPE_NOT_CONFIGURED'),
  );
  assert.throws(
    () => normalizeWhoopOnboardingConfig({ ...CONFIG, scopes: ['offline', 'write:anything'] }),
    expectCode('WHOOP_SCOPE_INVALID'),
  );
});

test('publishes scope and PKCE capabilities without pretending unsupported behavior exists', () => {
  assert.deepEqual(whoopOnboardingCapabilities.states, ['NOT_CONFIGURED', 'READY', 'LIVE']);
  assert.equal(whoopOnboardingCapabilities.pkceSupported, false);
  assert.match(whoopOnboardingCapabilities.pkceReason, /keinen PKCE/i);
  assert.ok(whoopOnboardingCapabilities.scopeCatalog.includes('read:body_measurement'));
});

test('exposes a safe public view model with deterministic CTA states', () => {
  const notConfigured = whoopOnboardingViewModel({
    config: { WHOOP_CLIENT_SECRET: 'secret-must-never-appear' },
  });
  assert.equal(notConfigured.status, 'NOT_CONFIGURED');
  assert.equal(notConfigured.cta.state, 'CONFIGURE');
  assert.ok(notConfigured.missingEnv.includes('WHOOP_CLIENT_ID'));
  assert.ok(notConfigured.missingEnv.includes('WHOOP_REDIRECT_URI'));
  assert.equal(JSON.stringify(notConfigured).includes('secret-must-never-appear'), false);

  const ready = whoopOnboardingViewModel({ config: CONFIG });
  assert.equal(ready.status, 'READY');
  assert.equal(ready.cta.state, 'CONNECT');
  assert.equal(ready.redirectUri, 'https://guenni.example.test/agentone/whoop/callback');
  assert.ok(ready.scopes.every((scope) => scope.access === 'read-only'));

  const live = whoopOnboardingViewModel({
    config: CONFIG,
    connection: {
      authorizedAt: '2026-11-07T10:00:00.000Z',
      lastSync: { status: 'LIVE', syncedAt: '2026-11-07T10:01:00.000Z' },
    },
  });
  assert.equal(live.status, 'LIVE');
  assert.equal(live.cta.state, 'OPEN');
  assert.equal(live.secretsExposed, false);
});
