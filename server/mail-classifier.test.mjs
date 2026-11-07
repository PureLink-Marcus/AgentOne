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

test('classifier accepts Gmail API header arrays and marks unauthenticated people for review',()=>{
  const gmail=classifyMail({sender:'Max <max@example.org>',subject:'Kurze Frage',headers:[{name:'Authentication-Results',value:'mx; spf=pass; dkim=pass; dmarc=pass'}]});
  assert.equal(gmail.category,'people');assert.equal(gmail.needsReview,false);assert.ok(gmail.confidence>.8);
  const unverified=classifyMail({sender:'unknown@example.org',subject:'Hallo'});assert.equal(unverified.category,'people');assert.equal(unverified.needsReview,true);
});

test('failed authentication plus pressure language is held as spam review',()=>{
  const result=classifyMail({sender:'support@example.org',subject:'URGENT: Konto gesperrt - jetzt bestätigen',headers:[{name:'Authentication-Results',value:'mx; spf=fail; dkim=fail; dmarc=fail'}]});
  assert.equal(result.category,'spam');assert.equal(result.needsReview,true);assert.ok(result.signals.includes('authentication-failed'));
});
