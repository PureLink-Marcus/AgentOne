import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const release='2026.11.07-105',env=loadEnv(path.resolve('.')),origin=String(env.AGENTONE_GUENNI_ORIGIN||'').replace(/\/$/,''),user=env.AGENTONE_GUENNI_USER,password=env.AGENTONE_GUENNI_PASSWORD;
if(!origin||!user||!password)throw new Error('Günni-Live-Konfiguration fehlt.');
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}),errors=[];let routineId=null,simulationHash=null;
page.on('pageerror',error=>errors.push('page:'+error.message));page.on('console',message=>{if(message.type()==='error')errors.push('console:'+message.text());});
async function api(pathName,options={}){return page.evaluate(async({pathName,options})=>{const response=await fetch(pathName,{cache:'no-store',headers:{accept:'application/json',...(options.body?{'content-type':'application/json'}:{})},...options,body:options.body?JSON.stringify(options.body):undefined}),data=await response.json().catch(()=>({}));return {status:response.status,ok:response.ok,data};},{pathName,options});}
try{
  await page.goto(origin+'/login',{waitUntil:'networkidle'});await page.locator('#username').fill(user);await page.locator('#password').fill(password);await Promise.all([page.waitForURL(origin+'/'),page.getByRole('button',{name:'Sicher anmelden'}).click()]);
  const releaseState=await api('/agentone/release.json?smoke=release105-live');if(releaseState.data.release!==release)throw new Error(`Live-Release ist ${releaseState.data.release} statt ${release}`);
  const day=new Date().getDay(),created=await api('/agentone/routines',{method:'POST',body:{title:'Release 105 Live-Briefing',action:'morning-briefing',scheduleTime:'00:00',days:[day],timezone:'Europe/Berlin'}});if(!created.ok)throw new Error('Routine anlegen: '+JSON.stringify(created));routineId=created.data.routine.id;
  const simulated=await api(`/agentone/routines/${encodeURIComponent(routineId)}/simulate`,{method:'POST',body:{}});if(!simulated.ok)throw new Error('Routine simulieren: '+JSON.stringify(simulated));simulationHash=simulated.data.simulation.hash;
  const activated=await api(`/agentone/routines/${encodeURIComponent(routineId)}/state`,{method:'PUT',body:{state:'ACTIVE',simulationHash}});if(!activated.ok)throw new Error('Routine aktivieren: '+JSON.stringify(activated));
  const executed=await api(`/agentone/routines/${encodeURIComponent(routineId)}/run`,{method:'POST',body:{}});if(!executed.ok||executed.data.run?.status!=='COMPLETED'||executed.data.commandStream?.run?.status!=='COMPLETED')throw new Error('Routine ausführen: '+JSON.stringify(executed).slice(0,800));
  const runId=executed.data.run.id,inbox=await api('/agentone/routines/runs?limit=20');if(!inbox.ok||!inbox.data.runs?.some(item=>item.id===runId&&item.result?.policy?.secretsExposed===false))throw new Error('Routine-Inbox unvollständig');
  const read=await api(`/agentone/routines/runs/${encodeURIComponent(runId)}/state`,{method:'PUT',body:{state:'READ'}});if(!read.ok||read.data.run?.inboxState!=='READ')throw new Error('Inbox READ fehlgeschlagen');
  await page.locator('[data-view="tasks"]').click();const card=page.locator('#scheduled-briefing-inbox');await card.getByRole('heading',{name:'Seit deinem letzten Besuch'}).waitFor();await card.getByRole('button',{name:'Aktualisieren'}).click();await card.getByText('Dein geplanter Überblick',{exact:true}).first().waitFor();
  const layout=await card.evaluate(root=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,minTouchHeight:Math.min(...[...root.querySelectorAll('button')].map(item=>Math.round(item.getBoundingClientRect().height)))}));if(layout.scrollWidth>layout.width||layout.minTouchHeight<44)throw new Error('Mobiles Layout ungültig: '+JSON.stringify(layout));
  await mkdir(path.resolve('output/playwright'),{recursive:true});const screenshot=path.resolve('output/playwright/guenni-release105-briefing-inbox-live-mobile.png');await card.screenshot({path:screenshot});
  const paused=await api(`/agentone/routines/${encodeURIComponent(routineId)}/state`,{method:'PUT',body:{state:'PAUSED'}});if(!paused.ok)throw new Error('Smoke-Routine pausieren fehlgeschlagen');const removed=await api(`/agentone/routines/${encodeURIComponent(routineId)}`,{method:'DELETE'});if(!removed.ok)throw new Error('Smoke-Routine löschen fehlgeschlagen');routineId=null;
  if(errors.length)throw new Error('Browserfehler: '+errors.join(' | '));process.stdout.write(JSON.stringify({ok:true,origin,release,viewport:'390x844',routineExecution:'COMPLETED',commandStream:'COMPLETED',inboxLifecycle:'NEW_TO_READ',cleanup:'COMPLETE',layout,screenshot,consoleErrors:0,secretsExposed:false})+'\n');
}finally{
  if(routineId)try{await api(`/agentone/routines/${encodeURIComponent(routineId)}/state`,{method:'PUT',body:{state:'PAUSED'}});await api(`/agentone/routines/${encodeURIComponent(routineId)}`,{method:'DELETE'});}catch{}
  await browser.close();
}
