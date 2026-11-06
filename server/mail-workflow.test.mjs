import test from 'node:test';
import assert from 'node:assert/strict';
import { approveMailRule, approveReplyDraft, buildMailBriefing, createMailRule, createReplyDraft } from './mail-workflow.mjs';

test('mail rule needs hash-bound approval before mutation',()=>{const rule=createMailRule({accountId:'a',category:'newsletters',action:'move',target:'Newsletter'});assert.equal(rule.mutationsAllowed,false);assert.throws(()=>approveMailRule({...rule,target:'Spam'},rule.hash));const approved=approveMailRule(rule,rule.hash);assert.equal(approved.mutationsAllowed,true);});
test('reply draft cannot send before unchanged approval',()=>{const draft=createReplyDraft({accountId:'a',to:'max@example.org',subject:'Hallo',text:'Antwort'});assert.equal(draft.sendAllowed,false);assert.throws(()=>approveReplyDraft({...draft,text:'geändert'},draft.hash));assert.equal(approveReplyDraft(draft,draft.hash).sendAllowed,true);});
test('briefing never performs automatic actions',()=>{const briefing=buildMailBriefing({people:[{subject:'Hallo'}],transactions:[{subject:'Rechnung'}],newsletters:[1,2],spam:[1]});assert.equal(briefing.requiresAction.length,2);assert.deepEqual(briefing.automaticActions,[]);});
