import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 110 makes persistent patterns directly filterable and teachable',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/data-pattern-filter="all"/);
  assert.match(personalUiJs,/data-pattern-filter="active"/);
  assert.match(personalUiJs,/data-pattern-filter="suppressed"/);
  assert.match(personalUiJs,/submitPatternFeedback/);
  assert.match(personalUiJs,/dataset\.patternFeedback=value/);
  for(const value of ['helpful','not_helpful','wrong','later','never'])assert.match(personalUiJs,new RegExp(`'${value}'`));
  assert.match(personalUiJs,/FEEDBACK GESPEICHERT/);
});

test('Release 110 keeps pattern actions explicit, safe and mobile touchable',()=>{
  assert.match(personalUiJs,/open\.textContent='Quelle öffnen'/);
  assert.doesNotMatch(personalUiJs,/item\.setAttribute\('role','button'\)/);
  assert.doesNotMatch(personalUiJs,/item\.innerHTML/);
  assert.match(personalUiJs,/body:JSON\.stringify\(\{nudgeId:signalId,value\}\)/);
  assert.match(personalUiCss,/\.pattern-actions button\{min-height:44px/);
  assert.match(personalUiCss,/@media\(max-width:680px\).*\.pattern-actions button\{min-height:48px\}/s);
  assert.match(personalUiCss,/@media\(max-width:680px\)\{\.pattern-filter button\{min-height:48px\}\}/);
  assert.match(personalUiCss,/\.pattern-actions \.primary\{grid-column:1\/-1\}/);
});
