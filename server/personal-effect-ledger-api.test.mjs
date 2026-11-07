import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();server.close(()=>resolve(address.port));});});
async function waitFor(url){for(let attempt=0;attempt<80;attempt+=1){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Effect Ledger API did not start');}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2_000))]);if(child.exitCode===null)child.kill('SIGKILL');}

test('briefing API persists a safe effect ledger and denies completed retries without mutating the run',async()=>{
  const port=await freePort(),origin=`http://127.0.0.1:${port}`,dataDir=mkdtempSync(path.join(os.tmpdir(),'agentone-effect-api-')),token='effect-api-internal-token';
  const environment={...process.env,HOST:'127.0.0.1',PORT:String(port),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_INTERNAL_API_TOKEN:token,AGENTONE_SECRET_KEY:'effect-api-companion-pepper-with-enough-length',AGENTONE_HEALTH_MASTER_KEY:'effect-api-health-master-key-with-enough-length',AGENTONE_DEMO_MASTER_KEY:'',OPENAI_API_KEY:''};
  let child=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:environment,stdio:'ignore'});
  const request=(route,{method='GET',user='guenni',humanAction}={})=>fetch(origin+route,{method,headers:{'x-agentone-internal-token':token,'x-agentone-user':user,accept:'application/json',...(method==='POST'?{'content-type':'application/json'}:{}),...(humanAction?{'x-agentone-human-actor':user,'x-agentone-human-action':humanAction}:{})},body:method==='POST'?'{}':undefined});
  try{
    await waitFor(origin+'/api/health');
    assert.equal((await fetch(origin+'/api/internal/personal/commands')).status,403);
    const briefingResponse=await request('/api/internal/personal/commands/briefing',{method:'POST'});assert.equal(briefingResponse.status,200);const briefing=await briefingResponse.json(),runId=briefing.commandStream.run.id,effect=briefing.effect;
    assert.equal(briefing.schema,'agentone.personal-briefing-run/v2');assert.equal(briefing.commandStream.run.status,'COMPLETED');assert.equal(effect.state,'COMPLETED');assert.equal(effect.attempt,1);assert.equal(effect.canRetry,false);assert.equal(effect.canCancel,false);assert.equal(briefing.policy?.secretsExposed??briefing.secretsExposed,false);
    const list=await request('/api/internal/personal/commands?limit=20').then(response=>response.json());assert.equal(list.policy.atomicClaims,true);assert.equal(list.policy.stableIdempotency,true);assert.equal(list.effects[0].id,effect.id);assert.equal(list.effects[0].runId,runId);assert.equal(list.effects[0].state,'COMPLETED');
    const detailResponse=await request(`/api/internal/personal/commands/${runId}`);assert.equal(detailResponse.status,200);const detail=await detailResponse.json();assert.equal(detail.run.status,'COMPLETED');assert.equal(detail.effect.id,effect.id);assert.equal(detail.effect.state,'COMPLETED');
    const serialized=JSON.stringify({briefing,list,detail});for(const forbidden of ['idempotencyKey','idempotency_key','inputHash','input_hash','resultHash','result_hash','claimToken','claim_token','effect-api-health-master-key'])assert.equal(serialized.includes(forbidden),false,forbidden);
    const foreign=await request(`/api/internal/personal/commands/${runId}`,{user:'fressi'});assert.equal(foreign.status,404);
    const ungatedRetry=await request(`/api/internal/personal/commands/${runId}/retry`,{method:'POST'});assert.equal(ungatedRetry.status,403);
    const deniedRetry=await request(`/api/internal/personal/commands/${runId}/retry`,{method:'POST',humanAction:'command-retry'});assert.equal(deniedRetry.status,409);const denied=await deniedRetry.json();assert.equal(denied.error,'PERSONAL_EFFECT_RETRY_DENIED');assert.equal(denied.effect.state,'COMPLETED');assert.equal(denied.commandStream.run.status,'COMPLETED');
    const deniedCancel=await request(`/api/internal/personal/commands/${runId}/cancel`,{method:'POST',humanAction:'command-cancel'});assert.equal(deniedCancel.status,409);assert.equal((await deniedCancel.json()).commandStream.run.status,'COMPLETED');
    await stop(child);child=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:environment,stdio:'ignore'});await waitFor(origin+'/api/health');
    const persisted=await request(`/api/internal/personal/commands/${runId}`).then(response=>response.json());assert.equal(persisted.run.status,'COMPLETED');assert.equal(persisted.effect.id,effect.id);assert.equal(persisted.effect.state,'COMPLETED');assert.equal(persisted.effect.attempt,1);
  }finally{await stop(child);rmSync(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
