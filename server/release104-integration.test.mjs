import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { personalUiJs } from './personal-ui.mjs';

const demo=fs.readFileSync(new URL('./demo-server.mjs',import.meta.url),'utf8');

test('Release 104 wires exact on-demand mail insight through API and visible UI',()=>{
  assert.match(demo,/\/api\/internal\/personal\/mail\/insight/);
  assert.match(demo,/getPersonalMailMessage\(postgres,\{userId,accountId,uid,uidValidity\}\)/);
  assert.match(demo,/fetchSingleImapInsightContent/);
  assert.match(demo,/bodyStored:false/);
  assert.match(personalUiJs,/\/agentone\/mail\/insight/);
  assert.match(personalUiJs,/Einmalig lokal analysieren/);
  assert.match(personalUiJs,/Body verworfen/);
  assert.doesNotMatch(personalUiJs,/mail-insight[^\n]{0,300}innerHTML\s*=\s*data/i);
});

test('Release 104 exposes stratified health trends without medical claims',()=>{
  assert.match(demo,/\/api\/internal\/personal\/health\/trends/);
  assert.match(demo,/buildPersonalHealthTrends/);
  assert.match(demo,/saveDerivedHealthSignal/);
  assert.match(personalUiJs,/\/agentone\/health\/trends/);
  assert.match(personalUiJs,/7 Tage im Vergleich zu deiner Basis/);
  assert.match(personalUiJs,/keine Diagnose/);
});

test('Release 104 exposes human-gated Memory Review and clear Companion wording',()=>{
  for(const fragment of ['/memory/candidates','candidateHash','Memory Review','Hermes · Memory Governance'])assert.match(personalUiJs,new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
  assert.match(demo,/approveMemoryCandidate/);
  assert.match(demo,/actor:\{type:'human',id:userId\}/);
  assert.match(demo,/memory\.legacy-write\.staged/);
  assert.doesNotMatch(demo,/url\.pathname==='\/api\/internal\/personal\/memory'\)try\{return json\(res,201,\{entry:saveMemoryEntry/);
  assert.match(personalUiJs,/Companion · Web-App/);
  assert.match(personalUiJs,/Companion installieren oder koppeln/);
  assert.match(personalUiJs,/aktuell keinen Download/);
  assert.doesNotThrow(()=>new Function(personalUiJs));
});
