import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync,rmSync } from 'node:fs';
import { spawn } from 'node:child_process';

const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
async function waitFor(url){for(let attempt=0;attempt<60;attempt+=1){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Demo-Server wurde nicht bereit');}
async function stop(child){if(child.exitCode!==null)return;await new Promise(resolve=>{const timer=setTimeout(resolve,5000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill();});}

test('WHOOP status endpoint is authenticated, READY and secret-free',async()=>{const port=await freePort(),dataDir=mkdtempSync(path.join(os.tmpdir(),'agentone-whoop-status-')),origin=`http://127.0.0.1:${port}`,token='whoop-internal-token',secret='whoop-client-secret-must-never-leak',stateSecret='whoop-state-secret-at-least-thirty-two-bytes-long';const child=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_INTERNAL_API_TOKEN:token,WHOOP_CLIENT_ID:'client-id',WHOOP_CLIENT_SECRET:secret,WHOOP_OAUTH_STATE_SECRET:stateSecret,WHOOP_REDIRECT_URI:'https://guenni.example.test/agentone/whoop/callback'},stdio:'ignore'});try{await waitFor(`${origin}/api/health`);assert.equal((await fetch(`${origin}/api/internal/personal/whoop/status`)).status,403);const response=await fetch(`${origin}/api/internal/personal/whoop/status`,{headers:{'x-agentone-internal-token':token,'x-agentone-user':'guenni'}});assert.equal(response.status,200);const text=await response.text(),model=JSON.parse(text);assert.equal(model.status,'READY');assert.equal(model.connected,false);assert.equal(model.redirectUri,'https://guenni.example.test/agentone/whoop/callback');assert.equal(model.cta.routeAvailable,false);assert.equal(model.policy.oauthStartEnabled,false);assert.equal(model.scopes.some(scope=>scope.id==='read:sleep'&&scope.access==='read-only'),true);assert.equal(text.includes(secret),false);assert.equal(text.includes(stateSecret),false);assert.equal(model.secretsExposed,false);}finally{await stop(child);rmSync(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}});
