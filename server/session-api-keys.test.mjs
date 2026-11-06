import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionCredential,verifySessionCredential} from './session-api-keys.mjs';

test('session login key and api key are paired while only the hash is persisted',()=>{
  const credential=createSessionCredential();
  assert.match(credential.loginKey,/^a1l_/);assert.match(credential.apiKey,/^a1k_/);
  assert.equal(credential.apiKeyHash.includes(credential.apiKey),false);
  const record={loginKey:credential.loginKey,salt:credential.salt,apiKeyHash:credential.apiKeyHash,revokedAt:null};
  assert.equal(verifySessionCredential(record,credential.loginKey,credential.apiKey),true);
  assert.equal(verifySessionCredential(record,credential.loginKey,'wrong'),false);
  assert.equal(verifySessionCredential({...record,revokedAt:new Date().toISOString()},credential.loginKey,credential.apiKey),false);
});
