import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();server.close(()=>resolve(address.port));});});
async function waitFor(url){for(let attempt=0;attempt<80;attempt+=1){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Pattern Feed API did not start');}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2_000))]);if(child.exitCode===null)child.kill('SIGKILL');}

test('Pattern Feed API is internal, query-allowlisted, user-isolated and provider-id free',async()=>{
  const port=await freePort(),origin=`http://127.0.0.1:${port}`,dataDir=mkdtempSync(path.join(os.tmpdir(),'agentone-pattern-api-')),token='pattern-api-internal-token';
  const environment={...process.env,HOST:'127.0.0.1',PORT:String(port),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_INTERNAL_API_TOKEN:token,AGENTONE_SECRET_KEY:'pattern-api-companion-pepper-with-enough-length',AGENTONE_HEALTH_MASTER_KEY:'pattern-api-health-master-key-with-enough-length',AGENTONE_DEMO_MASTER_KEY:'',OPENAI_API_KEY:''};
  const child=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:environment,stdio:'ignore'});
  const request=(route,user='guenni')=>fetch(origin+route,{headers:{'x-agentone-internal-token':token,'x-agentone-user':user,accept:'application/json'}});
  try{
    await waitFor(origin+'/api/health');assert.equal((await fetch(origin+'/api/internal/personal/patterns')).status,403);assert.equal((await fetch(origin+'/api/internal/personal/patterns',{headers:{'x-agentone-internal-token':token}})).status,400);
    for(const route of ['/api/internal/personal/patterns?limit=0','/api/internal/personal/patterns?limit=51','/api/internal/personal/patterns?limit=1.5','/api/internal/personal/patterns?limit=2&limit=3','/api/internal/personal/patterns?user=other'])assert.equal((await request(route)).status,400,route);
    const response=await request('/api/internal/personal/patterns?limit=20');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/json/);const payload=await response.json();assert.equal(payload.schema,'agentone.personal-pattern-feed/v1');assert.deepEqual(payload.patterns,[]);assert.equal(payload.policy.aggregatedEvidence,true);assert.equal(payload.policy.providerIdsExposed,false);assert.equal(payload.policy.feedbackAffectsNextRun,true);assert.equal(payload.policy.readOnly,true);assert.equal(payload.policy.secretsExposed,false);
    const foreign=await request('/api/internal/personal/patterns?limit=20','fressi').then(item=>item.json());assert.deepEqual(foreign.patterns,[]);
    const serialized=JSON.stringify({payload,foreign});for(const forbidden of ['externalId','occurredAt','sourceEventId','pattern-api-health-master-key','pattern-api-internal-token'])assert.equal(serialized.includes(forbidden),false,forbidden);
  }finally{await stop(child);rmSync(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
