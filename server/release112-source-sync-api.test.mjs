import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();server.close(()=>resolve(address.port));});});
async function waitFor(url){for(let attempt=0;attempt<80;attempt+=1){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Source Sync API did not start');}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2_000))]);if(child.exitCode===null)child.kill('SIGKILL');}

test('Source Sync API separates side-effect-free status from explicit read-only refresh',async()=>{
  const port=await freePort(),origin=`http://127.0.0.1:${port}`,dataDir=mkdtempSync(path.join(os.tmpdir(),'agentone-source-sync-api-')),token='source-sync-internal-token',secret='source-sync-secret-must-not-leak';
  const child=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_INTERNAL_API_TOKEN:token,AGENTONE_SECRET_KEY:'source-sync-companion-pepper-with-enough-length',AGENTONE_HEALTH_MASTER_KEY:'source-sync-health-master-key-with-enough-length',OPENAI_API_KEY:'',TEST_SECRET:secret},stdio:'ignore'});
  const request=(route,{method='GET',user='guenni'}={})=>fetch(origin+route,{method,headers:{'x-agentone-internal-token':token,'x-agentone-user':user,accept:'application/json',...(method==='POST'?{'content-type':'application/json'}:{})},body:method==='POST'?'{}':undefined});
  try{
    await waitFor(origin+'/api/health');assert.equal((await fetch(origin+'/api/internal/personal/sources')).status,403);
    const statusResponse=await request('/api/internal/personal/sources');assert.equal(statusResponse.status,200);const status=await statusResponse.json();assert.equal(status.schema,'agentone.personal-source-status/v1');assert.equal(status.policy.sideEffectFree,true);assert.deepEqual(status.sources.map(item=>[item.source,item.status,item.outcome]),[['mail','NOT_CONNECTED','NOT_ATTEMPTED'],['ics','NOT_CONNECTED','NOT_ATTEMPTED'],['google','NOT_CONNECTED','NOT_ATTEMPTED']]);
    const refreshResponse=await request('/api/internal/personal/sources/refresh',{method:'POST'});assert.equal(refreshResponse.status,200);const refresh=await refreshResponse.json();assert.equal(refresh.schema,'agentone.personal-source-refresh/v1');assert.equal(refresh.policy.readOnly,true);assert.equal(refresh.policy.backoffRespected,true);assert.equal(refresh.commandStream.run.status,'COMPLETED');assert.deepEqual(refresh.commandStream.steps.map(item=>item.type),['OBSERVE','TOOL','RESULT']);assert.equal(refresh.commandStream.steps[1].operation,'source.refresh.manual');assert.ok(refresh.sources.every(item=>item.status==='NOT_CONNECTED'));
    const foreign=await request('/api/internal/personal/commands?limit=20',{user:'fressi'}).then(response=>response.json());assert.equal(foreign.runs.some(item=>item.id===refresh.commandStream.run.id),false);
    const serialized=JSON.stringify({status,refresh});assert.doesNotMatch(serialized,/source-sync-secret|source-sync-internal-token|password|accessToken|refreshToken/i);
  }finally{await stop(child);rmSync(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
