import path from 'node:path';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),origin=env.AGENTONE_GUENNI_ORIGIN;
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  await page.goto(`${origin}/login`);
  await page.locator('#username').fill(env.AGENTONE_GUENNI_USER);
  await page.locator('#password').fill(env.AGENTONE_GUENNI_PASSWORD);
  await Promise.all([page.waitForURL(`${origin}/`),page.getByRole('button',{name:'Sicher anmelden'}).click()]);
  const test=await page.evaluate(()=>fetch('/agentone/home-connector/test',{method:'POST'}).then(async response=>({ok:response.ok,data:await response.json()})));
  if(!test.ok)throw new Error(`Connector-Test fehlgeschlagen: ${JSON.stringify(test.data).slice(0,180)}`);
  await page.waitForTimeout(800);
  const governance=await page.evaluate(()=>fetch('/agentone/governance').then(response=>response.json()));
  const event=governance.audit?.find(item=>item.action==='HOME.CONNECTOR.TEST');
  if(!event||event.outcome!=='OK')throw new Error('Persistenter Home-Connector-Audit fehlt');
  if(governance.containsSecrets!==false||/(token|password|authorization|cookie)\s*[=:]\s*(?!\[REDACTED\])/i.test(JSON.stringify(governance)))throw new Error('Audit enthält unzulässige Secret-Daten');
  console.log(JSON.stringify({origin,release:'2026.11.06-77',connectorTest:test.data.status,auditAction:event.action,auditOutcome:event.outcome,auditEntries:governance.audit.length,secretsExposed:false},null,2));
}finally{await browser.close();}
