import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createState } from './state.mjs';
import { assertLocalOrigin, cookie, createSession, entraConfig, getSession, parseCookies, pkceChallenge, tokenHash, verifyAccountCredentials, verifyBasicAuth } from './security.mjs';
import { decryptDemoSecret, encryptDemoSecret, redact, secretInventory } from './secrets.mjs';

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentone-test-'));
  const state=createState(root,{});
  return {root,state,close(){state.db.close();fs.rmSync(root,{recursive:true,force:true});}};
}

test('session token is opaque, hashed at rest and resolved from HttpOnly cookie',()=>{
  const f=fixture();
  try{
    const user={id:'marcus',email:'marcus@purelink.de',name:'Marcus Wartenberg'};
    const token=createSession(f.state,user,'Platform Admin');
    assert.equal(f.state.db.prepare('SELECT token_hash FROM user_sessions').get().token_hash,tokenHash(token));
    assert.equal(f.state.db.prepare('SELECT token_hash FROM user_sessions').get().token_hash.includes(token),false);
    const header=cookie('a1_session',token);
    assert.match(header,/HttpOnly/); assert.match(header,/SameSite=Lax/);
    const session=getSession(f.state,{headers:{cookie:header}});
    assert.equal(session.email,user.email); assert.equal(session.role,'Platform Admin');
  }finally{f.close();}
});

test('PKCE, cookies and local origin protection enforce browser boundary',()=>{
  assert.notEqual(pkceChallenge('verifier'), 'verifier');
  assert.equal(parseCookies('a=1; b=two').b,'two');
  assert.doesNotThrow(()=>assertLocalOrigin({method:'POST',headers:{origin:'http://127.0.0.1:4173'}}));
  assert.doesNotThrow(()=>assertLocalOrigin({method:'POST',headers:{origin:'https://personal.example'}},['https://personal.example']));
  assert.throws(()=>assertLocalOrigin({method:'POST',headers:{origin:'https://evil.example'}}),/Origin nicht erlaubt/);
});

test('Entra configuration reports readiness without exposing credentials',()=>{
  const secret='entra-super-secret';
  const config=entraConfig({GRAPH_TENANT_ID:'tenant',GRAPH_CLIENT_ID:'client',GRAPH_CLIENT_SECRET:secret,GRAPH_REDIRECT_URI:'http://127.0.0.1:4173/api/auth/entra/callback'});
  assert.equal(config.enabled,true); assert.equal(JSON.stringify(config).includes(secret),false);
  assert.deepEqual(config.domains,['purelink.de','purelink.com']);
});

test('personal account credentials are verified without exposing their values',()=>{
  const env={AGENTONE_LOGIN_USER:'marcus',AGENTONE_LOGIN_PASSWORD:'a-strong-personal-password'};
  assert.equal(entraConfig(env).passwordEnabled,true);
  assert.equal(verifyAccountCredentials({username:'marcus',password:'a-strong-personal-password'},env),true);
  assert.equal(verifyAccountCredentials({username:'marcus',password:'wrong'},env),false);
  assert.equal(verifyAccountCredentials({username:'other',password:'a-strong-personal-password'},env),false);
  assert.equal(JSON.stringify(entraConfig(env)).includes(env.AGENTONE_LOGIN_PASSWORD),false);
});

test('secret inventory contains metadata only and vault encryption roundtrips',()=>{
  const value='a-very-sensitive-value'; const env={OPENAI_API_KEY:value,AGENTONE_DEMO_MASTER_KEY:'test-master-key'};
  const inventory=secretInventory(env);
  assert.equal(inventory.some(item=>item.name==='OPENAI_API_KEY'),true);
  assert.equal(JSON.stringify(inventory).includes(value),false);
  assert.ok(inventory.every(item=>item.valueVisible===false));
  const encrypted=encryptDemoSecret(value,env);
  assert.equal(JSON.stringify(encrypted).includes(value),false);
  assert.equal(decryptDemoSecret(encrypted,env),value);
  assert.equal(redact(`prefix ${value} suffix`,[value]),'prefix [REDACTED] suffix');
});

test('personal instance lifecycle persists quarantine and rebuild generation',()=>{
  const f=fixture();
  try{
    const until=new Date(Date.now()+30*86400000).toISOString();
    const quarantined=f.state.setInstance('marcus','QUARANTINED',{quarantineUntil:until});
    assert.equal(quarantined.quarantineUntil,until);
    const rebuilt=f.state.setInstance('marcus','ACTIVE',{incrementGeneration:true});
    assert.equal(rebuilt.generation,2); assert.equal(rebuilt.quarantineUntil,null);
    assert.ok(f.state.listEvents('marcus').every(event=>event.traceId&&event.workflowId));
  }finally{f.close();}
});

test('unauthenticated bootstrap boundary is represented by an absent session',()=>{
  const f=fixture();
  try{assert.equal(getSession(f.state,{headers:{}}),null);}finally{f.close();}
});

test('optional mobile basic authentication uses constant-time credential comparison',()=>{
  const env={AGENTONE_BASIC_AUTH_USER:'marcus',AGENTONE_BASIC_AUTH_PASSWORD:'strong-mobile-password'};
  const good=Buffer.from('marcus:strong-mobile-password').toString('base64');
  const bad=Buffer.from('marcus:wrong-password').toString('base64');
  assert.equal(verifyBasicAuth({headers:{authorization:`Basic ${good}`}},env),true);
  assert.equal(verifyBasicAuth({headers:{authorization:`Basic ${bad}`}},env),false);
  assert.equal(verifyBasicAuth({headers:{}},{}),true);
});
