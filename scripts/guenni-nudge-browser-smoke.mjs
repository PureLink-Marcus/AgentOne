import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),origin=env.AGENTONE_GUENNI_ORIGIN,release='2026.11.06-77';
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource:'))errors.push(message.text());});
try{
  await page.goto(`${origin}/login`,{waitUntil:'networkidle'});await page.locator('#username').fill(env.AGENTONE_GUENNI_USER);await page.locator('#password').fill(env.AGENTONE_GUENNI_PASSWORD);await Promise.all([page.waitForURL(`${origin}/`),page.getByRole('button',{name:'Sicher anmelden'}).click()]);
  const liveRelease=await page.evaluate(()=>fetch('/agentone/release.json',{cache:'no-store'}).then(response=>response.json()));if(liveRelease.release!==release)throw new Error(`Erwartet ${release}, erhalten ${liveRelease.release}`);
  const original=await page.evaluate(()=>fetch('/agentone/nudges').then(response=>response.json()));if(!original.settings||!Array.isArray(original.items)||original.secretsExposed!==false)throw new Error('Nudge API unvollständig');
  await page.locator('[data-view="tasks"]').click();await page.getByRole('heading',{name:'Worauf soll ich dich hinweisen?'}).waitFor();await page.locator('#nudge-priority').selectOption('high');await page.locator('#nudge-save').click();await page.waitForFunction(()=>document.querySelector('#nudge-priority')?.value==='high');
  const saved=await page.evaluate(()=>fetch('/agentone/nudges').then(response=>response.json()));if(saved.settings.minimumPriority!=='high')throw new Error('Nudge-Regeln wurden nicht persistent gespeichert');
  await page.evaluate(settings=>fetch('/agentone/nudges',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(settings)}),original.settings);
  await mkdir(path.resolve('output/playwright'),{recursive:true});const screenshot=path.resolve('output/playwright/guenni-nudges-release-77.png');await page.locator('.nudge-center').screenshot({path:screenshot});if(errors.length)throw new Error(errors.join(' | '));
  console.log(JSON.stringify({origin,release,api:'PASS',persistentSettings:'PASS',quietHours:original.settings.quietHours,itemCount:original.items.length,delivery:original.delivery,secretsExposed:false,consoleErrors:0,screenshot},null,2));
}finally{await browser.close();}
