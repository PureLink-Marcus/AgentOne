import path from 'node:path';
import crypto from 'node:crypto';
import { chromium, webkit } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const origin=String(env.AGENTONE_GUENNI_ORIGIN||'').replace(/\/$/,'');
const user=env.AGENTONE_GUENNI_USER;
const password=env.AGENTONE_GUENNI_PASSWORD;
if(!origin||!user||!password)throw new Error('Günni Live-Smoke-Konfiguration ist unvollständig.');
if(new URL(origin).protocol!=='https:')throw new Error('Der Safari/WebKit-Smoke benötigt eine HTTPS-Instanz.');
if(env.AGENTONE_LIVE_PAIRING_MUTATION!=='DEDICATED_TEST_INSTANCE')throw new Error('Mutierender WebKit-Live-Smoke ist auf einer Benutzerinstanz gesperrt. Nutze den read-only Live-Smoke oder eine dedizierte Testinstanz.');

const chromiumBrowser=await chromium.launch({channel:'chrome',headless:true});
const webkitBrowser=await webkit.launch({headless:true});
const admin=await chromiumBrowser.newContext({viewport:{width:1280,height:900}});
const iphone=await webkitBrowser.newContext({
  viewport:{width:390,height:844},
  deviceScaleFactor:2,
  isMobile:true,
  hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
});
const adminPage=await admin.newPage(),iphonePage=await iphone.newPage(),browserErrors=[];
for(const [name,page] of [['admin',adminPage],['webkit',iphonePage]]){
  page.on('pageerror',error=>browserErrors.push(`${name}:${error.message}`));
  page.on('console',message=>{if(message.type()==='error'&&!/status of 401/.test(message.text()))browserErrors.push(`${name}:${message.text()}`);});
}

