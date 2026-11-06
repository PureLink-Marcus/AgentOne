import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const origin=env.AGENTONE_GUENNI_ORIGIN;
if(!origin||!env.AGENTONE_GUENNI_USER||!env.AGENTONE_GUENNI_PASSWORD)throw new Error('Günni-Testzugang ist nicht vollständig konfiguriert.');

const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
const browserErrors=[];
page.on('console',message=>{if(message.type()==='error')browserErrors.push(message.text());});
page.on('pageerror',error=>browserErrors.push(error.message));

try{
  await page.goto(`${origin}/login`,{waitUntil:'networkidle'});
  await page.locator('#username').fill(env.AGENTONE_GUENNI_USER);
  await page.locator('#password').fill(env.AGENTONE_GUENNI_PASSWORD);
  await Promise.all([
    page.waitForURL(`${origin}/`),
    page.getByRole('button',{name:'Sicher anmelden'}).click()
  ]);
  await page.locator('[data-view="tools"]').click();
  const card=page.locator('.home-connector-status');
  await card.waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#home-connector-badge')?.textContent!=='PRÜFUNG');

  const cardText=await card.innerText();
  for(const expected of ['AgentOne Home Connector','LIVE','v2','100.115.49.25','agentone-home-connector.tailbece5a.ts.net','HOME ASSISTANT','verbunden']){
    if(!cardText.includes(expected))throw new Error(`Gerätekarte enthält nicht: ${expected}`);
  }

  await page.locator('#home-device-test').click();
  await page.locator('#home-test-result').filter({hasText:'ERREICHBAR'}).waitFor();
  const testText=await page.locator('#home-test-result').innerText();
  if(!testText.includes('AUTH OK')||!testText.includes('agentone.home-connector/v2'))throw new Error(`Verbindungstest unerwartet: ${testText}`);

  await page.locator('[data-view="home"]').click();
  await page.locator('#ha-state').filter({hasText:'LIVE'}).waitFor();
  const dashboard=await page.evaluate(()=>fetch('/agentone/home-assistant/dashboard').then(response=>response.json()));
  if(dashboard.schema!=='agentone.home-assistant.dashboard/v2'||typeof dashboard.controlEnabled!=='boolean'||dashboard.secretValuesExposed!==false||dashboard.summary.entities<1)throw new Error(`Home-Assistant-Dashboard ungültig: ${JSON.stringify(dashboard).slice(0,300)}`);
  const metricCount=await page.locator('#ha-metrics .ha-metric').count(),groupCount=await page.locator('#ha-groups .ha-group').count();
  if(metricCount!==4||groupCount<1)throw new Error(`Dashboard unvollständig: ${metricCount} Metriken, ${groupCount} Gruppen`);
  const controlCount=await page.locator('#ha-groups .ha-entity-controls button').count(),controlNote=await page.locator('#ha-control-note').innerText();if(controlCount<1||!/(STEUERUNG AKTIV|READ-ONLY)/.test(controlNote))throw new Error(`Steuerungs-Cards fehlen: ${controlCount} · ${controlNote}`);
  const dashboardScreenshot=path.resolve('output/demo/guenni-home-assistant-dashboard-release-68.png');
  await page.screenshot({path:dashboardScreenshot,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const mobileDashboardScreenshot=path.resolve('output/demo/guenni-home-assistant-dashboard-mobile-release-68.png');
  await page.screenshot({path:mobileDashboardScreenshot});
  await page.locator('[data-view="tools"]').click();

  await mkdir(path.resolve('output/demo'),{recursive:true});
  const deviceScreenshot=path.resolve('output/demo/guenni-home-device-release-68.png');
  await card.screenshot({path:deviceScreenshot});

  await page.locator('#home-device-setup').click();
  const dialog=page.locator('dialog[open]');
  await dialog.waitFor({state:'visible'});
  const setupText=await dialog.innerText();
  for(const expected of ['Home-Assistant','Ordner','Netzwerk'])if(!setupText.includes(expected))throw new Error(`Einrichtungsdialog enthält nicht: ${expected}`);
  const permissionCount=await dialog.locator('input[type="checkbox"]').count();
  if(permissionCount<4)throw new Error(`Nur ${permissionCount} Gerätefreigaben im Einrichtungsdialog.`);

  const setupScreenshot=path.resolve('output/demo/guenni-home-device-setup-release-68.png');
  await dialog.screenshot({path:setupScreenshot});
  if(browserErrors.length)throw new Error(`Browserfehler: ${browserErrors.join(' | ')}`);
  console.log(JSON.stringify({origin,release:'2026.11.06-77',connector:dashboard.controlEnabled?'v3-control':'v3-readonly',status:'LIVE',card:'visible',connection:'authenticated',entities:dashboard.summary.entities,domains:dashboard.summary.domains,metricCount,groupCount,controlCount,controlNote,setupPermissions:permissionCount,dashboardScreenshot,mobileDashboardScreenshot,deviceScreenshot,setupScreenshot},null,2));
}finally{
  await browser.close();
}
