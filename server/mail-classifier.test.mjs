import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMail, emptyMailGroups } from './mail-classifier.mjs';

test('mail classifier identifies authenticated people',()=>{
  const result=classifyMail({sender:'max@example.org',subject:'Treffen am Samstag',headers:new Map([['authentication-results','mx; dkim=pass; dmarc=pass']])});
  assert.equal(result.category,'people');assert.ok(result.confidence>=.8);assert.ok(result.signals.includes('dmarc-pass'));
});

test('mail classifier identifies mailing lists and transactions',()=>{
  assert.equal(classifyMail({sender:'news@example.org',subject:'Wochenrückblick',headers:new Map([['list-id','Example News <news.example.org>']])}).category,'newsletters');
  assert.equal(classifyMail({sender:'shop@example.org',subject:'Rechnung zu deiner Bestellung'}).category,'transactions');
});

test('provider spam headers override ordinary subjects',()=>{
  const result=classifyMail({sender:'person@example.org',subject:'Hallo',headers:new Map([['x-spam-flag','YES']])});
  assert.equal(result.category,'spam');assert.equal(result.confidence,.98);assert.deepEqual(Object.keys(emptyMailGroups()),['people','newsletters','transactions','spam']);
});
