import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 118 turns empty Health state into a real guided setup',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/healthSetup\.className='health-cockpit-setup'/);
  assert.match(personalUiJs,/data-health-step="vault"/);
  assert.match(personalUiJs,/data-health-step="iphone"/);
  assert.match(personalUiJs,/data-health-step="apple"/);
  assert.match(personalUiJs,/data-health-step="whoop"/);
  assert.match(personalUiJs,/data-health-step="analysis"/);
  assert.match(personalUiJs,/healthCockpitJson\('\/agentone\/companion'\)/);
  assert.match(personalUiJs,/Jetzt Apple-Export importieren/);
});

test('Release 118 keeps optional sources optional and routes every action to a real surface',()=>{
  assert.match(personalUiJs,/3 KERNSCHRITTE/);
  assert.match(personalUiJs,/2 OPTIONAL/);
  assert.match(personalUiJs,/healthIphone\.addEventListener\('click',openHealthCockpitIphone\)/);
  assert.match(personalUiJs,/phaseCenter\.querySelector\('\.health-import-card'\)/);
  assert.match(personalUiJs,/whoopCard\.scrollIntoView/);
  assert.match(personalUiCss,/\.health-cockpit-steps\{display:grid/);
  assert.match(personalUiCss,/@media\(max-width:460px\)\{\.health-cockpit-steps/);
});
