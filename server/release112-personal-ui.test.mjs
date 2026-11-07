import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 112 exposes side-effect-free source status and explicit read-only synchronization',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/sourceSyncCenter\.id='personal-source-sync'/);
  assert.match(personalUiJs,/fetch\('\/agentone\/sources'/);
  assert.match(personalUiJs,/fetch\('\/agentone\/sources\/refresh'/);
  assert.match(personalUiJs,/method:'POST'/);
  assert.match(personalUiJs,/body:'\{\}'/);
  assert.match(personalUiJs,/renderCommandTimeline\(payload\.commandStream\)/);
  assert.match(personalUiJs,/Promise\.allSettled\(\[loadPersonalPatterns\(\),loadTodayPlanning\(\)\]\)/);
});

test('Release 112 renders only safe source projections and mobile touch targets',()=>{
  assert.match(personalUiJs,/\.textContent='LETZTER ERFOLG · '/);
  assert.match(personalUiJs,/\.textContent='ERGEBNIS · '/);
  assert.doesNotMatch(personalUiJs,/source-sync-card[^;]*\.innerHTML/);
  assert.match(personalUiCss,/\.source-sync-head button,.source-sync-card button\{min-height:44px/);
  assert.match(personalUiCss,/@media\(max-width:680px\).*\.source-sync-grid\{grid-template-columns:1fr\}/s);
  assert.match(personalUiCss,/\.source-sync-card button\{width:100%;min-height:48px\}/);
});
