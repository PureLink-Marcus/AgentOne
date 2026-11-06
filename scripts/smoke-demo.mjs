import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const base=process.env.AGENTONE_SMOKE_BASE||'http://127.0.0.1:4173';
const env=loadEnv(path.resolve('.'));
const errors=[];
const browser=await chromium.launch({ channel:'chrome', headless:true });
const page=await browser.newPage({ viewport:{ width:1440, height:920 }, locale:'de-DE' });
page.on('console',message=>{ if(message.type()==='error')errors.push(message.text()); });
page.on('pageerror',error=>errors.push(error.message));

try{
  await page.goto(base,{waitUntil:'networkidle'});
  if(env.AGENTONE_LOGIN_USER&&env.AGENTONE_LOGIN_PASSWORD){
    await page.getByLabel('Benutzername').fill(env.AGENTONE_LOGIN_USER);
    await page.getByLabel('Passwort').fill(env.AGENTONE_LOGIN_PASSWORD);
    await page.getByRole('button',{name:/Sicher anmelden/}).click();
  }else{
    await page.getByRole('button',{name:/Marcus Wartenberg/}).click();
    await page.getByRole('button',{name:/Mit PureLink Demo fortfahren/}).click();
  }
  await page.waitForTimeout(4000);
  if(process.env.AGENTONE_SMOKE_DEBUG==='1')process.stdout.write(`${JSON.stringify({url:page.url(),body:(await page.locator('body').innerText()).slice(0,1200),errors})}\n`);
  await page.getByRole('button',{name:/Welten/}).waitFor({timeout:10_000});
  await page.getByRole('button',{name:/Welten/}).click();
  await page.getByText('Vier Welten. Vier AgentOne.').waitFor();
  await page.getByRole('button',{name:/Plattform/}).click();
  await page.getByText('Workflows bis zur letzten Übergabe.').waitFor();
  await page.getByText('PERSISTENT ENGINE').waitFor();
  const platform=await page.evaluate(()=>fetch('/api/platform/snapshot').then(response=>response.json()));
  assert.equal(platform.runs.length,4);assert.equal(platform.gates.filter(item=>item.status==='PENDING').length,1);
  const liveEvent=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const source=new EventSource('/api/platform/events?worlds=product');
    const timeout=setTimeout(()=>{source.close();reject(new Error('SSE event timeout'));},5000);
    source.addEventListener('run_advance',event=>{clearTimeout(timeout);source.close();resolve(JSON.parse(event.data));},{once:true});
    source.onopen=()=>fetch('/api/platform/runs/RUN-DEMO-PRODUCT/advance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payload:{smoke:true},output:{verified:true},cost:.1})}).catch(reject);
  }));
  assert.equal(liveEvent.worldId,'product');
  await page.getByRole('button',{name:/AgentOne Personal/}).click();
  await page.getByText('Ein AgentOne für deine Themen.').waitFor();
  await page.getByRole('button',{name:/Admin Control/}).click();
  await page.getByText('Drei Benutzer. Drei Vertrauensgrenzen.').waitFor();
  const me=await page.evaluate(()=>fetch('/api/auth/me').then(response=>response.json()));
  assert.equal(me.authenticated,true); assert.equal(me.user.role,'Platform Admin');
  await page.getByRole('button',{name:'Inventar laden'}).click();
  await page.getByText(/Secret-Namen geladen/).waitFor();
  const secretResponse=await page.evaluate(()=>fetch('/api/admin/secrets').then(response=>response.json()));
  assert.equal(secretResponse.policy.valuesExposed,false);
  assert.ok(secretResponse.secrets.every(item=>item.valueVisible===false));
  await page.getByRole('button',{name:/Herbstkollektion aktualisieren/}).click();
  await page.getByText('SESSION CONTENT VIEW · AUDITIERT').waitFor();
  await page.getByRole('button',{name:'Schließen'}).click();
  await page.getByRole('button',{name:/Integrationen/}).click();
  await page.getByText('Live, wenn sicher. Simulation, wenn nötig.').waitFor();
  await page.getByRole('heading',{name:'Microsoft Graph / Entra'}).locator('xpath=ancestor::article').getByRole('button',{name:'Healthcheck'}).click();
  await page.getByText(/Microsoft Graph \/ Entra: (SIMULATED|LIVE|DEGRADED)/).waitFor();

  const bootstrap=await page.evaluate(()=>fetch('/api/bootstrap').then(response=>response.text()));
  for(const [name,value] of Object.entries(env)){
    if(!/(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)/i.test(name)||typeof value!=='string'||value.length<8)continue;
    assert.equal(bootstrap.includes(value),false,`Sensitive value leaked for ${name}`);
  }
  assert.deepEqual(errors,[],`Browser errors: ${errors.join(' | ')}`);
  console.log('Smoke OK: platform engine, SSE isolation, session login, personal, secret registry, admin audit, integration health, secret scan.');
}finally{
  await browser.close();
}
