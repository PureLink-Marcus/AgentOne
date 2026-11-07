import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 109 renders an explainable persistent Pattern Feed with valid browser code',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/MUSTER · QUELLENÜBERGREIFEND · ERKLÄRBAR/);
  assert.match(personalUiJs,/agentone\/patterns\?limit=20/);
  assert.match(personalUiJs,/pattern\.why\?\.evidenceCount/);
  assert.match(personalUiJs,/pattern\.why\?\.confidencePercent/);
  assert.match(personalUiJs,/pattern\.why\?\.sources/);
  assert.match(personalUiJs,/ERSTMALS/);
  assert.match(personalUiJs,/ZULETZT/);
  assert.match(personalUiJs,/item\.addEventListener\('keydown'/);
});

test('Release 109 does not render raw evidence identifiers and uses safe DOM text',()=>{
  assert.doesNotMatch(personalUiJs,/signal\.evidence/);
  assert.doesNotMatch(personalUiJs,/pattern\.(?:externalId|occurredAt)/);
  assert.match(personalUiJs,/title\.textContent=pattern\.title/);
  assert.match(personalUiJs,/summary\.textContent=pattern\.summary/);
  assert.match(personalUiJs,/chip\.textContent=/);
  assert.match(personalUiJs,/meta\.textContent='WARUM/);
  assert.match(personalUiCss,/\.pattern-head-actions button\{min-height:48px/);
  assert.match(personalUiCss,/@media\(max-width:680px\).*\.pattern-list\{grid-template-columns:1fr\}/s);
  assert.match(personalUiCss,/\.pattern-head-actions button\{width:100%\}/);
});
