import test from 'node:test';
import assert from 'node:assert/strict';
import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Release 114 exposes a useful live mail inbox on the personal start page',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  assert.match(personalUiJs,/mailInboxSpotlight\.id='personal-mail-inbox'/);
  assert.match(personalUiJs,/releaseSpotlight\.after\(mailInboxSpotlight\)/);
  assert.match(personalUiJs,/fetch\('\/agentone\/mail\/messages\?limit=50'/);
  assert.match(personalUiJs,/data-mail-inbox-filter="unread"/);
  assert.match(personalUiJs,/data-mail-inbox-filter="people"/);
  assert.match(personalUiJs,/if\(filter==='people'\)query\.set\('category','people'\)/);
  assert.match(personalUiJs,/new URLSearchParams\(\{limit:'200'\}\)/);
  assert.match(personalUiJs,/data-mail-inbox-filter="review"/);
  assert.match(personalUiJs,/for\(const account of mailAccountCache\)await mailAction\(account\.id,'scan'\)/);
  assert.match(personalUiJs,/mailCenter\.querySelector\('#mail-review'\)/);
});

test('Release 114 renders provider mail data safely and stays mobile touchable',()=>{
  assert.match(personalUiJs,/subject\.textContent=item\.subject/);
  assert.match(personalUiJs,/meta\.textContent=mailReviewSender\(item\)/);
  assert.match(personalUiJs,/state\.textContent=/);
  assert.doesNotMatch(personalUiJs,/mailInboxSpotlight\.innerHTML\s*=\s*(?:data|item|summary)/);
  assert.match(personalUiCss,/\.mail-inbox-actions button\{min-height:48px/);
  assert.match(personalUiCss,/@media\(max-width:680px\)\{\.personal-mail-inbox/);
});
