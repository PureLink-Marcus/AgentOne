import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();server.close(()=>resolve(address.port));});});
async function waitFor(url){for(let attempt=0;attempt<80;attempt+=1){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Routine API did not start');}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2_000))]);if(child.exitCode===null)child.kill('SIGKILL');}
async function request(origin,pathName,{method='GET',user='guenni',body}={}){const response=await fetch(origin+pathName,{method,headers:{'x-agentone-internal-token':'routine-api-internal-token','x-agentone-user':user,accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}

test('routine API executes a real privacy-minimized briefing and persists its inbox lifecycle',async()=>{
  const port=await freePort(),origin=`http://127.0.0.1:${port}`,dataDir=mkdtempSync(path.join(os.tmpdir(),'agentone-routine-api-')),child=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_INTERNAL_API_TOKEN:'routine-api-internal-token',AGENTONE_SECRET_KEY:'routine-api-companion-pepper-with-enough-length',AGENTONE_HEALTH_MASTER_KEY:'routine-api-health-master-key-with-enough-length',AGENTONE_DEMO_MASTER_KEY:'',OPENAI_API_KEY:''},stdio:'ignore'});
  try{
    await waitFor(origin+'/api/health');
    const created=await request(origin,'/api/internal/personal/routines',{method:'POST',body:{title:'Mein Morgenbriefing',action:'morning-briefing',scheduleTime:'07:30',days:[1,2,3,4,5],timezone:'Europe/Berlin'}});assert.equal(created.status,201);const id=created.data.routine.id;
    const simulated=await request(origin,`/api/internal/personal/routines/${id}/simulate`,{method:'POST',body:{}});assert.equal(simulated.status,200);assert.deepEqual(simulated.data.simulation.mutations,[]);
    const activated=await request(origin,`/api/internal/personal/routines/${id}/state`,{method:'PUT',body:{state:'ACTIVE',simulationHash:simulated.data.simulation.hash}});assert.equal(activated.status,200);
    const executed=await request(origin,`/api/internal/personal/routines/${id}/run`,{method:'POST',body:{}});assert.equal(executed.status,200);assert.equal(executed.data.run.status,'COMPLETED');assert.equal(executed.data.run.source,'MANUAL');assert.equal(executed.data.run.result.mode,'READ_ONLY');assert.equal(typeof executed.data.run.result.summary,'object');assert.equal(executed.data.run.result.policy.secretsExposed,false);assert.equal(executed.data.commandStream.run.status,'COMPLETED');
    const serialized=JSON.stringify(executed.data);assert.doesNotMatch(serialized,/password|access_token|routine-api-health-master-key/i);
    const inbox=await request(origin,'/api/internal/personal/routines/runs?limit=20');assert.equal(inbox.status,200);assert.equal(inbox.data.runs.length,1);assert.equal(inbox.data.runs[0].id,executed.data.run.id);assert.equal(inbox.data.runs[0].inboxState,'NEW');assert.equal(inbox.data.policy.userBound,true);
    const isolated=await request(origin,'/api/internal/personal/routines/runs?limit=20',{user:'fressi'});assert.equal(isolated.status,200);assert.deepEqual(isolated.data.runs,[]);
    const read=await request(origin,`/api/internal/personal/routines/runs/${executed.data.run.id}/state`,{method:'PUT',body:{state:'READ'}});assert.equal(read.status,200);assert.equal(read.data.run.inboxState,'READ');
    const foreign=await request(origin,`/api/internal/personal/routines/runs/${executed.data.run.id}/state`,{method:'PUT',user:'fressi',body:{state:'READ'}});assert.equal(foreign.status,404);assert.equal(foreign.data.secretsExposed,false);
    const invalid=await request(origin,'/api/internal/personal/routines/runs?limit=101');assert.equal(invalid.status,400);
  }finally{await stop(child);rmSync(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
