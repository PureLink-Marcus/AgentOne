import http from 'node:http';
import { once } from 'node:events';
import { webkit } from 'playwright';
import { companionPairHtml, companionPairJs, companionPairManifest } from '../server/companion-pair-page.mjs';

const code='654321',deviceToken='a1d_'+Buffer.alloc(32,17).toString('base64url');
let paired=false,revoked=false,confirmRequests=0;
const json=(res,status,payload)=>{const body=JSON.stringify(payload);res.writeHead(status,{'content-type':'application/json','content-length':Buffer.byteLength(body),'cache-control':'no-store'});res.end(body);};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET'&&url.pathname==='/iphone'){const body=companionPairHtml({displayName:'Günni',release:'webkit-local'});res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store'});return res.end(body);}
  if(req.method==='GET'&&url.pathname==='/agentone/companion-app.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','content-length':Buffer.byteLength(companionPairJs),'cache-control':'no-store'});return res.end(companionPairJs);}
  if(req.method==='GET'&&url.pathname==='/agentone/companion.webmanifest'){const body=companionPairManifest({displayName:'Günni'});res.writeHead(200,{'content-type':'application/manifest+json','content-length':Buffer.byteLength(body)});return res.end(body);}
  if(req.method==='GET'&&url.pathname==='/agentone/icon.svg'){const body='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#005ae5"/></svg>';res.writeHead(200,{'content-type':'image/svg+xml','content-length':Buffer.byteLength(body)});return res.end(body);}
  if(req.method==='GET'&&url.pathname.startsWith('/agentone/fonts/')){res.writeHead(404);return res.end();}
  if(req.method==='GET'&&url.pathname==='/service-worker.js'){const body="self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));";res.writeHead(200,{'content-type':'text/javascript','service-worker-allowed':'/','content-length':Buffer.byteLength(body)});return res.end(body);}
  if(req.method==='POST'&&url.pathname==='/agentone/companion/confirm'){
    confirmRequests+=1;let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw||'{}');
    if(input.code!==code)return json(res,401,{error:'PAIRING_CODE_INVALID_OR_EXPIRED',secretsExposed:false});
    paired=true;return json(res,201,{device:{deviceId:'webkit-device',deviceToken,scopes:['calendar.read'],shownOnce:true},status:'CONNECTED',secretsExposed:false});
  }
  if(req.method==='GET'&&url.pathname==='/agentone/companion/status'){
    if(!paired||revoked||req.headers['x-agentone-device-token']!==deviceToken)return json(res,401,{error:'DEVICE_NOT_AUTHORIZED',secretsExposed:false});
    return json(res,200,{status:'CONNECTED',device:{id:'webkit-device',name:'WebKit iPhone',scopes:['calendar.read'],pairedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString()},secretsExposed:false});
  }
  if(req.method==='DELETE'&&url.pathname==='/agentone/companion/self'){
    if(req.headers['x-agentone-device-token']!==deviceToken)return json(res,401,{error:'DEVICE_NOT_AUTHORIZED',secretsExposed:false});
    revoked=true;return json(res,200,{revoked:true,eventsDeleted:0,secretsExposed:false});
  }
  res.writeHead(404);res.end();
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await webkit.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(`${origin}/iphone#code=${code}`,{waitUntil:'networkidle'});
  await page.locator('#pair-capabilities').filter({hasText:'IPHONE BEREIT'}).waitFor();
  if(!await page.evaluate(()=>isSecureContext))throw new Error('localhost ist in WebKit kein sicherer Kontext.');
  if(page.url().includes(code)||page.url().includes('#'))throw new Error('Fragment-Code blieb in der URL.');
  if(await page.locator('#pair-code').inputValue()!==code)throw new Error('Fragment-Code wurde nicht übernommen.');
  if(!/AES-GCM\/IndexedDB verifiziert/.test(await page.locator('#pair-diagnostic').innerText()))throw new Error('WebKit-Vault wurde nicht vorab verifiziert.');
  await page.locator('#device-name').fill('WebKit iPhone');
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/agentone/companion/confirm'));
  await page.locator('#pair-submit').click();const response=await responsePromise;
  if(response.status()!==201||confirmRequests!==1)throw new Error(`Pairing-Confirm fehlgeschlagen (${response.status()}).`);
  await page.locator('#pair-status').filter({hasText:'VERBUNDEN'}).waitFor();
  const vault=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('agentone-companion-v1',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('secrets','readonly'),token=tx.objectStore('secrets').get('device-token'),key=tx.objectStore('secrets').get('wrap-key');tx.oncomplete=()=>{resolve({token:token.result,key:{type:key.result?.type,algorithm:key.result?.algorithm?.name,extractable:key.result?.extractable}});db.close();};tx.onerror=()=>reject(tx.error);};}));
  if(vault.token?.algorithm!=='AES-GCM'||typeof vault.token==='string'||vault.key.type!=='secret'||vault.key.algorithm!=='AES-GCM'||vault.key.extractable!==false)throw new Error('WebKit-Vault ist nicht sicher verschlüsselt.');
  if((await page.locator('body').innerText()).includes(deviceToken))throw new Error('Gerätetoken ist im DOM sichtbar.');
  await page.reload({waitUntil:'networkidle'});await page.locator('#pair-status').filter({hasText:'VERBUNDEN'}).waitFor();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#local-disconnect').click();await page.locator('#pair-status').filter({hasText:'SICHER GETRENNT'}).waitFor();
  if(!revoked)throw new Error('Serverfreigabe wurde nicht widerrufen.');
  if(errors.length)throw new Error(`WebKit-Seitenfehler: ${errors.join(' | ')}`);
  console.log(JSON.stringify({schema:'agentone.iphone-webkit-local-smoke/v1',engine:'webkit',secureContext:true,fragmentCleared:true,preflightVerified:true,encryptedIndexedDb:true,nonExtractableWrapKey:true,reloadRestored:true,selfRevoked:true,secretsExposed:false,status:'PASS'},null,2));
}finally{
  await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
}