let deviceId='',deviceToken='',pairCode='',revoked=false;
try{
  await adminPage.goto(`${origin}/login`,{waitUntil:'networkidle'});
  await adminPage.locator('#username').fill(user);
  await adminPage.locator('#password').fill(password);
  await Promise.all([adminPage.waitForURL(`${origin}/`),adminPage.getByRole('button',{name:'Sicher anmelden'}).click()]);
  await adminPage.locator('[data-view="private-access"]').click();
  const apple=adminPage.locator('.card.apple-quickstart');
  await apple.waitFor();
  const healthScope=apple.locator('.apple-scope[value="health.summary"]');
  if(await healthScope.count())await healthScope.uncheck();
  await apple.locator('#apple-pair-now').click();
  const result=apple.locator('#apple-pair-result').filter({hasText:'PAIRING-CODE'});
  await result.waitFor();
  pairCode=(await result.innerText()).match(/PAIRING-CODE\s*·\s*(\d{6})/)?.[1]||'';
  if(!/^\d{6}$/.test(pairCode))throw new Error('WebKit-Smoke erhielt keinen Pairing-Code.');

  let confirmRequests=0;
  iphonePage.on('request',request=>{if(request.url()===`${origin}/agentone/companion/confirm`)confirmRequests+=1;});
  await iphonePage.goto(`${origin}/iphone#code=${pairCode}`,{waitUntil:'networkidle'});
  await iphonePage.locator('#pair-capabilities').filter({hasText:'IPHONE BEREIT'}).waitFor();
  if(iphonePage.url().includes('#')||iphonePage.url().includes(pairCode))throw new Error('Pairing-Code blieb in der WebKit-URL sichtbar.');
  if(await iphonePage.locator('#pair-code').inputValue()!==pairCode)throw new Error('WebKit übernahm den Fragment-Code nicht.');
  const diagnostic=await iphonePage.locator('#pair-diagnostic').innerText();
  if(!/AES-GCM\/IndexedDB verifiziert/.test(diagnostic))throw new Error(`WebKit-Speicherdiagnose unvollständig: ${diagnostic}`);
  const deviceName=`WebKit iPhone ${crypto.randomBytes(3).toString('hex')}`;
  await iphonePage.locator('#device-name').fill(deviceName);
  const confirmPromise=iphonePage.waitForResponse(response=>response.url()===`${origin}/agentone/companion/confirm`&&response.request().method()==='POST');
  await iphonePage.locator('#pair-submit').click();
  const confirm=await confirmPromise,confirmPayload=await confirm.json();
  deviceId=String(confirmPayload.device?.deviceId||'');
  deviceToken=String(confirmPayload.device?.deviceToken||'');
  if(confirm.status()!==201||confirmRequests!==1||!deviceId||!/^a1d_[A-Za-z0-9_-]{40,100}$/.test(deviceToken))throw new Error(`WebKit-Confirm unvollständig (HTTP ${confirm.status()}).`);
  await iphonePage.locator('#pair-status').filter({hasText:'VERBUNDEN'}).waitFor();
  const vault=await iphonePage.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('agentone-companion-v1',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('secrets','readonly'),store=tx.objectStore('secrets'),tokenRequest=store.get('device-token'),keyRequest=store.get('wrap-key');tx.onerror=()=>reject(tx.error);tx.oncomplete=()=>{const token=tokenRequest.result,key=keyRequest.result;db.close();resolve({tokenVersion:token?.version,tokenAlgorithm:token?.algorithm,ciphertextBytes:Array.isArray(token?.ciphertext)?token.ciphertext.length:0,plaintextToken:typeof token==='string',keyType:key?.type,keyAlgorithm:key?.algorithm?.name,keyExtractable:key?.extractable});};};}));
  if(vault.tokenVersion!==1||vault.tokenAlgorithm!=='AES-GCM'||vault.ciphertextBytes<40||vault.plaintextToken||vault.keyType!=='secret'||vault.keyAlgorithm!=='AES-GCM'||vault.keyExtractable!==false)throw new Error(`WebKit-Vault nicht sicher: ${JSON.stringify(vault)}`);
  const visible=await iphonePage.locator('body').innerText();
  if(visible.includes(pairCode)||visible.includes(deviceToken))throw new Error('Pairing-Secret blieb im sichtbaren WebKit-UI.');
  await iphonePage.reload({waitUntil:'networkidle'});
  await iphonePage.locator('#pair-status').filter({hasText:'VERBUNDEN'}).waitFor();
  iphonePage.once('dialog',dialog=>dialog.accept());
  const revokePromise=iphonePage.waitForResponse(response=>response.url()===`${origin}/agentone/companion/self`&&response.request().method()==='DELETE');
  await iphonePage.locator('#local-disconnect').click();
  const revoke=await revokePromise;
  if(revoke.status()!==200)throw new Error(`WebKit-Self-Revoke HTTP ${revoke.status()}`);
  revoked=true;
  await iphonePage.locator('#pair-status').filter({hasText:'SICHER GETRENNT'}).waitFor();
  const retained=await iphonePage.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('agentone-companion-v1',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('secrets','readonly'),get=tx.objectStore('secrets').get('device-token');get.onerror=()=>reject(get.error);get.onsuccess=()=>resolve(Boolean(get.result));tx.oncomplete=()=>db.close();};}));
  if(retained)throw new Error('WebKit behielt den widerrufenen Gerätetoken.');
  if(browserErrors.length)throw new Error(`WebKit-Browserfehler: ${browserErrors.join(' | ')}`);
  console.log(JSON.stringify({schema:'agentone.iphone-webkit-smoke/v1',origin,engine:'webkit',viewport:'390x844',fragmentClearedBeforeNetwork:true,encryptedIndexedDb:true,nonExtractableWrapKey:true,reloadRestored:true,selfRevoked:true,consoleErrors:0,secretsExposed:false,status:'PASS'},null,2));
}finally{
  if(deviceId&&!revoked)await admin.request.delete(`${origin}/agentone/companion/devices/${encodeURIComponent(deviceId)}`,{headers:{origin,accept:'application/json'}}).catch(()=>{});
  deviceToken='';pairCode='';
  await admin.close();await iphone.close();await chromiumBrowser.close();await webkitBrowser.close();
}
