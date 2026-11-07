import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const release='2026.11.07-108';
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
const waitFor=async url=>{for(let attempt=0;attempt<100;attempt+=1){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Server nicht bereit: ${url}`);};
const stop=async child=>{if(!child||child.exitCode!==null)return;child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,4_000))]);if(child.exitCode===null)child.kill('SIGKILL');};

const appPort=await freePort(),proxyPort=await freePort(),dataDir=await mkdtemp(path.join(os.tmpdir(),'agentone-release108-ui-'));
const token='release108-ui-internal-token-with-enough-length',origin=`http://127.0.0.1:${proxyPort}`,user='release108-user',password='release108-browser-password-with-enough-length',secret='release108-secret-must-not-reach-dom';
const app=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(appPort),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_INTERNAL_API_TOKEN:token,AGENTONE_SECRET_KEY:'release108-companion-pepper-with-enough-length',AGENTONE_HEALTH_MASTER_KEY:'release108-health-master-key-with-enough-length',AGENTONE_DEMO_MASTER_KEY:'',OPENAI_API_KEY:''},stdio:'ignore'});
let proxy,browser;
try{
  await waitFor(`http://127.0.0.1:${appPort}/api/health`);
  proxy=spawn(process.execPath,['server/basic-proxy.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(proxyPort),UPSTREAM_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_TOKEN:token,BASIC_AUTH_USER:user,BASIC_AUTH_PASSWORD:password,AUTHENTICATED_USER:user,AGENTONE_DISPLAY_NAME:'Günni',AGENTONE_INSTANCE_TYPE:'personal',AGENTONE_RELEASE:release,ACCESS_SESSION_SECRET:'release108-session-secret-with-enough-length',PUBLIC_ORIGIN:origin,OPENAI_API_KEY:''},stdio:'ignore'});
  await waitFor(`${origin}/proxy-health`);
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15_000);page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource: the server responded with a status of 503/.test(message.text()))errors.push(message.text());});
  await page.goto(`${origin}/login`,{waitUntil:'domcontentloaded'});await page.getByLabel('Benutzername').fill(user);await page.getByLabel('Passwort').fill(password);await page.getByRole('button',{name:/Sicher anmelden/}).click();await page.waitForURL(`${origin}/`);
  const run=await page.evaluate(async()=>{const response=await fetch('/agentone/commands/briefing',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});return {status:response.status,data:await response.json()};});assert.equal(run.status,200);assert.equal(run.data.effect.state,'COMPLETED');assert.equal(run.data.effect.attempt,1);assert.equal(run.data.commandStream.run.status,'COMPLETED');
  await page.locator('[data-view="tasks"]').click();const center=page.locator('#personal-command-center');await center.waitFor();await center.locator('#personal-effect-meta').filter({hasText:'SICHER ABGESCHLOSSEN'}).waitFor();const text=await center.innerText();assert.match(text,/VERSUCH 1/);assert.match(text,/ATOMARER CLAIM/);assert.match(text,/STABILE IDEMPOTENZ/);assert.equal(await center.locator('#personal-effect-retry:visible').count(),0);assert.equal(await center.locator('#personal-effect-cancel:visible').count(),0);
  const details=await page.evaluate(async id=>{const response=await fetch('/agentone/commands/'+encodeURIComponent(id),{cache:'no-store'});return response.json();},run.data.commandStream.run.id);const serialized=JSON.stringify(details);assert.equal(details.effect.state,'COMPLETED');for(const forbidden of ['claimToken','idempotencyKey','inputHash','resultHash',secret])assert.equal(serialized.includes(forbidden),false,forbidden);
  const layout=await center.evaluate(root=>{const visibleButtons=[...root.querySelectorAll('button')].filter(item=>getComputedStyle(item).display!=='none');return {width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,minTouchHeight:Math.min(...visibleButtons.map(item=>Math.round(item.getBoundingClientRect().height)))};});assert.equal(layout.width,390);assert.equal(layout.scrollWidth,390,JSON.stringify(layout));assert.ok(layout.minTouchHeight>=44,JSON.stringify(layout));
  const screenshot=path.resolve('output/playwright/release108-effect-ledger-mobile.png');await mkdir(path.dirname(screenshot),{recursive:true});await center.screenshot({path:screenshot});assert.ok(!(await page.locator('body').innerText()).includes(secret));assert.deepEqual(errors,[]);
  process.stdout.write(JSON.stringify({ok:true,release,viewport:'390x844',effectState:'COMPLETED',attempt:1,atomicClaim:true,stableIdempotency:true,noHorizontalOverflow:true,minTouchHeight:layout.minTouchHeight,consoleErrors:0,secretsExposed:false,screenshot})+'\n');
}finally{await browser?.close();await stop(proxy);await stop(app);await rm(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
