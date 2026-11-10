import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personalUiCss,personalUiJs} from './personal-ui.mjs';

test('release 119 exposes honest live onboarding and native background scopes',()=>{
  const source=personalUiJs;
  assert.match(personalUiCss,/onboarding-center/);
  assert.match(source,/LIVE-EINRICHTUNG/);
  assert.match(source,/PROVIDER_APP_REQUIRED/);
  assert.match(source,/NATIVE_APP_REQUIRED/);
  assert.match(source,/health\.background/);
  assert.match(source,/location\.timeline/);
  assert.match(source,/Google Maps Timeline/);
  assert.match(source,/Keine Google-Cloud-API/);
  assert.match(source,/Twitch Developer App registrieren/);
});

test('native iOS source requests HealthKit background delivery and significant locations',()=>{
  const project=readFileSync(new URL('../connector/apple-companion-native/project.yml',import.meta.url),'utf8');
  const entitlements=readFileSync(new URL('../connector/apple-companion-native/AgentOneCompanion/AgentOneCompanion.entitlements',import.meta.url),'utf8');
  const health=readFileSync(new URL('../connector/apple-companion-native/AgentOneCompanion/HealthSyncManager.swift',import.meta.url),'utf8');
  const location=readFileSync(new URL('../connector/apple-companion-native/AgentOneCompanion/LocationSyncManager.swift',import.meta.url),'utf8');
  const api=readFileSync(new URL('../connector/apple-companion-native/AgentOneCompanion/AgentOneAPI.swift',import.meta.url),'utf8');
  assert.match(project,/iOS/);
  assert.match(entitlements,/com\.apple\.developer\.healthkit/);
  assert.match(health,/enableBackgroundDelivery/);
  assert.match(health,/HKObserverQuery/);
  assert.match(location,/startMonitoringSignificantLocationChanges/);
  assert.match(location,/requestAlwaysAuthorization/);
  assert.match(api,/X-AgentOne-Device-Token/);
  assert.doesNotMatch([project,entitlements,health,location,api].join('\n'),/(sk-[A-Za-z0-9]{20,}|client_secret\s*[:=]\s*["'][^"']+)/i);
});
