import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp,rm } from 'node:fs/promises';
import { spawn,spawnSync } from 'node:child_process';

const root=path.resolve('.');
const npm=process.platform==='win32'?'npm.cmd':'npm';
const npmCli=process.env.npm_execpath;
const freePort=()=>new Promise((resolve,reject)=>{const listener=net.createServer();listener.once('error',reject);listener.listen(0,'127.0.0.1',()=>{const address=listener.address();listener.close(error=>error?reject(error):resolve(address.port));});});
const run=(args,env=process.env)=>{const command=npmCli?process.execPath:npm,commandArgs=npmCli?[npmCli,...args]:args,result=spawnSync(command,commandArgs,{cwd:root,env,stdio:'inherit',shell:!npmCli&&process.platform==='win32'});if(result.status!==0)throw new Error(`${npm} ${args.join(' ')} fehlgeschlagen (${result.status??result.error?.code??'kein Status'}).`);};
const waitFor=async(url,child)=>{for(let attempt=0;attempt<100;attempt+=1){if(child.exitCode!==null)throw new Error(`Lokaler Server endete vorzeitig (${child.exitCode}).`);try{if((await fetch(url,{signal:AbortSignal.timeout(1_000)})).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Lokaler Server wurde nicht bereit: ${url}`);};
const waitForExit=(child,timeoutMs)=>new Promise(resolve=>{if(child.exitCode!==null)return resolve(true);const done=()=>{clearTimeout(timer);resolve(true);},timer=setTimeout(()=>{child.off('exit',done);resolve(false);},timeoutMs);child.once('exit',done);});
const stop=async child=>{if(!child||child.exitCode!==null)return;child.kill();if(await waitForExit(child,5_000))return;child.kill('SIGKILL');if(!await waitForExit(child,5_000))throw new Error('Lokaler Server konnte nicht beendet werden.');};

const dataDir=await mkdtemp(path.join(os.tmpdir(),'agentone-verify-local-'));
const smokeCredentials={AGENTONE_LOGIN_USER:'local-smoke',AGENTONE_LOGIN_PASSWORD:'Local-Smoke-Verify-95!9x',COOKIE_SECURE:'false'};
let server;
try{
  run(['test']);
  run(['run','build']);
  const port=await freePort(),origin=`http://127.0.0.1:${port}`,serverEnv={...process.env,...smokeCredentials,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:origin,AGENTONE_PUBLIC_ORIGIN:origin,AGENTONE_DATA_DIR:dataDir,DATABASE_URL:''};
  server=spawn(process.execPath,['server/demo-server.mjs'],{cwd:root,env:serverEnv,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',chunk=>process.stdout.write(chunk));
  server.stderr.on('data',chunk=>process.stderr.write(chunk));
  await waitFor(`${origin}/api/health`,server);
  run(['run','smoke'],{...process.env,...smokeCredentials,AGENTONE_SMOKE_BASE:origin});
  process.stdout.write(`Lokale Verifikation vollständig: Tests, Build und Smoke auf ${origin}; Server wird beendet.\n`);
}finally{
  await stop(server);
  await rm(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});
}
