import test from 'node:test';
import assert from 'node:assert/strict';
import { companionBaseUrl, companionQrSvg } from './companion-qr.mjs';

test('companion QR contains only the normalized HTTPS base URL', async () => {
  const origin = 'https://guenni.mwart.solutions/untrusted/path?token=never#code';
  const result = await companionQrSvg(origin);
  assert.equal(result.payload, 'https://guenni.mwart.solutions/iphone');
  assert.match(result.svg, /^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(result.svg, /token=|never|#code|pair|secret/i);
});

test('companion base URL permits HTTP only for exact loopback hosts', () => {
  assert.equal(companionBaseUrl('http://127.0.0.1:4173/?pair=123456'), 'http://127.0.0.1:4173/iphone');
  assert.equal(companionBaseUrl('http://localhost:8080/path'), 'http://localhost:8080/iphone');
  assert.equal(companionBaseUrl('http://[::1]:9090/path'), 'http://[::1]:9090/iphone');
  for (const value of ['http://guenni.example.test', 'http://localhost.example.test', 'ftp://localhost', 'https://user:pass@example.test']) {
    assert.throws(() => companionBaseUrl(value), { code: 'COMPANION_QR_ORIGIN_INVALID' });
  }
});
