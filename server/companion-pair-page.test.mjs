import test from 'node:test';
import assert from 'node:assert/strict';
import { companionPairHtml,companionPairJs,companionPairManifest } from './companion-pair-page.mjs';

test('mobile companion page is installable, secret-free and escapes instance branding',()=>{
  const html=companionPairHtml({displayName:'Günni <script>alert(1)</script>',brandPrimary:'#7357d9',brandAccent:'#35d6c6',release:'2026.11.07-91'}),manifest=JSON.parse(companionPairManifest({displayName:'Günni',brandPrimary:'#7357d9',brandBackground:'#070b12'}));
  assert.match(html,/iPhone mit Günni &lt;script&gt;/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.match(html,/companion-app\.js\?v=2026\.11\.07-91/);
  assert.match(html,/HealthKit benötigt weiterhin die signierte native Companion-App/);
  assert.doesNotMatch(html,/a1d_[A-Za-z0-9_-]+/);
  assert.equal(manifest.start_url,'/iphone');
  assert.equal(manifest.display,'standalone');
});

test('mobile companion script uses fragment handoff and encrypted IndexedDB storage',()=>{
  assert.match(companionPairJs,/location\.hash/);
  assert.match(companionPairJs,/indexedDB/);
  assert.match(companionPairJs,/AES-GCM/);
  assert.match(companionPairJs,/crypto\.subtle\.generateKey/);
  assert.match(companionPairJs,/vaultPreflight/);
  assert.match(companionPairJs,/serviceWorker\.register/);
  assert.match(companionPairJs,/agentone\/companion\/confirm/);
  assert.match(companionPairJs,/agentone\/companion\/status/);
  assert.doesNotMatch(companionPairJs,/console\.(?:log|debug|info)/);
});
