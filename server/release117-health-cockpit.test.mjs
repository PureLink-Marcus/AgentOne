import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 117 puts real Apple Health and WHOOP state on the personal start page',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/healthCockpit\.id='personal-health-cockpit'/);
  assert.match(personalUiJs,/dayCockpit\.after\(healthCockpit\)/);
  assert.match(personalUiJs,/healthCockpitJson\('\/agentone\/health'\)/);
  assert.match(personalUiJs,/healthCockpitJson\('\/agentone\/health\/comparison\?/);
  assert.match(personalUiJs,/healthCockpitJson\('\/agentone\/health\/trends'\)/);
  assert.match(personalUiJs,/healthCockpitJson\('\/agentone\/whoop\/status'\)/);
  assert.match(personalUiJs,/Apple Health und WHOOP bleiben getrennte Quellen/);
  assert.match(personalUiJs,/keine Diagnose, Therapie- oder Behandlungsempfehlung/);
});

test('Release 117 renders provider data safely and supplies mobile setup controls',()=>{
  assert.match(personalUiJs,/title\.textContent=String\(item\.label/);
  assert.match(personalUiJs,/detail\.textContent=direction/);
  assert.doesNotMatch(personalUiJs,/healthCockpit\.innerHTML\s*=\s*(?:snapshot|payload|item)/);
  assert.match(personalUiJs,/openHealthCockpitDetail\('apple'\)/);
  assert.match(personalUiJs,/openHealthCockpitDetail\('whoop'\)/);
  assert.match(personalUiCss,/\.health-cockpit-actions button\{min-height:48px/);
  assert.match(personalUiCss,/@media\(max-width:680px\)\{\.personal-health-cockpit/);
});
