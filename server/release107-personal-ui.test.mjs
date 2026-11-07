import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 107 exposes an explicit PWA push lifecycle and keeps the browser script valid',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/PWA-HINWEISE · EXPLIZITES OPT-IN/);
  assert.match(personalUiJs,/Notification\.requestPermission\(\)/);
  assert.match(personalUiJs,/pushManager\.subscribe/);
  assert.match(personalUiJs,/userVisibleOnly:true/);
  assert.match(personalUiJs,/\/agentone\/push\/subscriptions/);
  assert.match(personalUiJs,/\/agentone\/push\/test/);
  assert.match(personalUiJs,/local\.unsubscribe\(\)/);
});

test('Release 107 preserves privacy, quiet-hour settings and exact external opt-in',()=>{
  assert.match(personalUiJs,/Sperrbildschirmtexte bleiben allgemein/);
  assert.match(personalUiJs,/channels:pwa\?\['in-app','pwa'\]:\['in-app'\]/);
  assert.match(personalUiJs,/Ruhezeit ['"]\+nudgeCenter/);
  assert.match(personalUiJs,/pwaChannelEnabled=Array\.isArray\(data\.settings\.channels\)/);
  assert.doesNotMatch(personalUiJs,/vapidPrivate|VAPID_PRIVATE|pushMaster/i);
});

test('Release 107 push controls are mobile-first and touchable',()=>{
  assert.match(personalUiCss,/\.push-optin-actions button\{min-height:44px/);
  assert.match(personalUiCss,/@media\(max-width:680px\)\{\.push-optin>header\{display:block\}/);
  assert.match(personalUiCss,/\.push-optin-actions button\{width:100%;min-height:48px\}/);
  assert.match(personalUiCss,/overflow-wrap:anywhere/);
});
