import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 115 puts calendar, mail attention and briefing on the personal start page',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/dayCockpit\.id='personal-day-cockpit'/);
  assert.match(personalUiJs,/mailInboxSpotlight\.after\(dayCockpit\)/);
  assert.match(personalUiJs,/fetch\('\/agentone\/calendar\/plan\?timeZone=Europe%2FBerlin'/);
  assert.match(personalUiJs,/fetch\('\/agentone\/mail\/messages\?limit=1'/);
  assert.match(personalUiJs,/fetch\('\/agentone\/routines\/runs\?limit=1'/);
  assert.match(personalUiJs,/runPersonalBriefing\(\{scroll:false\}\)/);
  assert.match(personalUiJs,/Tagesbriefing gerade erstellt/);
  assert.match(personalUiJs,/BRIEFING ERSTELLT/);
  assert.match(personalUiJs,/planningCenter\.scrollIntoView/);
});

test('Release 115 keeps provider values out of HTML and provides mobile controls',()=>{
  assert.match(personalUiJs,/title\.textContent=String\(item\.title/);
  assert.match(personalUiJs,/detail\.textContent=briefingSummary\(latest\)/);
  assert.doesNotMatch(personalUiJs,/dayCockpit\.innerHTML\s*=\s*(?:plan|mail|latest|item)/);
  assert.match(personalUiCss,/\.day-cockpit-actions button\{min-height:48px/);
  assert.match(personalUiCss,/@media\(max-width:680px\)\{\.personal-day-cockpit/);
});
