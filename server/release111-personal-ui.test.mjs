import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 111 exposes a safe Focus Compass over server-authoritative patterns',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/id="pattern-focus-compass"/);
  assert.match(personalUiJs,/NÄCHSTE PRIORITÄT/);
  assert.match(personalUiJs,/renderPatternFocusCompass/);
  assert.match(personalUiJs,/priority=attention\[0\]\|\|active\[0\]\|\|null/);
  assert.match(personalUiJs,/open\.dataset\.patternDomain=priority\?\.domain\|\|''/);
  assert.match(personalUiJs,/pattern-focus-open/);
  assert.doesNotMatch(personalUiJs,/pattern-focus-main[^;]*innerHTML/);
});

test('Release 111 routes planning priorities to the real day plan and stays mobile touchable',()=>{
  assert.match(personalUiJs,/domain==='planning'.*#today-planning/s);
  assert.match(personalUiCss,/\.pattern-focus-open\{min-height:48px/);
  assert.match(personalUiCss,/@media\(max-width:760px\).*\.pattern-focus-open\{grid-column:1\/-1\}/s);
  assert.match(personalUiCss,/@media\(max-width:390px\).*\.pattern-focus-compass\{grid-template-columns:1fr 1fr\}/s);
});
