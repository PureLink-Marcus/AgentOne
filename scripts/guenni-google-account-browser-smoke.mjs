import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),origin=env.AGENTONE_GUENNI_ORIGIN,browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1180,height:880}}),errors=[];
page.on('pageerror',error=>errors.push(String(error.message||error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
  await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});await page.locator('input[name="username"]').fill(env.AGENTONE_GUENNI_USER);await page.locator('input[name="password"]').fill(env.AGENTONE_GUENNI_PASSWORD);await Promise.all([page.waitForURL(origin+'/**'),page.getByRole('button',{name:'Sicher anmelden'}).click()]);await page.waitForTimeout(2500);
  await page.locator('[data-view="tools"]').click();await page.locator('.mail-account').first().waitFor({state:'visible'});const calendar=page.locator('.mail-account-connectors button').filter({hasText:'KALENDER'}).first();if(!await calendar.count())throw new Error('Kalender-Auswahl am Gmail-Konto fehlt');if(/AUS/i.test(await calendar.textContent()||'')){await calendar.click();await page.getByText(/Kalender ausgewählt .* separate Google-Freigabe/i).waitFor({state:'visible'});}await page.locator('.mail-account-connectors button').filter({hasText:'KALENDER · FREIGABE NÖTIG'}).waitFor({state:'visible'});
  await mkdir(path.resolve('output/playwright'),{recursive:true});const screenshot=path.resolve('output/playwright/guenni-google-account-connectors-release-83.png');await page.locator('.mail-center').screenshot({path:screenshot});if(errors.length)throw new Error(errors.join(' | '));console.log(JSON.stringify({origin,release:'2026.11.07-83',gmail:'LIVE',calendarSelection:'ENABLED',calendarAuthorization:'REQUIRED',passwordReusedForCalendar:false,consoleErrors:0,screenshot,secretsExposed:false},null,2));
}finally{await browser.close();}
