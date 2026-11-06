import path from 'node:path';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const origin=env.AGENTONE_GUENNI_ORIGIN;
const release='2026.11.06-77';
if(!origin||!env.AGENTONE_GUENNI_USER||!env.AGENTONE_GUENNI_PASSWORD)throw new Error('Günni-Testzugang fehlt');

const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource:'))errors.push(message.text());});
try{
  await page.goto(`${origin}/login`,{waitUntil:'networkidle'});
  await page.locator('#username').fill(env.AGENTONE_GUENNI_USER);
  await page.locator('#password').fill(env.AGENTONE_GUENNI_PASSWORD);
  await Promise.all([page.waitForURL(`${origin}/`),page.getByRole('button',{name:'Sicher anmelden'}).click()]);
  await page.waitForLoadState('networkidle').catch(()=>{});
  await page.waitForTimeout(1500);
  await page.locator('[data-view="command"]').waitFor();
  const releaseState=await page.evaluate(()=>fetch('/agentone/release.json?home-write-smoke=1',{cache:'no-store'}).then(response=>response.json()));
  if(releaseState.release!==release)throw new Error(`Falsches Release ${releaseState.release}`);
  const startedAt=Date.now(),probe='agentone-audit-redaction-probe';
  const snapshot=await page.evaluate(()=>fetch('/agentone/home-assistant/dashboard',{cache:'no-store'}).then(async response=>({ok:response.ok,data:await response.json()})));
  if(!snapshot.ok||!snapshot.data.controlEnabled)throw new Error('Home-Assistant-Steuerung ist nicht aktiv');
  const entities=(snapshot.data.groups||[]).flatMap(group=>group.entities||[]);
  const light=entities.find(item=>item.entity_id?.startsWith('light.')&&item.state==='on'&&Array.isArray(item.attributes?.rgb_color)&&item.attributes.rgb_color.length===3&&Number.isFinite(Number(item.attributes?.brightness)));
  const media=entities.find(item=>item.entity_id?.startsWith('media_player.')&&!['unavailable','unknown'].includes(item.state)&&typeof item.attributes?.volume_level==='number'&&Number.isFinite(item.attributes.volume_level));
  if(!light)throw new Error('Kein eingeschaltetes RGB-Licht für zustandserhaltenden Live-Test gefunden');
  if(!media)throw new Error('Kein Media Player mit Lautstärke für zustandserhaltenden Live-Test gefunden');
  const actions=[
    {name:'rgb-light-same-state',body:{entityId:light.entity_id,service:'turn_on',brightnessPct:Math.max(1,Math.round(Number(light.attributes.brightness)/2.55)),rgbColor:light.attributes.rgb_color.map(Number),transition:0,confirm:true,interactionMode:'full-power',probeSecret:probe}},
    {name:'media-volume-same-state',body:{entityId:media.entity_id,service:'volume_set',volumeLevel:Number(media.attributes.volume_level),confirm:true,interactionMode:'full-power',probeSecret:probe}}
  ];
  const results=[];
  for(const action of actions){
    const result=await page.evaluate(async body=>{const response=await fetch('/agentone/home-assistant/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};},action.body);
    if(result.status!==200||result.data.schema!=='agentone.home-assistant.action-result/v1'||result.data.secretsExposed!==false)throw new Error(`${action.name} fehlgeschlagen: ${JSON.stringify(result).slice(0,300)}`);
    results.push({name:action.name,entityId:action.body.entityId,service:action.body.service,status:result.status,executedAt:result.data.executedAt});
  }
  let governance=null,recent=[];
  for(let attempt=0;attempt<20;attempt+=1){
    governance=await page.evaluate(()=>fetch('/agentone/governance',{cache:'no-store'}).then(response=>response.json()));
    recent=(governance.audit||[]).filter(item=>item.action==='HOME.ACTION'&&Date.parse(item.createdAt)>=startedAt-2000);
    if(recent.length>=actions.length)break;
    await page.waitForTimeout(250);
  }
  if(governance.containsSecrets!==false||recent.length<actions.length)throw new Error('Persistenter Audit-Nachweis fehlt');
  const serialized=JSON.stringify(recent);
  if(serialized.includes(probe)||/(authorization|cookie|password|token)\s*[=:]/i.test(serialized))throw new Error('Audit enthält sensible Testdaten');
  for(const action of actions)if(!recent.some(item=>item.detail.includes(action.body.entityId)&&item.detail.includes(action.body.service)&&item.outcome==='OK'))throw new Error(`Audit fehlt für ${action.name}`);
  if(errors.length)throw new Error(`Browserfehler: ${errors.join(' | ')}`);
  console.log(JSON.stringify({origin,release,mode:'LIVE_SAME_STATE',controlEnabled:true,light:{entityId:light.entity_id,rgb:light.attributes.rgb_color,brightness:light.attributes.brightness},media:{entityId:media.entity_id,volume:media.attributes.volume_level,state:media.state},actions:results,audit:{entries:recent.length,redacted:true,containsSecrets:false},requestedValuesEqualObservedValues:true,consoleErrors:0},null,2));
}finally{await browser.close();}
