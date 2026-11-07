import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';

import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('personal UI remains valid browser JavaScript', () => {
  assert.doesNotThrow(() => new Script(personalUiJs, { filename: 'personal-ui.browser.js' }));
});

test('Apple Health uses the persistent import-job API for XML and ZIP', () => {
  assert.match(personalUiJs, /xhr\.open\('POST','\/agentone\/health\/import-jobs'\)/);
  assert.match(personalUiJs, /fetch\('\/agentone\/health\/import-jobs'/);
  assert.match(personalUiJs, /method:'DELETE'/);
  assert.match(personalUiJs, /x-agentone-health-consent-id/);
  assert.match(personalUiJs, /x-agentone-health-file-name/);
  assert.match(personalUiJs, /xhr\.send\(file\)/);
  assert.match(personalUiJs, /\.endsWith\('\.xml'\)/);
  assert.match(personalUiJs, /\.endsWith\('\.zip'\)/);
  assert.match(personalUiJs, /512\*1024\*1024/);
  assert.doesNotMatch(personalUiJs, /WORKER ERFORDERLICH|Worker-Import|\/agentone\/health\/apple-import|32\*1024\*1024/);
  assert.match(personalUiJs, /data\.importJobsReady===true/);
  for (const state of ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']) {
    assert.match(personalUiJs, new RegExp("'" + state + "'"));
  }
});

test('upload progress, persistent polling and cancellation are visible', () => {
  assert.match(personalUiJs, /xhr\.upload\.addEventListener\('progress'/);
  assert.match(personalUiJs, /health-upload-progress/);
  assert.match(personalUiJs, /health-import-cancel-upload/);
  assert.match(personalUiJs, /health-import-jobs-refresh/);
  assert.match(personalUiJs, /setTimeout\(\(\)=>loadHealthImportJobs\(\{silent:true\}\),1500\)/);
  assert.match(personalUiJs, /loadHealthImportJobs\(\);\s*\n\s*\}\);/);
});

test('remote job data is rendered with DOM text APIs and a safe result projection', () => {
  const start = personalUiJs.indexOf('function renderHealthImportJobs');
  const end = personalUiJs.indexOf('function scheduleHealthImportPoll', start);
  assert.ok(start > 0 && end > start, 'health job renderer exists');
  const renderer = personalUiJs.slice(start, end);
  assert.match(renderer, /replaceChildren\(\)/);
  assert.match(renderer, /textContent=/);
  assert.doesNotMatch(renderer, /innerHTML/);
  assert.doesNotMatch(renderer, /token|secret|credential|rawData|sourcePayload/i);
  assert.match(renderer, /normalizedMetrics/);
  assert.match(renderer, /duplicatesRemoved/);
});

test('health import controls meet mobile touch target requirements', () => {
  assert.match(personalUiCss, /\.health-import-card button\{min-height:44px\}/);
  assert.match(personalUiCss, /@media\(max-width:680px\)[\s\S]*?\.health-import-actions button\{width:100%;min-height:48px\}/);
  assert.match(personalUiCss, /\.health-import-job button\{width:100%;min-height:48px\}/);
});

test('job credentials remain headers and never become URL query parameters', () => {
  const start = personalUiJs.indexOf('function uploadHealthImportJob');
  const end = personalUiJs.indexOf("phaseCenter.addEventListener('submit'", start);
  assert.ok(start > 0 && end > start, 'upload function exists');
  const uploader = personalUiJs.slice(start, end);
  assert.match(uploader, /setRequestHeader\('x-agentone-health-consent-id'/);
  assert.doesNotMatch(uploader, /[?&](?:token|secret|consent|key)=/i);
});
