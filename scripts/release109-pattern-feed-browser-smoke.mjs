import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const release='2026.11.07-109';
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
const waitFor=async url=>{for(let attempt=0;attempt<100;attempt+=1){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Server nicht bereit: ${url}`);};
const stop=async child=>{if(!child||child.exitCode!==null)return;child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,4_000))]);if(child.exitCode===null)child.kill('SIGKILL');};

const appPort=await freePort(),proxyPort=await freePort(),dataDir=await mkdtemp(path.join(os.tmpdir(),'agentone-release109-ui-'));
const token='release109-ui-internal-token-with-enough-length',origin=`http://127.0.0.1:${proxyPort}`,user='release109-user',password='release109-browser-password-with-enough-length',secret='release109-secret-must-not-reach-dom';
const app=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(appPort),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_INTERNAL_API_TOKEN:token,AGENTONE_SECRET_KEY:'release109-companion-pepper-with-enough-length',AGENTONE_HEALTH_MASTER_KEY:'release109-health-master-key-with-enough-length',AGENTONE_DEMO_MASTER_KEY:'',OPENAI_API_KEY:''},stdio:'ignore'});
let proxy,browser;
try{
  await waitFor(`http://127.0.0.1:${appPort}/api/health`);
  proxy=spawn(process.execPath,['server/basic-proxy.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(proxyPort),UPSTREAM_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_TOKEN:token,BASIC_AUTH_USER:user,BASIC_AUTH_PASSWORD:password,AUTHENTICATED_USER:user,AGENTONE_DISPLAY_NAME:'Günni',AGENTONE_INSTANCE_TYPE:'personal',AGENTONE_RELEASE:release,ACCESS_SESSION_SECRET:'release109-session-secret-with-enough-length',PUBLIC_ORIGIN:origin,OPENAI_API_KEY:''},stdio:'ignore'});
  await waitFor(`${origin}/proxy-health`);
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15_000);page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource: the server responded with a status of 503/.test(message.text()))errors.push(message.text());});
  await page.route('**/agentone/patterns?limit=20',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({schema:'agentone.personal-pattern-feed/v1',patterns:[{signalId:'cross.mail-calendar-pressure',domain:'planning',severity:'attention',title:'Wichtige Post trifft auf einen vollen Tag',summary:'2 wichtige Nachrichten treffen auf 4 geplante Stunden.',why:{ruleId:'cross.mail-calendar-pressure',window:'NÄCHSTE 24 STUNDEN',evidenceCount:4,sources:[{id:'mail',count:2},{id:'calendar',count:2}],confidencePercent:82},feedback:{value:'helpful',effect:'confirmed',createdAt:'2026-11-07T11:05:00.000Z'},state:'VISIBLE',firstSeenAt:'2026-11-07T10:00:00.000Z',lastSeenAt:'2026-11-07T11:00:00.000Z'}],policy:{aggregatedEvidence:true,providerIdsExposed:false,feedbackAffectsNextRun:true,readOnly:true,secretsExposed:false}})}));
  await page.goto(`${origin}/login`,{waitUntil:'domcontentloaded'});await page.getByLabel('Benutzername').fill(user);await page.getByLabel('Passwort').fill(password);await page.getByRole('button',{name:/Sicher anmelden/}).click();await page.waitForURL(`${origin}/`);await page.locator('[data-view="tasks"]').click();
  const center=page.locator('#personal-pattern-feed');await center.waitFor();await center.locator('.pattern-item').waitFor();const text=await center.innerText();assert.match(text,/Wichtige Post trifft auf einen vollen Tag/);assert.match(text,/WARUM · 4 Belege/);assert.match(text,/NÄCHSTE 24 STUNDEN/);assert.match(text,/Konfidenz 82 %/);assert.match(text,/MAIL · 2/);assert.match(text,/CALENDAR · 2/);assert.match(text,/FEEDBACK HELPFUL/);assert.equal(await page.evaluate(()=>window.__unsafe),undefined);assert.equal(await center.locator('script').count(),0);
  const realPayload=await page.evaluate(async()=>{const response=await fetch('/agentone/intelligence',{cache:'no-store'});return {status:response.status,text:await response.text()};});assert.equal(realPayload.status,200);for(const forbidden of ['externalId','occurredAt','sourceEventId',secret])assert.equal(realPayload.text.includes(forbidden),false,forbidden);
  const layout=await center.evaluate(root=>{const buttons=[...root.querySelectorAll('button')].filter(item=>getComputedStyle(item).display!=='none');return {width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,minTouchHeight:Math.min(...buttons.map(item=>Math.round(item.getBoundingClientRect().height)))};});assert.equal(layout.width,390);assert.equal(layout.scrollWidth,390,JSON.stringify(layout));assert.ok(layout.minTouchHeight>=48,JSON.stringify(layout));
  const screenshot=path.resolve('output/playwright/release109-pattern-feed-mobile.png');await mkdir(path.dirname(screenshot),{recursive:true});await center.screenshot({path:screenshot});assert.ok(!(await page.locator('body').innerText()).includes(secret));assert.deepEqual(errors,[]);
  process.stdout.write(JSON.stringify({ok:true,release,viewport:'390x844',patterns:1,evidenceAggregated:true,providerIdsExposed:false,feedbackVisible:true,noHorizontalOverflow:true,minTouchHeight:layout.minTouchHeight,consoleErrors:0,secretsExposed:false,screenshot})+'\n');
}finally{await browser?.close();await stop(proxy);await stop(app);await rm(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
