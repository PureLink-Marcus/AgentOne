import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 106 briefing inbox renders a visible source freshness panel',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/function briefingFreshness\(/);
  assert.match(personalUiJs,/Datenstand der Briefing-Quellen/);
  assert.match(personalUiJs,/DATENSTAND · /);
  assert.match(personalUiJs,/STALE_FALLBACK:'LETZTER STAND'/);
  assert.match(personalUiJs,/NOT_CONNECTED:'NICHT VERBUNDEN'/);
  assert.match(personalUiJs,/briefingFreshnessAge/);
});

test('Release 106 source freshness uses safe DOM text and routes to the matching area',()=>{
  const start=personalUiJs.indexOf('function briefingFreshness(result)');
  const end=personalUiJs.indexOf('function briefingReason',start);
  assert.ok(start>0&&end>start,'freshness renderer must exist');
  const renderer=personalUiJs.slice(start,end);
  assert.match(renderer,/title\.textContent=/);
  assert.match(renderer,/detail\.textContent=/);
  assert.match(renderer,/briefingRoute/);
  assert.doesNotMatch(renderer,/\.innerHTML\s*=|insertAdjacentHTML|document\.write/);
});

test('Release 106 freshness controls remain readable and touchable at 390px',()=>{
  assert.match(personalUiCss,/\.briefing-inbox-freshness\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(personalUiCss,/\.briefing-freshness-source\{min-height:56px/);
  assert.match(personalUiCss,/@media\(max-width:680px\).*\.briefing-inbox-freshness,\.briefing-inbox-insights\{grid-template-columns:1fr\}/s);
  assert.match(personalUiCss,/overflow-wrap:anywhere/);
});
