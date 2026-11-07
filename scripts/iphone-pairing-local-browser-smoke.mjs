import { mkdtemp,rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
const waitFor=async url=>{for(let attempt=0;attempt<80;attempt+=1){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Server nicht bereit: '+url);};
const stop=async child=>{if(!child||child.exitCode!==null)return;child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,4_000))]);if(child.exitCode===null)child.kill('SIGKILL');};
const collect=child=>new Promise((resolve,reject)=>{let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.once('error',reject);child.once('exit',code=>resolve({code,stdout,stderr}));});

const appPort=await freePort(),proxyPort=await freePort(),dataDir=await mkdtemp(path.join(os.tmpdir(),'agentone-iphone-browser-')),internalToken='iphone-browser-internal-token-with-enough-length',origin='http://127.0.0.1:'+proxyPort,user='iphone-browser',password='iphone-browser-password-with-enough-length';
const app=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(appPort),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_BASIC_AUTH_USER:'',AGENTONE_BASIC_AUTH_PASSWORD:'',AGENTONE_INTERNAL_API_TOKEN:internalToken,AGENTONE_COMPANION_PEPPER:'iphone-browser-companion-pepper-with-at-least-32-bytes',AGENTONE_HEALTH_MASTER_KEY:'iphone-browser-health-master-key-with-enough-length'},stdio:'ignore'});
let proxy;
try{
  await waitFor('http://127.0.0.1:'+appPort+'/api/health');
  proxy=spawn(process.execPath,['server/basic-proxy.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(proxyPort),UPSTREAM_URL:'http://127.0.0.1:'+appPort,PERSONAL_API_URL:'http://127.0.0.1:'+appPort,PERSONAL_API_TOKEN:internalToken,BASIC_AUTH_USER:user,BASIC_AUTH_PASSWORD:password,AUTHENTICATED_USER:'iphone-browser@local',AGENTONE_DISPLAY_NAME:'Günni',AGENTONE_INSTANCE_TYPE:'personal',AGENTONE_RELEASE:'2026.11.07-106',ACCESS_SESSION_SECRET:'iphone-browser-session-secret-with-enough-length',PUBLIC_ORIGIN:origin,OPENAI_API_KEY:'',AGENTONE_GUENNI_ORIGIN:origin,AGENTONE_GUENNI_USER:user,AGENTONE_GUENNI_PASSWORD:password},stdio:'ignore'});
  await waitFor(origin+'/proxy-health');
  const smoke=spawn(process.execPath,['scripts/guenni-iphone-pairing-smoke.mjs'],{cwd:process.cwd(),env:{...process.env,AGENTONE_GUENNI_ORIGIN:origin,AGENTONE_GUENNI_USER:user,AGENTONE_GUENNI_PASSWORD:password},stdio:['ignore','pipe','pipe']}),result=await collect(smoke);
  if(result.code!==0)throw new Error('Lokaler iPhone-Chrome-Smoke fehlgeschlagen: '+(result.stderr||result.stdout).slice(-3000));
  if(!result.stdout.trim())throw new Error('Lokaler iPhone-Chrome-Smoke lieferte keinen Prüfbericht.');
  const report=JSON.parse(result.stdout);
  if(report.release!=='2026.11.07-106'||report.iphoneDiagnostics?.iosSafariPairing!==true||report.iphoneDiagnostics?.iosStandaloneRequired!==false||report.selfRevokeFailureRetainedToken!==true||report.consoleErrors!==0||report.secretsExposed!==false)throw new Error('Lokaler iPhone-Chrome-Smoke lieferte einen unvollständigen Prüfbericht.');
  process.stdout.write(JSON.stringify({...report,environment:'LOCAL_EPHEMERAL'},null,2)+'\n');
}finally{await stop(proxy);await stop(app);await rm(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
