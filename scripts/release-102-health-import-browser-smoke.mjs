import assert from 'node:assert/strict';
import { open, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const RELEASE='2026.11.07-102';
const LARGE_COMMENT_BYTES=34*1024*1024;
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
const waitFor=async url=>{for(let attempt=0;attempt<160;attempt+=1){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Server nicht bereit: ${url}`);};
const stop=async child=>{if(!child||child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,4_000))]);if(child.exitCode===null)child.kill('SIGKILL');};

async function writeLargeAppleHealthXml(filePath){
  const now=new Date(),day=new Date(now.getTime()-2*86_400_000).toISOString().slice(0,10),previousDay=new Date(now.getTime()-3*86_400_000).toISOString().slice(0,10);
  const prefix=`<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="de_DE">\n<!--`;
  const suffix=`-->\n  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="AgentOne Release 102 Smoke" unit="count" creationDate="${day} 08:05:00 +0100" startDate="${day} 07:00:00 +0100" endDate="${day} 08:00:00 +0100" value="1234"/>\n  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="AgentOne Release 102 Smoke" value="HKCategoryValueSleepAnalysisAsleepDeep" creationDate="${day} 08:05:00 +0100" startDate="${previousDay} 23:30:00 +0100" endDate="${day} 00:30:00 +0100"/>\n</HealthData>`;
  const handle=await open(filePath,'wx',0o600),chunk=Buffer.alloc(1024*1024,0x41);
  try{
    await handle.write(Buffer.from(prefix,'utf8'));
    for(let written=0;written<LARGE_COMMENT_BYTES;written+=chunk.length)await handle.write(chunk);
    await handle.write(Buffer.from(suffix,'utf8'));
    await handle.sync();
  }finally{chunk.fill(0);await handle.close();}
  const details=await stat(filePath);
  assert.ok(details.size>32*1024*1024,`Fixture ist nicht groß genug: ${details.size}`);
  assert.ok(details.size<512*1024*1024,`Fixture ist zu groß: ${details.size}`);
  return {bytes:details.size,records:2};
}

function collectKeys(value,output=new Set()){
  if(Array.isArray(value)){for(const item of value)collectKeys(item,output);return output;}
  if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){output.add(key);collectKeys(item,output);}
  return output;
}

const appPort=await freePort(),proxyPort=await freePort(),dataDir=await mkdtemp(path.join(os.tmpdir(),'agentone-release102-health-'));
const fixturePath=path.join(dataDir,'agentone-release102-large-health.xml'),fixture=await writeLargeAppleHealthXml(fixturePath);
const internalToken='release102-browser-internal-token-with-enough-length',healthKey='release102-browser-health-master-key-with-enough-length',user='release102-health',password='release102-browser-password-with-enough-length',expectedUser='release102-health',origin=`http://127.0.0.1:${proxyPort}`;
const app=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(appPort),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_BASIC_AUTH_USER:'',AGENTONE_BASIC_AUTH_PASSWORD:'',AGENTONE_INTERNAL_API_TOKEN:internalToken,AGENTONE_SECRET_KEY:'release102-browser-companion-pepper-with-at-least-32-bytes',AGENTONE_HEALTH_MASTER_KEY:healthKey,AGENTONE_DEMO_MASTER_KEY:'',OPENAI_API_KEY:''},stdio:'ignore'});
let proxy,browser,page;const pageErrors=[],consoleErrors=[],failedResponses=[],requestUrls=[];
try{
  await waitFor(`http://127.0.0.1:${appPort}/api/health`);
  proxy=spawn(process.execPath,['server/basic-proxy.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(proxyPort),UPSTREAM_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_TOKEN:internalToken,BASIC_AUTH_USER:user,BASIC_AUTH_PASSWORD:password,AUTHENTICATED_USER:expectedUser,AGENTONE_DISPLAY_NAME:'Günni',AGENTONE_INSTANCE_TYPE:'personal',AGENTONE_RELEASE:RELEASE,ACCESS_SESSION_SECRET:'release102-browser-session-secret-with-enough-length',PUBLIC_ORIGIN:origin,OPENAI_API_KEY:''},stdio:'ignore'});
  await waitFor(`${origin}/proxy-health`);
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE'});page=await context.newPage();
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)failedResponses.push({status:response.status(),url:response.url()});});
  page.on('request',request=>requestUrls.push(request.url()));
  page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('DELETE_MY_HEALTH_DATA'):dialog.accept());

  await page.goto(`${origin}/login`,{waitUntil:'domcontentloaded'});
  await page.getByLabel('Benutzername').fill(user);
  await page.getByLabel('Passwort').fill(password);
  await page.getByRole('button',{name:/Sicher anmelden/}).click();
  await page.waitForURL(`${origin}/`);
  await page.locator('[data-view="tools"]').click();
  const form=page.locator('#health-import-form'),card=page.locator('.health-import-card');
  await form.waitFor();
  await page.waitForFunction(()=>document.querySelector('#health-import-form')?.dataset.encryptionReady==='true'&&!document.querySelector('#health-import-form button[type="submit"]')?.disabled);
  await form.locator('[name="health-scope"][value="activity"]').check();
  await form.locator('[name="health-scope"][value="sleep"]').check();
  await form.locator('#health-import-confirm').check();
  await form.locator('#apple-health-file').setInputFiles(fixturePath);

  const uploadResponsePromise=page.waitForResponse(response=>response.url().includes('/agentone/health/import-jobs')&&response.request().method()==='POST',{timeout:180_000});
  await form.getByRole('button',{name:'Importjob starten'}).click();
  await page.locator('#health-upload-progress:not([hidden])').waitFor({timeout:10_000});
  const uploadResponse=await uploadResponsePromise;
  assert.equal(uploadResponse.status(),202);
  await page.locator('.health-import-job').first().waitFor({timeout:20_000});
  await page.waitForFunction(()=>document.querySelector('#health-upload-meter')?.value===100,null,{timeout:20_000});
  assert.equal(await page.locator('#health-upload-meter').evaluate(element=>element.value),100);

  const beforeReload=await page.evaluate(async()=>{const response=await fetch('/agentone/health/import-jobs',{headers:{accept:'application/json'},cache:'no-store'});return{status:response.status,payload:await response.json()};});
  assert.equal(beforeReload.status,200);
  assert.equal(beforeReload.payload.secretsExposed,false);
  assert.ok(Array.isArray(beforeReload.payload.jobs)&&beforeReload.payload.jobs.length>0);
  const uploadedJob=beforeReload.payload.jobs[0],jobId=uploadedJob.id;
  assert.match(String(jobId||''),/^[A-Za-z0-9-]{8,}$/);
  assert.ok(['QUEUED','RUNNING','COMPLETED'].includes(uploadedJob.state),JSON.stringify(uploadedJob));
  const forbiddenKeys=[...collectKeys(beforeReload.payload)].filter(key=>/^(?:cipher|cipherPath|cipherIv|cipherTag|iv|tag|aad|path|userId|consentId|sourceHash|token|secret|credential)$/i.test(key));
  assert.deepEqual(forbiddenKeys,[]);
  const safeProjection=JSON.stringify(beforeReload.payload);
  for(const forbidden of [internalToken,healthKey,'1234','HKCategoryValueSleepAnalysisAsleepDeep'])assert.equal(safeProjection.includes(forbidden),false);

  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-view="tools"]').click();
  await card.waitFor();
  await page.waitForFunction(expected=>[...document.querySelectorAll('.health-import-job')].some(row=>row.textContent.includes(expected.slice(0,12))),jobId,{timeout:30_000});
  const completed=page.locator('.health-import-job[data-state="COMPLETED"]').first();
  await completed.waitFor({timeout:180_000});
  const completedText=await completed.innerText();
  assert.match(completedText,/COMPLETED/);
  assert.match(completedText,/2 Messwerte/);
  assert.match(completedText,/100 %/);

  const afterReload=await page.evaluate(async id=>{const response=await fetch('/agentone/health/import-jobs/'+encodeURIComponent(id),{headers:{accept:'application/json'},cache:'no-store'});return{status:response.status,payload:await response.json()};},jobId);
  assert.equal(afterReload.status,200);
  assert.equal(afterReload.payload.job.id,jobId);
  assert.equal(afterReload.payload.job.state,'COMPLETED');
  assert.equal(afterReload.payload.job.result.metrics,fixture.records);
  assert.equal(afterReload.payload.secretsExposed,false);
  assert.match(await page.locator('#health-import-status').innerText(),/LIVE|IMPORTJOB|IMPORTED|IMPORTIERT/i);

  const layout=await card.evaluate(root=>{const buttons=[...root.querySelectorAll('button')],rect=root.getBoundingClientRect();return{width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,left:Math.round(rect.left),right:Math.round(rect.right),minButtonHeight:Math.min(...buttons.filter(button=>!button.hidden).map(button=>button.getBoundingClientRect().height))};});
  assert.equal(layout.scrollWidth,layout.width,JSON.stringify(layout));
  assert.ok(layout.left>=0&&layout.right<=layout.width,JSON.stringify(layout));
  assert.ok(layout.minButtonHeight>=44,JSON.stringify(layout));
  const screenshot=path.resolve('output/playwright/release-102-health-import-mobile.png');
  await mkdir(path.dirname(screenshot),{recursive:true});
  await page.setViewportSize({width:390,height:1100});
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({path:screenshot});
  await page.setViewportSize({width:390,height:844});

  await form.getByRole('button',{name:'Health-Daten löschen'}).click();
  await page.locator('#health-import-status').filter({hasText:/GELÖSCHT/}).waitFor({timeout:30_000});
  const healthStatus=await page.evaluate(async()=>{const response=await fetch('/agentone/health',{headers:{accept:'application/json'},cache:'no-store'});return{status:response.status,payload:await response.json()};});
  assert.equal(healthStatus.status,200);
  assert.equal(healthStatus.payload.store.metrics,0);

  assert.ok(requestUrls.some(url=>url.includes('/agentone/health/import-jobs')));
  assert.equal(requestUrls.some(url=>/[?&](?:token|secret|key|consent)=/i.test(url)),false);
  assert.deepEqual(pageErrors,[]);
  const optional=/\/(?:agentone\/(?:home-assistant\/dashboard|local-models\/status)|api\/platform\/snapshot)$/;
  assert.deepEqual(failedResponses.filter(item=>!optional.test(new URL(item.url).pathname)),[]);
  assert.deepEqual(consoleErrors.filter(message=>!/Failed to load resource: the server responded with a status of 503/.test(message)),[]);
  process.stdout.write(JSON.stringify({ok:true,release:RELEASE,viewport:'390x844',fixtureBytes:fixture.bytes,jobState:'COMPLETED',metrics:fixture.records,reloadPersistence:true,cleanupMetrics:0,minButtonHeight:layout.minButtonHeight,secretsExposed:false,screenshot})+'\n');
}catch(error){
  let browserState=null;
  try{browserState=await page?.evaluate(()=>({path:location.pathname,healthStatus:document.querySelector('#health-import-status')?.textContent?.slice(0,180)||null,uploadVisible:!document.querySelector('#health-upload-progress')?.hidden,uploadPercent:Number(document.querySelector('#health-upload-meter')?.value||0),jobStates:[...document.querySelectorAll('.health-import-job')].map(row=>row.dataset.state)}));}catch{}
  process.stderr.write(JSON.stringify({browserSmokeError:String(error?.message||error).slice(0,300),browserState,pageErrors,consoleErrors:consoleErrors.slice(-5),failedResponses:failedResponses.slice(-8).map(item=>({status:item.status,path:new URL(item.url).pathname})),healthRequestPaths:requestUrls.filter(url=>url.includes('/agentone/health')).slice(-12).map(url=>new URL(url).pathname)})+'\n');
  throw error;
}finally{
  await browser?.close();
  await stop(proxy);
  await stop(app);
  await rm(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});
}
