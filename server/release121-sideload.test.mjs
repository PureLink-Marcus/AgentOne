import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personalUiJs} from './personal-ui.mjs';

const read=relative=>readFileSync(new URL('../'+relative,import.meta.url),'utf8');

test('sideload workflow builds an unsigned device IPA and publishes a stable download',()=>{
  const workflow=read('.github/workflows/agentone-companion-ipa.yml');
  assert.match(workflow,/runs-on: macos-15/);
  assert.match(workflow,/xcodegen generate/);
  assert.match(workflow,/-sdk iphoneos/);
  assert.match(workflow,/CODE_SIGNING_ALLOWED=NO/);
  assert.match(workflow,/codesign --force --sign -/);
  assert.match(workflow,/codesign -d --entitlements -/);
  assert.match(workflow,/2> built-entitlements\.plist/);
  assert.match(workflow,/healthkit\.background-delivery/);
  assert.match(workflow,/Payload\/AgentOneCompanion\.app/);
  assert.match(workflow,/gh release (?:create|upload)/);
  assert.match(workflow,/AgentOne-Companion-unsigned\.ipa\.sha256/);
});

test('sideload guide keeps Apple credentials outside AgentOne and explains entitlement limits',()=>{
  const guide=read('docs/IPHONE-SIDELOAD.md'),entitlements=read('connector/apple-companion-native/AgentOneCompanion/AgentOneCompanion.entitlements');
  assert.match(guide,/AltStore/);
  assert.match(guide,/sieben\s+Tagen/i);
  assert.match(guide,/Apple-ID oder Apple-Passwort werden niemals in AgentOne eingegeben/);
  assert.match(guide,/Provisioning-Profil/);
  assert.match(entitlements,/com\.apple\.developer\.healthkit/);
  assert.match(entitlements,/com\.apple\.developer\.healthkit\.background-delivery/);
  assert.match(personalUiJs,/IPA für AltStore \/ SideStore/);
  assert.match(personalUiJs,/AgentOne-Companion-unsigned\.ipa/);
});
