import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const release='2026.11.07-100';
const progress=step=>process.stdout.write(`[learning-lab] ${step}\n`);
const assertStatus=async(response,expected)=>{if(response.status()!==expected)throw new Error(`HTTP ${response.status()} statt ${expected}: ${String(await response.text()).slice(0,400)}`);};
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
const waitFor=async url=>{for(let attempt=0;attempt<80;attempt++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Server nicht bereit: ${url}`);};
const stop=async child=>{if(!child||child.exitCode!==null)return;child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,4_000))]);if(child.exitCode===null)child.kill('SIGKILL');};
const waitState=(page,state)=>page.locator(`.learning-skill[data-state="${state}"]`).waitFor({state:'visible',timeout:15_000});

const appPort=await freePort(),proxyPort=await freePort(),dataDir=await mkdtemp(path.join(os.tmpdir(),'agentone-learning-browser-'));
const internalToken='learning-browser-internal-token-with-enough-length',origin=`http://127.0.0.1:${proxyPort}`,user='guenni',password='learning-browser-password-with-enough-length';
const app=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(appPort),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_BASIC_AUTH_USER:'',AGENTONE_BASIC_AUTH_PASSWORD:'',AGENTONE_INTERNAL_API_TOKEN:internalToken,AGENTONE_SECRET_KEY:'learning-browser-companion-pepper-with-enough-length',AGENTONE_HEALTH_MASTER_KEY:'learning-browser-health-master-key-with-enough-length',AGENTONE_DEMO_MASTER_KEY:''},stdio:'ignore'});
let proxy,browser;
try{
  await waitFor(`http://127.0.0.1:${appPort}/api/health`);
  proxy=spawn(process.execPath,['server/basic-proxy.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(proxyPort),UPSTREAM_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_TOKEN:internalToken,BASIC_AUTH_USER:user,BASIC_AUTH_PASSWORD:password,AUTHENTICATED_USER:'guenni@local',AGENTONE_DISPLAY_NAME:'Günni',AGENTONE_INSTANCE_TYPE:'personal',AGENTONE_RELEASE:release,ACCESS_SESSION_SECRET:'learning-browser-session-secret-with-enough-length',PUBLIC_ORIGIN:origin,OPENAI_API_KEY:''},stdio:'ignore'});
  await waitFor(`${origin}/proxy-health`);
  progress('servers-ready');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'de-DE'}),page=await context.newPage(),consoleErrors=[],pageErrors=[],skillFailures=[];
  page.setDefaultTimeout(15_000);
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});page.on('pageerror',error=>pageErrors.push(error.message));page.on('response',response=>{if(response.status()>=400&&response.url().includes('/agentone/skills'))skillFailures.push({status:response.status(),url:response.url()});});
  await page.goto(`${origin}/login`,{waitUntil:'domcontentloaded'});await page.getByLabel('Benutzername').fill(user);await page.getByLabel('Passwort').fill(password);await page.getByRole('button',{name:/Sicher anmelden/}).click();await page.waitForURL(`${origin}/`);
  progress('login-ready');
  await page.locator('[data-view="tools"]').click();const lab=page.locator('#learning-lab');await lab.waitFor();await lab.locator('#learning-lab-provision').waitFor({state:'visible'});const [provisionResponse]=await Promise.all([page.waitForResponse(response=>response.url()===`${origin}/agentone/skills`&&response.request().method()==='POST'),lab.locator('#learning-lab-provision').click()]);progress('draft-response-'+provisionResponse.status());await assertStatus(provisionResponse,201);await waitState(page,'DRAFT');progress('draft-ready');
  let [actionResponse]=await Promise.all([page.waitForResponse(response=>response.url().endsWith('/evaluate')),lab.locator('[data-skill-action="evaluate"]').click()]);progress('test-response-'+actionResponse.status());await assertStatus(actionResponse,200);await waitState(page,'TEST');progress('test-ready');
  page.once('dialog',dialog=>dialog.accept());[actionResponse]=await Promise.all([page.waitForResponse(response=>response.url().endsWith('/approve')),lab.locator('[data-skill-action="approve"]').click()]);progress('approval-response-'+actionResponse.status());await assertStatus(actionResponse,200);await waitState(page,'APPROVED');progress('approval-ready');
  page.once('dialog',dialog=>dialog.accept());[actionResponse]=await Promise.all([page.waitForResponse(response=>response.url().endsWith('/activate')),lab.locator('[data-skill-action="activate"]').click()]);progress('active-response-'+actionResponse.status());await assertStatus(actionResponse,200);await waitState(page,'ACTIVE');progress('active-ready');
  await lab.locator('[data-skill-action="execute"]').click();await lab.locator('#learning-execution-result:not([hidden])').waitFor();await lab.locator('.learning-execution-item').first().waitFor();
  progress('execution-visible');
  const publicState=await page.evaluate(()=>fetch('/agentone/skills',{cache:'no-store'}).then(response=>response.json())),serialized=JSON.stringify(publicState).toLowerCase();assert.equal(publicState.skills[0].status,'ACTIVE');assert.equal(publicState.skills[0].lastExecution.status,'COMPLETED');assert.equal(publicState.skills[0].rollbackAvailable,false);for(const forbidden of ['procedure','prompt','payload','client_secret','password='])assert.equal(serialized.includes(forbidden),false,forbidden);
  assert.deepEqual(pageErrors,[]);assert.deepEqual(skillFailures,[]);assert.deepEqual(consoleErrors.filter(message=>message.includes('/agentone/skills')),[]);
  await mkdir(path.resolve('output/playwright'),{recursive:true});const desktop=path.resolve('output/playwright/learning-lab-release-100-desktop.png'),mobile=path.resolve('output/playwright/learning-lab-release-100-mobile.png'),mobileResult=path.resolve('output/playwright/learning-lab-release-100-mobile-result.png');await lab.screenshot({path:desktop});await page.setViewportSize({width:390,height:844});await learningExecutionResultScreenshot(page,mobileResult);await page.setViewportSize({width:1440,height:1000});
  const mobilePage=await context.newPage();await mobilePage.setViewportSize({width:390,height:844});await mobilePage.goto(origin,{waitUntil:'domcontentloaded'});await mobilePage.locator('[data-view="tools"]').click();const mobileLab=mobilePage.locator('#learning-lab');await mobileLab.waitFor();await mobileLab.locator('.learning-skill[data-state="ACTIVE"]').waitFor();const layout=await mobileLab.evaluate(node=>{const rect=node.getBoundingClientRect(),width=document.documentElement.clientWidth,buttons=[...node.querySelectorAll('button')].filter(button=>!button.hidden&&getComputedStyle(button).display!=='none').map(button=>Math.round(button.getBoundingClientRect().height));return {width,left:Math.round(rect.left),right:Math.round(rect.right),scrollWidth:document.documentElement.scrollWidth,minTouchHeight:Math.min(...buttons)};});assert.ok(layout.left>=0&&layout.right<=layout.width&&layout.scrollWidth<=layout.width&&layout.minTouchHeight>=44,JSON.stringify(layout));await mobileLab.screenshot({path:mobile});await mobilePage.close();
  progress('mobile-ready');
  process.stdout.write(JSON.stringify({ok:true,release,state:publicState.skills[0].status,executions:publicState.executions.length,desktop,mobile,mobileResult,secretsExposed:false})+'\n');
}finally{await browser?.close();await stop(proxy);await stop(app);await rm(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}

async function learningExecutionResultScreenshot(page,target){const result=page.locator('#learning-execution-result');await result.scrollIntoViewIfNeeded();await result.screenshot({path:target});}
