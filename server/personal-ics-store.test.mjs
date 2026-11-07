import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  getPersonalIcsFeedCredential,
  getPersonalIcsStatus,
  initPersonalIcsStore,
  listDuePersonalIcsFeedUsers,
  recordPersonalIcsFailure,
  removePersonalIcsState,
  savePersonalIcsFeedSuccess,
  savePersonalIcsUploadState,
} from './personal-ics-store.mjs';

function cryptoCallbacks() {
  const key = randomBytes(32);
  return {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        algorithm: 'AES-256-GCM',
      };
    },
    decrypt(envelope) {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}

function endpointHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function database() {
  const db = new DatabaseSync(':memory:');
  initPersonalIcsStore(db);
  return db;
}

test('initPersonalIcsStore migrates the existing calendar-state table in place', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE personal_ics_calendar_state(
      user_id TEXT PRIMARY KEY,status TEXT NOT NULL,event_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT,last_error_code TEXT,updated_at TEXT NOT NULL
    )`);
    db.prepare(`INSERT INTO personal_ics_calendar_state(
      user_id,status,event_count,imported_at,last_error_code,updated_at
    ) VALUES(?,?,?,?,?,?)`).run(
      'legacy-user', 'LIVE', 3, '2026-11-01T09:00:00.000Z', null, '2026-11-01T09:00:01.000Z',
    );

    assert.equal(initPersonalIcsStore(db), true);
    assert.equal(initPersonalIcsStore(db), true);
    assert.deepEqual(getPersonalIcsStatus(db, { userId: 'legacy-user' }), {
      sourceType: 'UPLOAD',
      endpointHash: null,
      eventCount: 3,
      importedAt: '2026-11-01T09:00:00.000Z',
      lastAttemptAt: '2026-11-01T09:00:01.000Z',
      lastSuccessAt: '2026-11-01T09:00:00.000Z',
      failureCount: 0,
      lastErrorCode: null,
      nextAttemptAt: null,
      feedConnected: false,
      status: 'LIVE',
    });
    const columns = new Set(db.prepare('PRAGMA table_info(personal_ics_calendar_state)').all().map((row) => row.name));
    for (const column of ['source_type', 'endpoint_hash', 'last_attempt_at', 'last_success_at',
      'failure_count', 'feed_ciphertext', 'feed_iv', 'feed_tag', 'feed_algorithm']) {
      assert.equal(columns.has(column), true, column);
    }
  } finally {
    db.close();
  }
});

test('feed credentials are AES-GCM-only, encrypted at rest, user-isolated and publicly redacted', () => {
  const db = database();
  const aliceCrypto = cryptoCallbacks();
  const bobCrypto = cryptoCallbacks();
  const aliceUrl = 'https://calendar.example.test/private.ics?token=alice-ultra-secret';
  const bobUrl = 'https://calendar.example.test/private.ics?token=bob-ultra-secret';
  try {
    savePersonalIcsFeedSuccess(db, {
      userId: 'alice',
      feedUrl: aliceUrl,
      endpointHash: endpointHash('alice-endpoint'),
      eventCount: 4,
      importedAt: '2026-11-02T10:00:00.000Z',
      nextAttemptAt: '2026-11-02T11:00:00.000Z',
      encrypt: aliceCrypto.encrypt,
    });
    savePersonalIcsFeedSuccess(db, {
      userId: 'bob',
      feedUrl: bobUrl,
      endpointHash: endpointHash('bob-endpoint'),
      eventCount: 2,
      importedAt: '2026-11-02T10:05:00.000Z',
      encrypt: bobCrypto.encrypt,
    });

    const rawRows = db.prepare('SELECT * FROM personal_ics_calendar_state ORDER BY user_id').all();
    const raw = JSON.stringify(rawRows);
    assert.equal(raw.includes(aliceUrl), false);
    assert.equal(raw.includes('alice-ultra-secret'), false);
    assert.equal(raw.includes(bobUrl), false);
    assert.equal(raw.includes('bob-ultra-secret'), false);
    assert.equal(rawRows[0].feed_algorithm, 'AES-256-GCM');
    assert.ok(rawRows[0].feed_ciphertext);
    assert.ok(rawRows[0].feed_iv);
    assert.ok(rawRows[0].feed_tag);

    let decryptedEnvelope;
    assert.equal(getPersonalIcsFeedCredential(db, {
      userId: 'alice',
      decrypt(envelope) {
        decryptedEnvelope = envelope;
        return aliceCrypto.decrypt(envelope);
      },
    }), aliceUrl);
    assert.deepEqual(Object.keys(decryptedEnvelope).sort(), ['algorithm', 'ciphertext', 'iv', 'tag']);
    assert.equal(getPersonalIcsFeedCredential(db, { userId: 'bob', decrypt: bobCrypto.decrypt }), bobUrl);
    assert.equal(getPersonalIcsFeedCredential(db, { userId: 'charlie', decrypt: aliceCrypto.decrypt }), null);
    assert.throws(
      () => getPersonalIcsFeedCredential(db, { userId: 'alice', decrypt: bobCrypto.decrypt }),
      { code: 'ICS_STORE_DECRYPT_FAILED' },
    );

    const publicAlice = getPersonalIcsStatus(db, { userId: 'alice' });
    assert.deepEqual(Object.keys(publicAlice), [
      'sourceType', 'endpointHash', 'eventCount', 'importedAt', 'lastAttemptAt',
      'lastSuccessAt', 'failureCount', 'lastErrorCode', 'nextAttemptAt', 'feedConnected', 'status',
    ]);
    assert.deepEqual(publicAlice, {
      sourceType: 'FEED',
      endpointHash: endpointHash('alice-endpoint'),
      eventCount: 4,
      importedAt: '2026-11-02T10:00:00.000Z',
      lastAttemptAt: '2026-11-02T10:00:00.000Z',
      lastSuccessAt: '2026-11-02T10:00:00.000Z',
      failureCount: 0,
      lastErrorCode: null,
      nextAttemptAt: '2026-11-02T11:00:00.000Z',
      feedConnected: true,
      status: 'LIVE',
    });
    const publicJson = JSON.stringify(publicAlice);
    assert.doesNotMatch(publicJson, /cipher|\biv\b|\btag\b|algorithm|url|secret/i);
  } finally {
    db.close();
  }
});

test('upload state clears every feed credential field', () => {
  const db = database();
  const crypto = cryptoCallbacks();
  try {
    savePersonalIcsFeedSuccess(db, {
      userId: 'alice',
      feedUrl: 'https://calendar.example.test/secret.ics?key=clear-me',
      endpointHash: endpointHash('feed'),
      eventCount: 9,
      importedAt: '2026-11-03T08:00:00.000Z',
      encrypt: crypto.encrypt,
    });
    const status = savePersonalIcsUploadState(db, {
      userId: 'alice',
      eventCount: 1,
      importedAt: '2026-11-03T09:00:00.000Z',
    });

    assert.equal(status.sourceType, 'UPLOAD');
    assert.equal(status.endpointHash, null);
    assert.equal(getPersonalIcsFeedCredential(db, { userId: 'alice', decrypt: crypto.decrypt }), null);
    const row = { ...db.prepare(`SELECT feed_ciphertext,feed_iv,feed_tag,feed_algorithm,endpoint_hash,next_attempt_at
      FROM personal_ics_calendar_state WHERE user_id=?`).get('alice') };
    assert.deepEqual(row, {
      feed_ciphertext: null,
      feed_iv: null,
      feed_tag: null,
      feed_algorithm: null,
      endpoint_hash: null,
      next_attempt_at: null,
    });
  } finally {
    db.close();
  }
});

test('failures preserve the last valid calendar and credential while degrading recoverable state', () => {
  const db = database();
  const crypto = cryptoCallbacks();
  const url = 'https://calendar.example.test/feed.ics?token=preserved';
  try {
    savePersonalIcsFeedSuccess(db, {
      userId: 'alice',
      feedUrl: url,
      endpointHash: endpointHash('preserved-feed'),
      eventCount: 0,
      importedAt: '2026-11-04T07:00:00.000Z',
      encrypt: crypto.encrypt,
    });
    const degraded = recordPersonalIcsFailure(db, {
      userId: 'alice',
      attemptedAt: '2026-11-04T08:00:00.000Z',
      errorCode: 'ICS_FETCH_FAILED',
      nextAttemptAt: '2026-11-04T08:10:00.000Z',
    });
    assert.deepEqual(degraded, {
      sourceType: 'FEED',
      endpointHash: endpointHash('preserved-feed'),
      eventCount: 0,
      importedAt: '2026-11-04T07:00:00.000Z',
      lastAttemptAt: '2026-11-04T08:00:00.000Z',
      lastSuccessAt: '2026-11-04T07:00:00.000Z',
      failureCount: 1,
      lastErrorCode: 'ICS_FETCH_FAILED',
      nextAttemptAt: '2026-11-04T08:10:00.000Z',
      feedConnected: true,
      status: 'DEGRADED',
    });
    assert.equal(getPersonalIcsFeedCredential(db, { userId: 'alice', decrypt: crypto.decrypt }), url);

    assert.equal(recordPersonalIcsFailure(db, {
      userId: 'alice',
      attemptedAt: '2026-11-04T08:05:00.000Z',
    }).failureCount, 2);
    assert.deepEqual(recordPersonalIcsFailure(db, {
      userId: 'new-user',
      attemptedAt: '2026-11-04T08:00:00.000Z',
    }), {
      sourceType: null,
      endpointHash: null,
      eventCount: 0,
      importedAt: null,
      lastAttemptAt: '2026-11-04T08:00:00.000Z',
      lastSuccessAt: null,
      failureCount: 1,
      lastErrorCode: 'ICS_SYNC_FAILED',
      nextAttemptAt: null,
      feedConnected: false,
      status: 'ERROR',
    });
  } finally {
    db.close();
  }
});

test('feed success composes with an outer transaction and due-user listing contains no credential', () => {
  const db = database();
  const crypto = cryptoCallbacks();
  try {
    db.exec('BEGIN IMMEDIATE');
    savePersonalIcsFeedSuccess(db, {
      userId: 'rolled-back-user',
      feedUrl: 'https://calendar.example.test/rolled-back.ics?secret=value',
      endpointHash: endpointHash('rolled-back'),
      eventCount: 1,
      importedAt: '2026-11-05T10:00:00.000Z',
      nextAttemptAt: '2026-11-05T11:00:00.000Z',
      encrypt: crypto.encrypt,
    });
    db.exec('ROLLBACK');
    assert.equal(getPersonalIcsStatus(db, { userId: 'rolled-back-user' }).status, 'NOT_CONNECTED');

    savePersonalIcsFeedSuccess(db, {
      userId: 'due-user',
      feedUrl: 'https://calendar.example.test/due.ics?secret=value',
      endpointHash: endpointHash('due'),
      eventCount: 1,
      importedAt: '2026-11-05T10:00:00.000Z',
      nextAttemptAt: '2026-11-05T11:00:00.000Z',
      encrypt: crypto.encrypt,
    });
    const due = listDuePersonalIcsFeedUsers(db, { asOf: '2026-11-05T11:00:00.000Z' });
    assert.deepEqual(due, [{
      userId: 'due-user',
      status: 'LIVE',
      lastAttemptAt: '2026-11-05T10:00:00.000Z',
      nextAttemptAt: '2026-11-05T11:00:00.000Z',
      failureCount: 0,
    }]);
    assert.doesNotMatch(JSON.stringify(due), /cipher|\biv\b|\btag\b|algorithm|url|secret/i);
  } finally {
    db.close();
  }
});

test('remove deletes the entire row and its credential', () => {
  const db = database();
  const crypto = cryptoCallbacks();
  try {
    savePersonalIcsFeedSuccess(db, {
      userId: 'alice',
      feedUrl: 'https://calendar.example.test/remove.ics?token=gone',
      endpointHash: endpointHash('remove'),
      eventCount: 1,
      importedAt: '2026-11-06T09:00:00.000Z',
      encrypt: crypto.encrypt,
    });
    assert.deepEqual(removePersonalIcsState(db, { userId: 'alice' }), { removed: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM personal_ics_calendar_state WHERE user_id=?').get('alice').count, 0);
    assert.equal(getPersonalIcsFeedCredential(db, { userId: 'alice', decrypt: crypto.decrypt }), null);
    assert.equal(getPersonalIcsStatus(db, { userId: 'alice' }).status, 'NOT_CONNECTED');
    assert.deepEqual(removePersonalIcsState(db, { userId: 'alice' }), { removed: false });
  } finally {
    db.close();
  }
});
