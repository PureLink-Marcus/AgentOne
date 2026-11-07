import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const release='2026.11.07-105';
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
const waitFor=async url=>{for(let attempt=0;attempt<100;attempt+=1){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Server nicht bereit: ${url}`);};
const stop=async child=>{if(!child||child.exitCode!==null)return;child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,4_000))]);if(child.exitCode===null)child.kill('SIGKILL');};

const appPort=await freePort(),proxyPort=await freePort(),dataDir=await mkdtemp(path.join(os.tmpdir(),'agentone-release105-ui-'));
const internalToken='release105-ui-internal-token-with-enough-length',origin=`http://127.0.0.1:${proxyPort}`,user='release105-user',password='release105-browser-password-with-enough-length',secretMarker='release105-secret-must-never-reach-dom';
const app=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(appPort),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_BASIC_AUTH_USER:'',AGENTONE_BASIC_AUTH_PASSWORD:'',AGENTONE_INTERNAL_API_TOKEN:internalToken,AGENTONE_SECRET_KEY:'release105-companion-pepper-with-enough-length',AGENTONE_HEALTH_MASTER_KEY:'release105-health-master-key-with-enough-length',AGENTONE_DEMO_MASTER_KEY:'',OPENAI_API_KEY:''},stdio:'ignore'});
let proxy,browser;
try{
  await waitFor(`http://127.0.0.1:${appPort}/api/health`);
  proxy=spawn(process.execPath,['server/basic-proxy.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(proxyPort),UPSTREAM_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_URL:`http://127.0.0.1:${appPort}`,PERSONAL_API_TOKEN:internalToken,BASIC_AUTH_USER:user,BASIC_AUTH_PASSWORD:password,AUTHENTICATED_USER:user,AGENTONE_DISPLAY_NAME:'Günni',AGENTONE_INSTANCE_TYPE:'personal',AGENTONE_RELEASE:release,ACCESS_SESSION_SECRET:'release105-session-secret-with-enough-length',PUBLIC_ORIGIN:origin,OPENAI_API_KEY:''},stdio:'ignore'});
  await waitFor(`${origin}/proxy-health`);
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE'}),page=await context.newPage(),pageErrors=[],consoleErrors=[],flowFailures=[],stateRequests=[];
  page.setDefaultTimeout(15_000);
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400&&/\/agentone\/routines(?:\/|$)/.test(new URL(response.url()).pathname))flowFailures.push({status:response.status(),url:response.url()});});

  const routine={id:'routine-release105',title:'Persönlicher Morgenüberblick',action:'morning-briefing',scheduleTime:'07:30',days:[1,2,3,4,5],timezone:'Europe/Berlin',state:'ACTIVE',simulationHash:'release105-safe-simulation'};
  const result=(title,summary,insights,sources=[{id:'mail',status:'LIVE',records:5,accounts:1,calendars:0}])=>({schema:'agentone.personal-routine-result/v2',routineId:routine.id,action:routine.action,mode:'READ_ONLY',generatedAt:'2026-11-07T10:00:00.000Z',commandRunId:null,title,summary,sources,insights,mutations:[],policy:{readOnly:true,bodyStored:false,rawHealthValuesStored:false,piiStored:false,medicalDiagnosis:false,secretsExposed:false},contentHash:'a'.repeat(64)});
  const runs=[
    {id:'run-mail-105',routineId:routine.id,routineTitle:routine.title,action:'mail-summary',status:'COMPLETED',inboxState:'UNREAD',reason:'Zeitplan 07:30 · <img src=x onerror=alert(1)>',createdAt:'2026-11-07T11:00:00.000Z',completedAt:'2026-11-07T11:00:01.000Z',internalToken:secretMarker,result:result('Dein Postfach seit dem letzten Lauf',{events:7,signals:1,attention:1,informational:0,ledgerEvents:12},[{id:'mail.daily-triage',domain:'mail',severity:'attention',title:'Posteingang ausgewertet',summary:'Eine Nachricht braucht Aufmerksamkeit · <script>window.pwned=true</script>',confidence:.94,evidenceCount:2,sources:['mail'],target:'tools:mail'}])},
    {id:'run-calendar-105',routineId:routine.id,routineTitle:routine.title,action:'morning-briefing',status:'COMPLETED',inboxState:'UNREAD',reason:'Geplanter Werktagslauf',createdAt:'2026-11-07T10:00:00.000Z',completedAt:'2026-11-07T10:00:01.000Z',result:result('Dein geplanter Überblick',{events:4,signals:1,attention:0,informational:1,ledgerEvents:9},[{id:'calendar.next-24h',domain:'calendar',severity:'info',title:'Die nächsten 24 Stunden',summary:'Zwei Termine wurden read-only geprüft.',confidence:.9,evidenceCount:2,sources:['calendar'],target:'tasks:planning'}],[{id:'calendar',status:'LIVE',records:4,accounts:1,calendars:2}])},
  ];
  let runsGetCount=0,manualRuns=0;
  await page.route('**/agentone/routines/runs?*',route=>{runsGetCount+=1;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({runs,secretsExposed:false})});});
  await page.route('**/agentone/routines/runs/*/state',async route=>{assert.equal(route.request().method(),'PUT');const id=new URL(route.request().url()).pathname.split('/').at(-2),input=route.request().postDataJSON(),run=runs.find(item=>item.id===id);assert.ok(run,`unknown run ${id}`);assert.ok(['READ','SNOOZED','DISMISSED'].includes(input.state));run.inboxState=input.state;if(input.state==='SNOOZED')run.snoozedUntil=input.snoozedUntil;stateRequests.push({id,...input});await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({run,secretsExposed:false})});});
  await page.route('**/agentone/routines/*/run',async route=>{assert.equal(route.request().method(),'POST');manualRuns+=1;runs.unshift({id:'run-manual-105',routineId:routine.id,routineTitle:routine.title,action:'morning-briefing',status:'COMPLETED',inboxState:'UNREAD',reason:'Manuell durch dich gestartet',createdAt:'2026-11-07T12:00:00.000Z',completedAt:'2026-11-07T12:00:01.000Z',result:result('Manuell erzeugtes Briefing',{events:8,signals:2,attention:0,informational:2,ledgerEvents:14},[{id:'calendar.next-24h',domain:'calendar',severity:'info',title:'Planung aktualisiert',summary:'Dein Tagesplan wurde ohne Änderungen gelesen.',confidence:.91,evidenceCount:3,sources:['calendar'],target:'tasks:planning'}],[{id:'calendar',status:'LIVE',records:3,accounts:1,calendars:2},{id:'mail',status:'LIVE',records:5,accounts:1,calendars:0}])});await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({run:runs[0],secretsExposed:false})});});
  await page.route('**/agentone/routines',route=>{if(route.request().method()!=='GET')return route.continue();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({routines:[routine]})});});

  await page.goto(`${origin}/login`,{waitUntil:'domcontentloaded'});await page.getByLabel('Benutzername').fill(user);await page.getByLabel('Passwort').fill(password);await page.getByRole('button',{name:/Sicher anmelden/}).click();await page.waitForURL(`${origin}/`);
  await page.locator('[data-view="tasks"]').click();
  const inbox=page.locator('#scheduled-briefing-inbox');await inbox.getByRole('heading',{name:'Seit deinem letzten Besuch'}).waitFor();await inbox.locator('#briefing-inbox-count').filter({hasText:'2 NEU'}).waitFor();
  assert.equal(await inbox.locator('.briefing-inbox-item').count(),2);
  assert.match(await inbox.innerText(),/QUELLE · mail · LIVE/i);assert.match(await inbox.innerText(),/STATUS · ABGESCHLOSSEN/);assert.match(await inbox.innerText(),/GRUND · Zeitplan/);assert.match(await inbox.innerText(),/ZEIT ·/);
  assert.match(await inbox.innerText(),/<img src=x onerror=alert\(1\)>/);assert.match(await inbox.innerText(),/<script>window\.pwned=true<\/script>/);assert.equal(await inbox.locator('img,script').count(),0);assert.equal(await page.evaluate(()=>window.pwned),undefined);
  assert.ok(!(await page.locator('body').innerText()).includes(secretMarker),'secret marker reached DOM');
  const layout=await inbox.evaluate(root=>{const rect=root.getBoundingClientRect(),controls=[...root.querySelectorAll('button')].filter(item=>getComputedStyle(item).display!=='none');return {clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,left:Math.round(rect.left),right:Math.round(rect.right),minTouchHeight:Math.min(...controls.map(item=>Math.round(item.getBoundingClientRect().height)))};});
  assert.equal(layout.clientWidth,390);assert.equal(layout.scrollWidth,layout.clientWidth,JSON.stringify(layout));assert.ok(layout.left>=0&&layout.right<=layout.clientWidth,JSON.stringify(layout));assert.ok(layout.minTouchHeight>=44,JSON.stringify(layout));
  const screenshot=path.resolve('output/playwright/release105-briefing-inbox-mobile.png');await mkdir(path.dirname(screenshot),{recursive:true});await inbox.screenshot({path:screenshot});

  const mailRun=inbox.locator('.briefing-inbox-item').filter({hasText:'Dein Postfach seit dem letzten Lauf'});await mailRun.getByRole('button',{name:'Passenden Bereich öffnen'}).click();await page.locator('#tools').waitFor({state:'visible'});await page.locator('.mail-center').waitFor();await page.locator('[data-view="tasks"]').click();await inbox.waitFor({state:'visible'});
  await mailRun.getByRole('button',{name:'Als gelesen markieren'}).click();await inbox.locator('#briefing-inbox-count').filter({hasText:'1 NEU'}).waitFor();await mailRun.getByText('GELESEN',{exact:true}).waitFor();
  const calendarRun=inbox.locator('.briefing-inbox-item').filter({hasText:'Dein geplanter Überblick'});await calendarRun.getByRole('button',{name:'12 Std. später'}).click();await calendarRun.waitFor({state:'detached'});await inbox.locator('#briefing-inbox-count').filter({hasText:'1 AKTUELL'}).waitFor();
  const snooze=stateRequests.find(item=>item.state==='SNOOZED');assert.ok(snooze?.snoozedUntil);const snoozeHours=(new Date(snooze.snoozedUntil).getTime()-Date.now())/3_600_000;assert.ok(snoozeHours>11.9&&snoozeHours<=12.01,`unexpected snooze ${snoozeHours}`);

  const routineCenter=page.locator('.routine-center');await routineCenter.getByRole('button',{name:'Jetzt ausführen'}).click();await inbox.getByText('Manuell erzeugtes Briefing',{exact:true}).waitFor();await inbox.locator('#briefing-inbox-count').filter({hasText:'1 NEU'}).waitFor();assert.equal(manualRuns,1);
  const beforeRefresh=runsGetCount;await routineCenter.getByRole('button',{name:'Läufe aktualisieren'}).click();for(let attempt=0;attempt<20&&runsGetCount===beforeRefresh;attempt+=1)await page.waitForTimeout(50);assert.ok(runsGetCount>beforeRefresh,'history refresh did not request runs');
  const manualRun=inbox.locator('.briefing-inbox-item').filter({hasText:'Manuell erzeugtes Briefing'});await manualRun.getByRole('button',{name:'Ausblenden'}).click();await manualRun.waitFor({state:'detached'});await inbox.locator('#briefing-inbox-count').filter({hasText:'1 AKTUELL'}).waitFor();

  await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-view="tasks"]').click();const reloaded=page.locator('#scheduled-briefing-inbox');await reloaded.locator('#briefing-inbox-count').filter({hasText:'1 AKTUELL'}).waitFor();assert.equal(await reloaded.locator('.briefing-inbox-item').count(),1);assert.match(await reloaded.innerText(),/GELESEN/);assert.doesNotMatch(await reloaded.innerText(),/Dein geplanter Überblick|Manuell erzeugtes Briefing/);assert.ok(!(await page.locator('body').innerText()).includes(secretMarker),'secret marker reached DOM after reload');
  const unexpectedConsoleErrors=consoleErrors.filter(message=>!/Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)/.test(message));
  assert.deepEqual(stateRequests.map(item=>item.state),['READ','SNOOZED','DISMISSED']);assert.deepEqual(pageErrors,[]);assert.deepEqual(unexpectedConsoleErrors,[]);assert.deepEqual(flowFailures,[]);
  process.stdout.write(JSON.stringify({ok:true,release,viewport:'390x844',runsGetCount,manualRuns,stateTransitions:stateRequests.map(item=>item.state),reloadPersistence:true,noHorizontalOverflow:true,minTouchHeight:layout.minTouchHeight,degradedBackgroundRequests:consoleErrors.length,secretsExposed:false,screenshot})+'\n');
}finally{await browser?.close();await stop(proxy);await stop(app);await rm(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
