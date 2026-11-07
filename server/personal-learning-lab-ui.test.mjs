import test from 'node:test';
import assert from 'node:assert/strict';

import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('Learning Lab remains valid browser JavaScript and visible on desktop and mobile', () => {
  assert.doesNotThrow(() => new Function(personalUiJs));
  assert.match(personalUiJs, /learningLab\.id='learning-lab'/);
  assert.match(personalUiJs, /Learning Lab/);
  assert.match(personalUiJs, /RELEASE 100 · JARVIS SKILLS/);
  assert.match(personalUiCss, /\.learning-lab button\{[^}]*min-height:44px/);
  assert.match(personalUiCss, /@media\(max-width:760px\)\{[^\n]*\.learning-skill-list\{grid-template-columns:1fr\}/);
  assert.match(personalUiCss, /\.learning-skill-actions button\{[^}]*min-height:48px/);
});

test('Learning Lab presents the complete governed lifecycle and safe attestations', () => {
  for (const state of ['DRAFT', 'TEST', 'APPROVED', 'ACTIVE', 'ROLLED_BACK']) {
    assert.ok(personalUiJs.includes(`'${state}'`));
  }
  assert.match(personalUiJs, /CONTENT HASH/);
  assert.match(personalUiJs, /TESTATTESTIERUNG/);
  assert.match(personalUiJs, /PROVENIENZ/);
  assert.match(personalUiJs, /LETZTE AUSFÜHRUNG/);

  const start = personalUiJs.indexOf('function renderLearningLabSkills');
  const end = personalUiJs.indexOf('async function runLearningSkillAction');
  assert.ok(start > 0 && end > start);
  const renderCode = personalUiJs.slice(start, end);
  assert.match(renderCode, /textContent/);
  assert.doesNotMatch(renderCode, /innerHTML/);
  assert.doesNotMatch(renderCode, /procedure|prompt|payload|secret|credential/i);
});

test('server null evaluation and last execution remain a valid draft view', () => {
  assert.match(personalUiJs, /raw\?\.evaluation&&typeof raw\.evaluation==='object'/);
  assert.match(personalUiJs, /raw\?\.lastExecution&&typeof raw\.lastExecution==='object'/);
  assert.doesNotThrow(() => new Function(personalUiJs));
});

test('execution result renders only minimized overview and at most twelve safe items', () => {
  assert.match(personalUiJs, /learningExecutionResult\.id='learning-execution-result'/);
  assert.match(personalUiJs, /GESAMT/);
  assert.match(personalUiJs, /HANDLUNGSBEDARF/);
  const start = personalUiJs.indexOf('function renderLearningExecutionResult');
  const end = personalUiJs.indexOf('function renderLearningLabSkills');
  assert.ok(start > 0 && end > start);
  const resultCode = personalUiJs.slice(start, end);
  assert.match(resultCode, /allItems\.slice\(0,12\)/);
  assert.match(resultCode, /overview\.total/);
  assert.match(resultCode, /overview\.needsAction/);
  assert.match(resultCode, /item\?\.source/);
  assert.match(resultCode, /item\?\.title/);
  assert.match(resultCode, /item\?\.urgency/);
  assert.match(resultCode, /textContent/);
  assert.doesNotMatch(resultCode, /innerHTML|procedure|prompt|payload|secret|credential/i);
  assert.match(personalUiCss, /@media\(max-width:760px\)\{\.learning-execution-items\{grid-template-columns:1fr\}\}/);
});

test('Learning Lab calls only the skill API and reloads authoritative state after actions', () => {
  const start = personalUiJs.indexOf("const learningLab=document.createElement('article')");
  const end = personalUiJs.indexOf("const whoopCard=document.createElement('article')");
  assert.ok(start > 0 && end > start);
  const labCode = personalUiJs.slice(start, end);
  const routes = labCode.match(/\/agentone\/[a-z/-]+/g) || [];
  assert.ok(routes.length >= 2);
  assert.ok(routes.every(route => route.startsWith('/agentone/skills')));
  assert.match(labCode, /fetch\('\/agentone\/skills'/);
  assert.match(labCode, /fetch\('\/agentone\/skills\/'\+encodeURIComponent\(skill\.id\)\+'\/'\+action/);
  assert.match(labCode, /allowedActions=\['evaluate','approve','activate','execute','rollback'\]/);
  assert.match(labCode, /method:'POST'/);
  assert.match(labCode, /await loadLearningLab\(\)/);
  assert.match(labCode, /rollbackTargetVersion=String\(raw\?\.rollbackTargetVersion/);
  assert.match(labCode, /rollbackAvailable:\(raw\?\.rollbackAvailable===true\|\|rollbackAction\.available===true\)&&Boolean\(rollbackTargetVersion\)/);
  assert.match(labCode, /skill\.state==='ACTIVE'&&skill\.rollbackAvailable&&Boolean\(skill\.contentHash\)/);
  assert.match(labCode, /Rollback · keine Vorversion/);
});

test('empty state provisions only the server-controlled briefing skill', () => {
  assert.match(personalUiJs, /provisionLearningSkillButton\.textContent='Briefing-Skill bereitstellen'/);
  assert.match(personalUiJs, /provisionLearningSkillButton\.hidden=skills\.length>0/);
  assert.match(personalUiJs, /provisionLearningSkillButton\.disabled=skills\.length>0/);
  const start = personalUiJs.indexOf('async function provisionLearningSkill');
  const end = personalUiJs.indexOf('async function loadLearningLab');
  assert.ok(start > 0 && end > start);
  const provisionCode = personalUiJs.slice(start, end);
  assert.match(provisionCode, /fetch\('\/agentone\/skills',\{method:'POST'/);
  assert.match(provisionCode, /body:'\{\}'/);
  assert.match(provisionCode, /await loadLearningLab\(\)/);
  assert.doesNotMatch(provisionCode, /template|contentHash|procedure|prompt|payload|secret/i);
});

test('approval, activation and rollback are human-bound with action-specific bodies', () => {
  const start = personalUiJs.indexOf('async function runLearningSkillAction');
  const end = personalUiJs.indexOf('async function provisionLearningSkill');
  assert.ok(start > 0 && end > start);
  const actionCode = personalUiJs.slice(start, end);
  assert.match(actionCode, /action==='approve'&&.*skill\.contentHash/);
  assert.match(actionCode, /action==='activate'&&.*serverseitigen Release Worker.*skill\.contentHash/);
  assert.match(actionCode, /action==='rollback'&&.*skill\.rollbackTargetVersion/);
  assert.match(actionCode, /const requestBody=action==='approve'\?\{contentHash:skill\.contentHash\}:action==='rollback'\?\{contentHash:skill\.contentHash,targetVersion:skill\.rollbackTargetVersion,reason:'Manueller Rollback im Learning Lab'\}:\{\}/);
  assert.match(actionCode, /body:JSON\.stringify\(requestBody\)/);
  assert.match(actionCode, /if\(action==='execute'\).*response\.json\(\).*renderLearningExecutionResult\(responseData\?\.execution\)/);
  assert.match(actionCode, /loadLearningLab\(\{preserveStatus:action==='execute'\}\)/);
  assert.doesNotMatch(actionCode, /shortLearningSkillHash\(skill\.contentHash\).*requestBody/);
});
