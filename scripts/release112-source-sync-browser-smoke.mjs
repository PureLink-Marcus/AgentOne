import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const release='2026.11.07-112';
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
const waitFor=async url=>{for(let attempt=0;attempt<100;attempt+=1){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Server nicht bereit: ${url}`);};
const stop=async child=>{if(!child||child.exitCode!==null)return;child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,4_000))]);if(child.exitCode===null)child.kill('SIGKILL');};
const source=(source,freshness,outcome,lastSuccessAt=null,errorCode=null)=>({source,connected:true,freshness,outcome,lastSuccessAt,errorCode});
const initial={schema:'agentone.personal-source-status/v1',sources:[source('mail','FRESH','CURRENT','2026-11-07T13:40:00.000Z'),source('google','DEGRADED','BACKOFF','2026-11-07T12:30:00.000Z','PROVIDER_BACKOFF'),source('ics','STALE_FALLBACK','STATIC_SNAPSHOT','2026-11-07T10:00:00.000Z')],policy:{sideEffectFree:true,secretsExposed:false}};
const refreshed={schema:'agentone.personal-source-refresh/v1',sources:[source('mail','FRESH','REFRESHED','2026-11-07T13:55:00.000Z'),source('google','STALE_FALLBACK','BACKOFF','2026-11-07T12:30:00.000Z','PROVIDER_BACKOFF'),source('ics','STALE_FALLBACK','STATIC_SNAPSHOT','2026-11-07T10:00:00.000Z')],policy:{readOnly:true,backoffRespected:true,lastValidSnapshotPreserved:true,secretsExposed:false},commandStream:{run:{id:'source-sync-browser-run',label:'Datenquellen synchronisieren',source:'personal.sources',status:'COMPLETED',createdAt:'2026-11-07T13:55:00.000Z',updatedAt:'2026-11-07T13:55:01.000Z'},steps:[{type:'OBSERVE',status:'COMPLETED',label:'Quellenstatus gelesen'},{type:'TOOL',status:'COMPLETED',label:'Read-only Synchronisierung'},{type:'RESULT',status:'COMPLETED',label:'Quellenstand aktualisiert'}]}};

const appPort=await freePort(),proxyPort=await freePort(),dataDir=await mkdtemp(path.join(os.tmpdir(),'agentone-release112-ui-'));
const token='release112-ui-internal-token-with-enough-length',origin=`http://127.0.0.1:${proxyPort}`,user='release112-user',password='release112-browser-password-with-enough-length',secret='release112-secret-must-not-reach-dom';
const app=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(appPort),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_INTERNAL_API_TOKEN:token,AGENTONE_SECRET_KEY:'release112-companion-pepper-with-enough-length',AGENTONE_HEALTH_MASTER_KEY:'release112-health-master-key-with-enough-length',AGENTONE_DEMO_MASTER_KEY:'',OPENAI_API_KEY:''},stdio:'ignore'});
let proxy,browser,postBody=null;
try{
  await waitFor(`http://127.0.0.1:${appPort}/api/health`);
  proxy=spawn(process.execPath,['server/basic-proxy.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(proxyPort),UPSTREAM_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_TOKEN:token,BASIC_AUTH_USER:user,BASIC_AUTH_PASSWORD:password,AUTHENTICATED_USER:user,AGENTONE_DISPLAY_NAME:'Günni',AGENTONE_INSTANCE_TYPE:'personal',AGENTONE_RELEASE:release,ACCESS_SESSION_SECRET:'release112-session-secret-with-enough-length',PUBLIC_ORIGIN:origin,OPENAI_API_KEY:''},stdio:'ignore'});
  await waitFor(`${origin}/proxy-health`);
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE',isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15_000);page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource: the server responded with a status of 503/.test(message.text()))errors.push(message.text());});
  await page.route('**/agentone/sources',route=>route.request().method()==='GET'?route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(initial)}):route.continue());
  await page.route('**/agentone/sources/refresh',async route=>{postBody=route.request().postData();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(refreshed)});});
  await page.goto(`${origin}/login`,{waitUntil:'domcontentloaded'});await page.getByLabel('Benutzername').fill(user);await page.getByLabel('Passwort').fill(password);await page.getByRole('button',{name:/Sicher anmelden/}).click();await page.waitForURL(`${origin}/`);await page.locator('[data-view="tasks"]').click();
  const center=page.locator('#personal-source-sync');await center.waitFor();await center.locator('#source-sync-overall').filter({hasText:'2 QUELLEN PRÜFEN'}).waitFor();
  assert.equal(await center.locator('[data-source-sync="mail"] .source-sync-state').innerText(),'AKTUELL');assert.equal(await center.locator('[data-source-sync="google"] .source-sync-state').innerText(),'EINGESCHRÄNKT');assert.equal(await center.locator('[data-source-sync="ics"] .source-sync-state').innerText(),'LETZTER STAND');
  await center.getByRole('button',{name:'Jetzt synchronisieren'}).click();await center.locator('[data-source-sync="mail"] [data-source-outcome]').filter({hasText:'SYNCHRONISIERT'}).waitFor();assert.equal(postBody,'{}');
  const timeline=page.locator('#personal-command-timeline');await timeline.filter({hasText:'Datenquellen synchronisieren'}).waitFor();
  const layout=await center.evaluate(root=>{const buttons=[...root.querySelectorAll('button')].filter(item=>getComputedStyle(item).display!=='none');return {width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,minTouchHeight:Math.min(...buttons.map(item=>Math.round(item.getBoundingClientRect().height))),buttonCount:buttons.length};});
  assert.equal(layout.width,390);assert.equal(layout.scrollWidth,390,JSON.stringify(layout));assert.ok(layout.minTouchHeight>=48,JSON.stringify(layout));
  const screenshot=path.resolve('output/playwright/release112-source-sync-mobile.png');await mkdir(path.dirname(screenshot),{recursive:true});await center.screenshot({path:screenshot});assert.ok(!(await page.locator('body').innerText()).includes(secret));assert.deepEqual(errors,[]);
  process.stdout.write(JSON.stringify({ok:true,release,viewport:'390x844',sourceStates:['FRESH','STALE_FALLBACK','BACKOFF'],explicitReadOnlyRefresh:true,postBody,commandStreamVisible:true,noHorizontalOverflow:true,minTouchHeight:layout.minTouchHeight,consoleErrors:0,secretsExposed:false,screenshot})+'\n');
}finally{await browser?.close();await stop(proxy);await stop(app);await rm(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
