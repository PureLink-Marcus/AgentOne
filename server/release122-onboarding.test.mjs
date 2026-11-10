import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personalUiJs} from './personal-ui.mjs';

const read=relative=>readFileSync(new URL('../'+relative,import.meta.url),'utf8');

test('release 122 serves the Companion IPA and both onboarding guides inside AgentOne',()=>{
  const proxy=read('server/basic-proxy.mjs'),archive=read('scripts/build-release-archive.mjs');
  assert.match(proxy,/\/agentone\/downloads\/agentone-companion\.ipa/);
  assert.match(proxy,/\/agentone\/downloads\/iphone-sideload\.md/);
  assert.match(proxy,/\/agentone\/downloads\/openclaw-plugin-onboarding\.md/);
  assert.match(archive,/AgentOne-Companion-unsigned\.ipa/);
  assert.match(personalUiJs,/IPA direkt laden/);
  assert.match(personalUiJs,/SHA-256-Prüfsumme/);
  assert.match(personalUiJs,/Installationsanleitung/);
});

test('release 122 exposes an actionable owner-gated OpenClaw Plugin Center',()=>{
  const proxy=read('server/basic-proxy.mjs'),guide=read('docs/OPENCLAW-PLUGIN-ONBOARDING.md');
  assert.match(personalUiJs,/openclaw-plugin-center/);
  assert.match(personalUiJs,/Plugin-Katalog öffnen/);
  assert.match(personalUiJs,/Installiert verwalten/);
  assert.match(personalUiJs,/Aktivieren und Rechte prüfen/);
  assert.match(personalUiJs,/\/settings\/plugins\/.*agentone_native=1/);
  assert.match(proxy,/writesOwnedBy:'OpenClaw owner-only Control UI'/);
  assert.match(guide,/openclaw plugins install <paket>/);
  assert.match(guide,/--accept-capabilities/);
  assert.match(guide,/Secrets gehören ausschließlich/);
  assert.doesNotMatch(guide,/sk-[A-Za-z0-9]{20,}/);
});

