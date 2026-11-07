import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const origin=String(env.AGENTONE_GUENNI_ORIGIN||'').replace(/\/$/,'');
const user=env.AGENTONE_GUENNI_USER;
const password=env.AGENTONE_GUENNI_PASSWORD;
if(!origin||!user||!password)throw new Error('Günni Live-Smoke-Konfiguration ist unvollständig.');
if(new URL(origin).protocol!=='https:')throw new Error('Die öffentliche iPhone-Abnahme benötigt HTTPS.');

const chrome=await chromium.launch({channel:'chrome',headless:true});
const safari=await webkit.launch({headless:true});
const admin=await chrome.newContext({viewport:{width:1280,height:900}});
const iphone=await safari.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'});
const adminPage=await admin.newPage(),iphonePage=await iphone.newPage(),errors=[];
for(const [name,page] of [['admin',adminPage],['webkit',iphonePage]]){
  page.on('pageerror',error=>errors.push(`${name}:${error.message}`));
  page.on('console',message=>{if(message.type()==='error')errors.push(`${name}:${message.text()}`);});
}

try{
  await adminPage.goto(`${origin}/login`,{waitUntil:'networkidle'});
  await adminPage.locator('#username').fill(user);
  await adminPage.locator('#password').fill(password);
  await Promise.all([adminPage.waitForURL(`${origin}/`),adminPage.getByRole('button',{name:'Sicher anmelden'}).click()]);
  const releaseResponse=await admin.request.get(`${origin}/agentone/release.json?smoke=iphone-readonly`),release=await releaseResponse.json();
  if(releaseResponse.status()!==200||!/^2026\.11\.07-\d+$/.test(String(release.release||'')))throw new Error('Release-Metadaten sind nicht verfügbar.');
  await adminPage.locator('[data-view="private-access"]').click();
  const apple=adminPage.locator('.card.apple-quickstart');
  await apple.waitFor();
  const pairButton=apple.locator('#apple-pair-now');
  if(!await pairButton.isEnabled())throw new Error('Pairing-Code-Schaltfläche ist nicht bedienbar.');
  const overall=String(await apple.locator('#apple-overall-status').innerText()).trim();
  if(!['BEREIT','VERBUNDEN','CODE OFFEN'].includes(overall))throw new Error(`Apple-Schnellstart meldet ${overall||'keinen Status'}.`);
  const qrResponse=await admin.request.get(`${origin}/agentone/companion/base-qr.svg`),qrSvg=await qrResponse.text();
  if(qrResponse.status()!==200||!/image\/svg\+xml/.test(String(qrResponse.headers()['content-type']||''))||!/default-src 'none'/.test(String(qrResponse.headers()['content-security-policy']||'')))throw new Error('Secret-freier iPhone-QR ist nicht sicher erreichbar.');
  if(/token=|#code=|pairing-code|device-token|secret|\b\d{6}\b/i.test(qrSvg))throw new Error('QR enthält Pairing- oder Secret-Marker.');

  await iphonePage.goto(`${origin}/iphone`,{waitUntil:'networkidle'});
  await iphonePage.locator('#pair-capabilities').filter({hasText:'IPHONE BEREIT'}).waitFor();
  const diagnostic=await iphonePage.locator('#pair-diagnostic').innerText();
  if(!/AES-GCM\/IndexedDB verifiziert/.test(diagnostic))throw new Error(`Safari-Speicherdiagnose unvollständig: ${diagnostic}`);
  if(!await iphonePage.locator('#pair-submit').isEnabled())throw new Error('Safari-Pairing bleibt trotz sicherem Tresor gesperrt.');
  if(new URL(iphonePage.url()).hash||new URL(iphonePage.url()).search)throw new Error('Öffentliche Pairing-Basis enthält unerwartete URL-Daten.');
  const metrics=await iphonePage.evaluate(()=>({secure:isSecureContext,innerWidth,scrollWidth:document.documentElement.scrollWidth,minTouch:Math.min(...[...document.querySelectorAll('button,a.button')].filter(node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden';}).map(node=>Math.round(node.getBoundingClientRect().height)))}));
  if(!metrics.secure||metrics.scrollWidth>metrics.innerWidth||metrics.minTouch<44)throw new Error(`Safari-Mobile-Layout ist nicht bereit: ${JSON.stringify(metrics)}`);
  const body=await iphonePage.locator('body').innerText();
  if(!/Safari und Home-Bildschirm-App besitzen getrennte Speicher/.test(body)||!/Pairing klappt nicht\?/.test(body))throw new Error('Safari/PWA-Hilfe fehlt.');
  await mkdir(path.resolve('output/playwright'),{recursive:true});
  const screenshot=path.resolve('output/playwright/guenni-iphone-readonly-webkit.png');
  await iphonePage.screenshot({path:screenshot,fullPage:true});
  if(errors.length)throw new Error(`Browserfehler: ${errors.join(' | ')}`);
  console.log(JSON.stringify({schema:'agentone.iphone-readonly-smoke/v1',origin,release:release.release,mode:'READ_ONLY',engine:'webkit',adminStatus:overall,https:true,secureVaultPreflight:true,qrSecretFree:true,horizontalOverflow:false,minTouchHeight:metrics.minTouch,consoleErrors:0,screenshot,secretsExposed:false,status:'PASS'},null,2));
}finally{
  await admin.close();await iphone.close();await chrome.close();await safari.close();
}
