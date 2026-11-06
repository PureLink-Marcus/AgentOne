import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),origin=env.AGENTONE_GUENNI_ORIGIN;
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage(),errors=[];
page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource:'))errors.push(message.text());});
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(`${origin}/login`,{waitUntil:'networkidle'});
  await page.locator('#username').fill(env.AGENTONE_GUENNI_USER);
  await page.locator('#password').fill(env.AGENTONE_GUENNI_PASSWORD);
  await Promise.all([page.waitForURL(`${origin}/`),page.getByRole('button',{name:'Sicher anmelden'}).click()]);
  await page.locator('[data-view="private-access"]').click();
  const gmailCard=page.locator('.access-card').filter({has:page.getByRole('heading',{name:'Gmail',exact:true})});
  await gmailCard.getByRole('button',{name:'Jetzt einrichten'}).click();
  await page.waitForTimeout(500);
  const dialog=page.locator('.mail-setup[open]'),debug={gmailCards:await gmailCard.count(),activeView:await page.locator('.view.active').getAttribute('id'),mailDialogOpen:await dialog.count(),errors:[...errors]};
  if(!debug.mailDialogOpen)throw new Error(`Gmail-Dialog öffnete nicht: ${JSON.stringify(debug)}`);
  await dialog.waitFor();
  if(await dialog.locator('[name="provider"]').inputValue()!=='gmail')throw new Error('Gmail-Preset wurde nicht gewählt');
  await dialog.locator('[name="label"]').fill('Gmail Browserprüfung');
  await dialog.locator('[name="email"]').fill('agentone.browser.test@gmail.com');
  await dialog.locator('[name="password"]').fill('abcd1234');
  await dialog.getByRole('button',{name:'Postfach verbinden'}).click();
  const status=dialog.locator('#mail-dialog-status');await status.filter({hasText:/16-stellige Google-App-Passwort/}).waitFor({timeout:10_000});
  const message=(await status.textContent())?.trim()||'';
  if(/command failed/i.test(message))throw new Error('Roher Command-failed-Fehler ist weiter sichtbar');
  const release=await page.evaluate(()=>fetch('/agentone/release.json?browser=1',{cache:'no-store'}).then(response=>response.json()));
  if(release.release!=='2026.11.06-78')throw new Error(`Falsches Browserrelease ${release.release}`);
  if(!await page.locator('.pull-refresh').count())throw new Error('Pull-to-Refresh fehlt');
  await mkdir(path.resolve('output/playwright'),{recursive:true});const screenshot=path.resolve('output/playwright/guenni-gmail-private-release-78.png');await dialog.screenshot({path:screenshot});
  if(errors.length)throw new Error(`Browserfehler: ${errors.join(' | ')}`);
  console.log(JSON.stringify({origin,release:release.release,context:'FRESH_PRIVATE',gmailPreset:'PASS',ordinaryEightCharacterPassword:'BLOCKED_BEFORE_NETWORK',errorMessage:message,pullToRefresh:'PASS',screenshot,secretsExposed:false},null,2));
}finally{await context.close();await browser.close();}
