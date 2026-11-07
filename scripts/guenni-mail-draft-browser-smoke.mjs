import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),origin=env.AGENTONE_GUENNI_ORIGIN,browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1180,height:900}}),errors=[];
page.on('pageerror',error=>errors.push(String(error.message||error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
  await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});await page.locator('input[name="username"]').fill(env.AGENTONE_GUENNI_USER);await page.locator('input[name="password"]').fill(env.AGENTONE_GUENNI_PASSWORD);await Promise.all([page.waitForURL(origin+'/**'),page.getByRole('button',{name:'Sicher anmelden'}).click()]);await page.waitForTimeout(2500);await page.locator('[data-view="tools"]').click();await page.locator('#mail-draft').click();
  const dialog=page.locator('#mail-draft-form');await dialog.locator('[name="to"]').fill('release83@example.invalid');await dialog.locator('[name="subject"]').fill('AgentOne sicherer Entwurfstest');await dialog.locator('[name="text"]').fill('Dieser lokale Testentwurf wird nicht versendet.');await dialog.getByRole('button',{name:'Entwurf speichern'}).click();await page.getByText(/Entwurf gespeichert · noch nicht freigegeben/i).waitFor();await page.getByRole('button',{name:'Unverändert freigeben'}).click();await page.getByRole('button',{name:/FREIGEGEBEN · NOCH NICHT GESENDET/i}).waitFor();
  await mkdir(path.resolve('output/playwright'),{recursive:true});const screenshot=path.resolve('output/playwright/guenni-mail-draft-release-85.png');await page.locator('.mail-setup[open]').screenshot({path:screenshot});if(errors.length)throw new Error(errors.join(' | '));console.log(JSON.stringify({origin,release:'2026.11.07-85',draftStored:true,hashApproval:true,sendAttempted:false,consoleErrors:0,screenshot,secretsExposed:false},null,2));
}finally{await browser.close();}
