import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 113 puts the real release and source state visibly on every personal start layout',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/releaseSpotlight\.id='personal-release-spotlight'/);
  assert.match(personalUiJs,/command\.prepend\(releaseSpotlight\)/);
  assert.match(personalUiJs,/querySelector\('\[data-release-number\]'\)\.textContent=runningRelease/);
  assert.match(personalUiJs,/fetch\('\/agentone\/sources'/);
  assert.match(personalUiJs,/cache:'no-store'/);
  assert.match(personalUiJs,/data-release-open-sources/);
  assert.match(personalUiJs,/document\.querySelector\('#personal-source-sync'\)/);
  assert.match(personalUiJs,/data-release-force-update/);
  assert.match(personalUiJs,/refreshAgentOne\(\)/);
});

test('Release spotlight renders provider state safely and remains touchable on mobile',()=>{
  assert.match(personalUiJs,/sourceNode\.textContent=/);
  assert.match(personalUiJs,/mailNode\.textContent=/);
  assert.match(personalUiJs,/attentionNode\.textContent=/);
  assert.doesNotMatch(personalUiJs,/releaseSpotlight\.innerHTML\s*=\s*payload/);
  assert.doesNotMatch(personalUiJs,/(?:sourceNode|mailNode|attentionNode)\.innerHTML/);
  assert.match(personalUiCss,/\.release-spotlight-actions button\{min-height:48px/);
  assert.match(personalUiCss,/@media\(max-width:760px\)\{\.personal-release-spotlight\{grid-template-columns:1fr/);
  assert.match(personalUiCss,/@media\(max-width:390px\)\{\.release-spotlight-status\{grid-template-columns:1fr\}/);
});
