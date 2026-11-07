import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
const waitFor=async url=>{for(let i=0;i<80;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Demo-API wurde nicht bereit');};
const stop=async child=>{if(!child.killed)child.kill();await new Promise(resolve=>{const timer=setTimeout(resolve,1500);child.once('exit',()=>{clearTimeout(timer);resolve();});});};

test('Learning Lab HTTP lifecycle is persistent, user-isolated, exact-hash gated and read-only',async()=>{
  const port=await freePort(),origin=`http://127.0.0.1:${port}`,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'agentone-learning-api-')),token='learning-api-internal-token';
  const environment={...process.env,HOST:'127.0.0.1',PORT:String(port),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_BASIC_AUTH_USER:'',AGENTONE_BASIC_AUTH_PASSWORD:'',AGENTONE_INTERNAL_API_TOKEN:token,AGENTONE_SECRET_KEY:'learning-api-companion-pepper-with-enough-length',AGENTONE_HEALTH_MASTER_KEY:'learning-api-health-key-with-enough-length',AGENTONE_DEMO_MASTER_KEY:''};
  let child=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:environment,stdio:'ignore'});
  const headers=user=>({'x-agentone-internal-token':token,'x-agentone-user':user,'content-type':'application/json'}),request=(route,{user='guenni',method='GET',body,extra={}}={})=>fetch(origin+route,{method,headers:{...headers(user),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  try{
    await waitFor(`${origin}/api/health`);
    assert.equal((await fetch(`${origin}/api/internal/personal/skills`)).status,403);
    const empty=await request('/api/internal/personal/skills').then(response=>response.json());assert.deepEqual(empty.skills,[]);assert.equal(empty.policy.secretsExposed,false);
    assert.equal((await request('/api/internal/personal/skills',{method:'POST',body:{procedure:['shell.unrestricted']}})).status,400);
    const createdResponse=await request('/api/internal/personal/skills',{method:'POST',body:{}});assert.equal(createdResponse.status,201);const created=await createdResponse.json(),skill=created.skill;assert.equal(skill.status,'STAGED');assert.match(skill.contentHash,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(created).includes('procedure'),false);
    assert.deepEqual((await request('/api/internal/personal/skills',{user:'fressi'}).then(response=>response.json())).skills,[]);
    assert.equal((await request(`/api/internal/personal/skills/${skill.id}/evaluate`,{method:'POST',body:{report:{passed:true}}})).status,400);
    const tested=await request(`/api/internal/personal/skills/${skill.id}/evaluate`,{method:'POST',body:{}}).then(response=>response.json());assert.equal(tested.skill.status,'TESTED');assert.equal(tested.skill.test.passed,true);
    assert.equal((await request(`/api/internal/personal/skills/${skill.id}/approve`,{method:'POST',body:{contentHash:skill.contentHash}})).status,403);
    assert.equal((await request(`/api/internal/personal/skills/${skill.id}/approve`,{method:'POST',body:{contentHash:'0'.repeat(64)},extra:{'x-agentone-human-actor':'guenni','x-agentone-human-action':'skill-approve'}})).status,409);
    const approved=await request(`/api/internal/personal/skills/${skill.id}/approve`,{method:'POST',body:{contentHash:skill.contentHash},extra:{'x-agentone-human-actor':'guenni','x-agentone-human-action':'skill-approve'}}).then(response=>response.json());assert.equal(approved.skill.status,'APPROVED');
    assert.equal((await request(`/api/internal/personal/skills/${skill.id}/activate`,{method:'POST',body:{}})).status,403);
    const active=await request(`/api/internal/personal/skills/${skill.id}/activate`,{method:'POST',body:{},extra:{'x-agentone-human-actor':'guenni','x-agentone-human-action':'skill-activate'}}).then(response=>response.json());assert.equal(active.skill.status,'ACTIVE');assert.equal(active.skill.active,true);
    assert.equal((await request(`/api/internal/personal/skills/${skill.id}/execute`,{user:'fressi',method:'POST',body:{}})).status,404);
    const executedResponse=await request(`/api/internal/personal/skills/${skill.id}/execute`,{method:'POST',body:{}});assert.equal(executedResponse.status,200);const executed=await executedResponse.json();assert.equal(executed.execution.readOnly,true);assert.deepEqual(executed.execution.mutations,[]);assert.equal(executed.commandStream.run.status,'COMPLETED');assert.equal(executed.secretsExposed,false);
    const publicBeforeRestart=await request('/api/internal/personal/skills').then(response=>response.json());assert.equal(publicBeforeRestart.skills[0].status,'ACTIVE');assert.equal(publicBeforeRestart.skills[0].lastExecution.status,'COMPLETED');assert.equal(publicBeforeRestart.skills[0].rollbackAvailable,false);for(const forbidden of ['procedure','prompt','payload','client_secret','password='])assert.equal(JSON.stringify(publicBeforeRestart).toLowerCase().includes(forbidden),false,forbidden);
    await stop(child);child=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:environment,stdio:'ignore'});await waitFor(`${origin}/api/health`);
    const persisted=await request('/api/internal/personal/skills').then(response=>response.json());assert.equal(persisted.skills[0].status,'ACTIVE');assert.equal(persisted.skills[0].lastExecution.status,'COMPLETED');assert.equal(persisted.executions.length,1);
  }finally{await stop(child);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
