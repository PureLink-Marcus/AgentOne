import test from 'node:test';
import assert from 'node:assert/strict';
import { mailConnectionOptions,mailErrorCode,normalizeMailPassword,publicMailError,publicMailFailure } from './mail-credentials.mjs';

test('gmail app passwords accept the grouped Google presentation',()=>{
  assert.equal(normalizeMailPassword('gmail','abcd efgh ijkl mnop'),'abcdefghijklmnop');
  assert.equal(normalizeMailPassword('1blu','pass word'),'pass word');
});

test('mail errors become actionable without exposing provider internals',()=>{
  const message=publicMailError(Object.assign(new Error('Command failed'),{responseText:'AUTHENTICATIONFAILED'}),'gmail');
  assert.match(message,/16-stelliges Google-App-Passwort/);
  assert.doesNotMatch(message,/AUTHENTICATIONFAILED|Command failed/);
  assert.match(publicMailError(new Error('ETIMEDOUT'),'custom'),/antwortet nicht rechtzeitig/);
  assert.equal(mailErrorCode(new Error('ETIMEDOUT')),'TIMEOUT');
  assert.deepEqual(publicMailFailure(Object.assign(new Error('Command failed'),{responseText:'AUTHENTICATIONFAILED'}),'gmail','imap'),{stage:'imap',code:'AUTH_REJECTED',error:message});
});

test('mail connection options enforce TLS and never enable sending',()=>{
  const account={username:'person@gmail.com',imap:{host:'imap.gmail.com',port:993,secure:true},smtp:{host:'smtp.gmail.com',port:465,secure:true}},password='abcdefghijklmnop',options=mailConnectionOptions(account,password);
  assert.deepEqual(options.imap.auth,{user:account.username,pass:password});
  assert.deepEqual(options.smtp.auth,{user:account.username,pass:password});
  assert.equal(options.imap.tls.minVersion,'TLSv1.2');
  assert.equal(options.imap.tls.rejectUnauthorized,true);
  assert.equal(options.smtp.requireTLS,true);
  assert.equal(options.smtp.connectionTimeout,15_000);
  assert.equal('send' in options.smtp,false);
});
