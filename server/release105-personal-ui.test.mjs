import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 105 briefing inbox compiles and uses the scheduled-run API',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/Seit deinem letzten Besuch/);
  assert.match(personalUiJs,/\/agentone\/routines\/runs\?limit=20/);
  assert.match(personalUiJs,/\/agentone\/routines\/runs\/['"]\+encodeURIComponent\(id\)\+['"]\/state/);
  assert.match(personalUiJs,/\/agentone\/routines\/['"]\+encodeURIComponent\(id\)\+['"]\/run/);
  assert.match(personalUiJs,/Jetzt ausführen/);
  assert.match(personalUiJs,/12 Std\. später/);
});

test('Release 105 renders untrusted briefing results through textContent only',()=>{
  const start=personalUiJs.indexOf('function renderBriefingRuns');
  const end=personalUiJs.indexOf('async function setBriefingRunState',start);
  assert.ok(start>0&&end>start,'briefing renderer must exist');
  const renderer=personalUiJs.slice(start,end);
  assert.match(renderer,/title\.textContent=/);
  assert.match(renderer,/summary\.textContent=/);
  assert.match(renderer,/detail\.textContent=/);
  assert.doesNotMatch(renderer,/\.innerHTML\s*=/);
  assert.doesNotMatch(renderer,/insertAdjacentHTML|document\.write/);
});

test('Release 105 mobile controls stay touchable and wrap at 390px',()=>{
  assert.match(personalUiCss,/\.scheduled-briefing-inbox/);
  assert.match(personalUiCss,/\.briefing-inbox-actions button\{min-height:44px/);
  assert.match(personalUiCss,/@media\(max-width:680px\)[^{]*\{\.scheduled-briefing-inbox/);
  assert.match(personalUiCss,/\.briefing-inbox-actions\{display:grid;grid-template-columns:1fr 1fr\}/);
  assert.match(personalUiCss,/overflow-wrap:anywhere/);
});
