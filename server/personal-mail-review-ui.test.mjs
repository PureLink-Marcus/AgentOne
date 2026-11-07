import test from 'node:test';
import assert from 'node:assert/strict';

import { personalUiCss, personalUiJs } from './personal-ui.mjs';

test('mail review center remains valid browser JavaScript', () => {
  assert.doesNotThrow(() => new Function(personalUiJs));
});

test('mail review center exposes persisted filters, search and bounded paging', () => {
  assert.match(personalUiJs, /id="mail-review-search"/);
  for (const category of ['', 'people', 'newsletters', 'transactions', 'spam']) {
    assert.ok(personalUiJs.includes(`data-mail-category="${category}"`));
  }
  assert.match(personalUiJs, /\/agentone\/mail\/messages\?/);
  assert.match(personalUiJs, /new URLSearchParams\(\{threadKey/);
  assert.match(personalUiJs, /Math\.min\(200,mailReviewState\.limit\+50\)/);
});

test('mail review renders remote metadata with textContent only', () => {
  const start = personalUiJs.indexOf('function renderMailReviewThread');
  const end = personalUiJs.indexOf('function renderMailScan');
  assert.ok(start > 0 && end > start);
  const reviewCode = personalUiJs.slice(start, end);
  assert.match(reviewCode, /textContent/);
  assert.doesNotMatch(reviewCode, /innerHTML/);
  assert.match(personalUiJs, /classificationSignals/);
  assert.match(personalUiJs, /needsReview/);
  assert.match(reviewCode, /deduplicatedCount/);
  assert.match(reviewCode, /nextSyncAt/);
});

test('mail review controls meet the mobile touch target and retain snapshot fallback', () => {
  assert.match(personalUiCss, /\.mail-review-filters button\{[^}]*min-height:44px/);
  assert.match(personalUiCss, /\.mail-review-more\{[^}]*min-height:44px/);
  assert.match(personalUiJs, /letzter sicherer 50er-Snapshot bleibt sichtbar/);
  assert.match(personalUiJs, /Entwurf aus Mail-Metadaten vorbereitet/);
});
