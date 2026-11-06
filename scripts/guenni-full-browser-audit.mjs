import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const origin=env.AGENTONE_GUENNI_ORIGIN;
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const browserErrors=[];
page.on('console',message=>{if(message.type()==='error')browserErrors.push(message.text());});
page.on('pageerror',error=>browserErrors.push(error.message));
const result={origin,navigation:[],toolButtons:[],chat:{},gmail:{},browserErrors};
try{
  await page.goto(`${origin}/login`,{waitUntil:'networkidle'});
  await page.locator('#username').fill(env.AGENTONE_GUENNI_USER);
  await page.locator('#password').fill(env.AGENTONE_GUENNI_PASSWORD);
  await Promise.all([page.waitForURL(`${origin}/`),page.getByRole('button',{name:'Sicher anmelden'}).click()]);
  for(const button of await page.locator('.rail button[data-view]').all()){
    const id=await button.getAttribute('data-view'),label=await button.getAttribute('aria-label'),symbol=(await button.textContent())?.trim();
    await button.click();
    result.navigation.push({id,label,symbol,active:await page.locator(`#${id}.active`).count()===1});
  }
  await page.locator('[data-view="tools"]').click();
  const setupButtons=page.locator('#tools .personal-section-grid .personal-action');
  for(let index=0;index<await setupButtons.count();index++){
    const button=setupButtons.nth(index),card=button.locator('xpath=ancestor::article[1]'),title=(await card.locator('h3').textContent())?.trim();
    const before=await page.locator('.view.active').getAttribute('id');
    await button.click();await page.waitForTimeout(120);
    result.toolButtons.push({title,connector:await button.getAttribute('data-connector'),dialog:await page.locator('.personal-setup[open],.mail-setup[open]').count()>0,viewBefore:before,viewAfter:await page.locator('.view.active').getAttribute('id')});
    for(const dialog of await page.locator('dialog[open]').all())await dialog.locator('.setup-close,.mail-close').first().click();
  }
  await page.locator('[data-view="chat"]').click();
  const composer=page.locator('#native-chat-input');
  await composer.waitFor({timeout:20_000});
  result.chat.native=await page.locator('.native-chat').count()===1;
  const marker=`GUENNI_BROWSER_OK_${Date.now()}`;
  result.chat.marker=marker;
  await composer.fill(`Antworte exakt mit ${marker}`);
  const send=page.locator('#native-chat-send');
  result.chat.sendEnabled=await send.isEnabled();
  await send.click();
  await page.locator('.native-chat-message.agent').filter({hasText:marker}).waitFor({timeout:60_000});
  result.chat.reply='PASS';
  result.chat.answer=(await page.locator('.native-chat-message.agent').last().textContent())?.trim();
  const trace=page.locator('.native-chat-trace').last();await trace.filter({hasText:/gpt-6-(luna|1\.1-sol)/}).waitFor();await trace.filter({hasText:/\d+ ms/}).waitFor();result.chat.trace=(await trace.textContent())?.trim();
  await mkdir(path.resolve('output/playwright'),{recursive:true});
  result.chat.screenshot=path.resolve('output/playwright/guenni-native-chat-release-77.png');
  await page.screenshot({path:result.chat.screenshot,fullPage:true});
  await page.locator('[data-view="tools"]').click();
  const gmail=page.locator('#google-oauth');await gmail.click();
  result.gmail.dialog=await page.locator('.mail-setup[open]').count()===1;
  result.gmail.provider=await page.locator('.mail-setup[open] [name="provider"]').inputValue();
  result.gmail.fields=await page.locator('.mail-setup[open] input').evaluateAll(nodes=>nodes.map(node=>({name:node.name,type:node.type,required:node.required})));
  const mailState=await page.evaluate(async()=>({accounts:await fetch('/agentone/mail/accounts').then(response=>response.json()),google:await fetch('/agentone/google/status').then(response=>response.json())}));
  result.gmail.accountCount=mailState.accounts.accounts?.length||0;
  result.gmail.openClawImap=mailState.accounts.plugin?.status||'UNKNOWN';
  result.gmail.oauthConfigured=Boolean(mailState.google.configured);
  if(result.gmail.accountCount){
    await page.locator('.mail-setup[open] .mail-close').first().click();
    await page.locator('.mail-account').first().getByRole('button',{name:'Testen'}).click();
    await page.locator('#mail-center-status').filter({hasText:/IMAP OK/}).waitFor({timeout:40_000});
    result.gmail.liveConnectionTest='PASS';
    await page.locator('.mail-account').first().getByRole('button',{name:'Gruppieren'}).click();
    await page.locator('#mail-center-status').filter({hasText:/IMAP OK/}).waitFor({timeout:40_000});
    result.gmail.readOnlyGrouping='PASS';
  }else result.gmail.liveConnectionTest='NOT_CONFIGURED';
  await page.screenshot({path:path.resolve('output/playwright/guenni-full-audit.png'),fullPage:true});
  console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
