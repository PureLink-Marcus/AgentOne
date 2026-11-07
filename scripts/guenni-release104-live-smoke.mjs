import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const release='2026.11.07-104';
const env=loadEnv(path.resolve('.'));
const originRaw=String(env.AGENTONE_GUENNI_ORIGIN||'');
const origin=originRaw.endsWith('/')?originRaw.slice(0,-1):originRaw;
const user=env.AGENTONE_GUENNI_USER;
const password=env.AGENTONE_GUENNI_PASSWORD;
if(!origin||!user||!password)throw new Error('Günni-Live-Konfiguration fehlt.');

const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const errors=[];
page.on('pageerror',error=>errors.push('page:'+error.message));
page.on('console',message=>{if(message.type()==='error')errors.push('console:'+message.text());});
try{
  await page.goto(origin+'/login',{waitUntil:'networkidle'});
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(password);
  await Promise.all([page.waitForURL(origin+'/'),page.getByRole('button',{name:'Sicher anmelden'}).click()]);
  const releaseState=await page.evaluate(()=>fetch('/agentone/release.json?smoke=release104-live',{cache:'no-store'}).then(response=>response.json()));
  if(releaseState.release!==release)throw new Error('Live-Release ist '+releaseState.release+' statt '+release);
  const endpoints=await page.evaluate(async()=>Promise.all([
    fetch('/agentone/health/trends',{cache:'no-store'}).then(response=>({id:'health-trends',status:response.status,ok:response.ok})),
    fetch('/agentone/memory/candidates?state=PENDING',{cache:'no-store'}).then(response=>({id:'memory-review',status:response.status,ok:response.ok})),
    fetch('/agentone/mail/messages?limit=1',{cache:'no-store'}).then(response=>({id:'mail-metadata',status:response.status,ok:response.ok})),
  ]));
  if(endpoints.some(item=>!item.ok))throw new Error('Release-104-Endpunktfehler: '+JSON.stringify(endpoints));
  await mkdir(path.resolve('output/playwright'),{recursive:true});

  await page.locator('[data-view="tools"]').click();
  const mail=page.locator('.mail-center');await mail.waitFor();
  if(await page.locator('#mail-detail-insight').count()!==1)throw new Error('Mail-Einmalanalyse fehlt im Live-DOM.');
  const trends=page.locator('.health-recovery-center').filter({has:page.getByRole('heading',{name:'7 Tage im Vergleich zu deiner Basis'})});
  await trends.waitFor();
  await page.waitForFunction(()=>document.querySelector('#health-trend-status')?.textContent!=='WIRD BERECHNET');
  const healthStatus=String(await trends.locator('#health-trend-status').innerText()).trim();
  const healthShot=path.resolve('output/playwright/guenni-release104-health-live-mobile.png');
  await trends.screenshot({path:healthShot});

  await page.locator('[data-view="memory"]').click();
  await page.getByRole('heading',{name:'Memory Review'}).waitFor();
  await page.locator('#memory-review-count').filter({hasText:'OFFEN'}).waitFor();
  const memoryShot=path.resolve('output/playwright/guenni-release104-memory-live-mobile.png');
  await page.locator('#memory').screenshot({path:memoryShot});

  await page.locator('[data-view="private-access"]').click();
  const companion=page.locator('.apple-quickstart');
  await companion.getByRole('heading',{name:'Günni Companion · Web-App'}).waitFor();
  await companion.getByRole('link',{name:'Companion öffnen / installieren'}).waitFor();
  await companion.getByRole('link',{name:'Companion-Anleitung (optional)'}).waitFor();
  const companionShot=path.resolve('output/playwright/guenni-release104-companion-live-mobile.png');
  await companion.screenshot({path:companionShot});

  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  if(layout.scrollWidth>layout.width)throw new Error('Horizontaler Overflow: '+JSON.stringify(layout));
  if(errors.length)throw new Error('Browserfehler: '+errors.join(' | '));
  process.stdout.write(JSON.stringify({ok:true,origin,release,mode:'READ_ONLY',viewport:'390x844',endpoints,mailInsightControl:'PRESENT_NOT_EXECUTED',healthStatus,memoryReview:'VISIBLE',companion:'VISIBLE',screenshots:{health:healthShot,memory:memoryShot,companion:companionShot},consoleErrors:0,secretsExposed:false})+'\n');
}finally{
  await browser.close();
}
