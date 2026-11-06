import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const base='http://127.0.0.1:4173';
const env=loadEnv(path.resolve('.'));
const target=path.resolve('output/demo/screenshots');
fs.mkdirSync(target,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});

async function capture(file,url,ready){
  await page.goto(`${base}${url}`,{waitUntil:'networkidle'});
  await page.getByText(ready,{exact:false}).first().waitFor();
  await page.screenshot({path:path.join(target,file),fullPage:true});
}

try{
  await capture('01-login-dark.png','/','Jede Welt hat');
  if(await page.getByLabel('Benutzername').count()){
    await page.getByLabel('Benutzername').fill(env.AGENTONE_LOGIN_USER||env.AGENTONE_MOBILE_USER||'marcus');
    await page.getByLabel('Passwort').fill(env.AGENTONE_LOGIN_PASSWORD||env.AGENTONE_MOBILE_PASSWORD||'');
    await page.getByRole('button',{name:/Sicher anmelden/}).click();
  }else{
    await page.getByRole('button',{name:/Marcus Wartenberg/}).click();
    await page.getByRole('button',{name:/Mit PureLink Demo fortfahren/}).click();
  }
  await page.getByRole('button',{name:/Welten/}).waitFor({timeout:10_000});
  await page.getByRole('button',{name:/Welten/}).click();
  await page.getByText('Vier Welten. Vier AgentOne.').waitFor({timeout:10_000});
  await capture('02-worlds-dark.png','/?shot=worlds-dark','Vier Welten. Vier AgentOne.');
  await capture('03-world-inside-dark.png','/?shot=inside-dark','eine Welt, ein AgentOne.');
  await capture('04-personal-dark.png','/?shot=personal-dark','Ein AgentOne für deine Themen.');
  await capture('05-admin-dark.png','/?shot=admin-dark','Drei Benutzer. Drei Vertrauensgrenzen.');
  await page.getByRole('button',{name:'Inventar laden'}).click();
  await page.getByText(/Secret-Namen geladen/).waitFor();
  await page.screenshot({path:path.join(target,'05-admin-dark.png'),fullPage:true});
  await capture('06-integrations-dark.png','/?shot=integrations-dark','Live, wenn sicher. Simulation, wenn nötig.');
  await capture('07-worlds-light.png','/?shot=worlds-light','Vier Welten. Vier AgentOne.');
  await capture('08-personal-light.png','/?shot=personal-light','Ein AgentOne für deine Themen.');
  await capture('09-admin-light.png','/?shot=admin-light','Drei Benutzer. Drei Vertrauensgrenzen.');
  await page.getByRole('button',{name:'Inventar laden'}).click();
  await page.getByText(/Secret-Namen geladen/).waitFor();
  await page.screenshot({path:path.join(target,'09-admin-light.png'),fullPage:true});
  await capture('10-platform-dark.png','/?page=platform&theme=dark&demo=1','Workflows bis zur letzten Übergabe.');
  await capture('11-platform-light.png','/?page=platform&theme=light&demo=1','Workflows bis zur letzten Übergabe.');
  console.log(`Screenshots aktualisiert: ${target}`);
}finally{await browser.close();}
