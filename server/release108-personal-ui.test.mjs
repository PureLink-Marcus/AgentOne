import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 108 exposes safe effect controls and keeps the browser script valid',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/Sichere Ausführungssteuerung/);
  assert.match(personalUiJs,/Read-only erneut ausführen/);
  assert.match(personalUiJs,/Ausführung abbrechen/);
  assert.match(personalUiJs,/\+action/);
  assert.match(personalUiJs,/method:'POST'/);
  assert.match(personalUiJs,/body:'\{\}'/);
  assert.match(personalUiJs,/meta\.textContent=parts\.join/);
});

test('Release 108 renders only public effect metadata and touchable mobile actions',()=>{
  assert.match(personalUiJs,/ATOMARER CLAIM/);
  assert.match(personalUiJs,/STABILE IDEMPOTENZ/);
  assert.match(personalUiJs,/effect\.canRetry===true/);
  assert.match(personalUiJs,/effect\.canCancel===true/);
  assert.doesNotMatch(personalUiJs,/claimToken|idempotencyKey|inputHash|resultHash/);
  assert.match(personalUiCss,/\.personal-effect-actions button\{min-height:48px/);
  assert.match(personalUiCss,/@media\(max-width:680px\)\{\.personal-effect-control\{grid-template-columns:1fr\}/);
  assert.match(personalUiCss,/\.personal-effect-actions button\{width:100%\}/);
});
