import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const root=path.resolve('.'),env=loadEnv(root),host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,origin=String(env.AGENTONE_GUENNI_ORIGIN||'').replace(/\/$/,''),login=env.AGENTONE_GUENNI_USER,password=env.AGENTONE_GUENNI_PASSWORD,knownHosts=path.resolve('output/demo/known_hosts');
if(!host||!user||!key||!origin||!login||!password)throw new Error('Günni WebGUI-/SSH-Konfiguration fehlt.');
const identity=`${login}@agentone.private`,ordinaryScopes=['operator.read','operator.write','operator.approvals','operator.questions'],adminScopes=['operator.admin'];
const common=['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`];
function ssh(command,timeout=180_000){const result=spawnSync('ssh',[...common,command],{encoding:'utf8',timeout,maxBuffer:8_000_000});if(result.status!==0)throw new Error(`Günni Gateway-Aktion fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-800)}`);return result.stdout||'';}
function setIdentityScopes(scopes){
  const batch=Buffer.from(JSON.stringify([{path:'gateway.auth.identityScopes',value:{[identity]:scopes}}])).toString('base64');
  return ssh(`set -eu; c=$(docker ps -a --format '{{.Names}}' | grep '^guenni-gateway-' | head -1); test -n "$c"; cfg=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/node/.openclaw"}}{{.Name}}{{end}}{{end}}' "$c"); ws=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/node/.openclaw/workspace"}}{{.Name}}{{end}}{{end}}' "$c"); test -n "$cfg"; test -n "$ws"; payload=$(printf '%s' '${batch}' | base64 -d); docker stop "$c" >/dev/null; rc=0; docker run --rm -e HOME=/home/node -e OPENCLAW_STATE_DIR=/home/node/.openclaw -e OPENCLAW_CONFIG_PATH=/home/node/.openclaw/openclaw.json -v "$cfg":/home/node/.openclaw -v "$ws":/home/node/.openclaw/workspace --entrypoint node ghcr.io/openclaw/openclaw:2026.10.8 dist/index.js config set --batch-json "$payload" >/dev/null || rc=$?; docker start "$c" >/dev/null; exit $rc`);
}
async function waitForGateway(){for(let attempt=0;attempt<60;attempt+=1){try{const response=await fetch(`${origin}/login`,{redirect:'manual',signal:AbortSignal.timeout(4_000)});if(response.status===200)return;}catch{}await new Promise(resolve=>setTimeout(resolve,2_000));}throw new Error('Günni WebGUI wurde nach Scope-Wechsel nicht bereit.');}
async function openPluginPage(page){
  const url=`${origin}/plugins/ch_QG9wZW5jbGF3L2R1Y2tkdWNrZ28tcGx1Z2lu?agentone_native=1`;
  for(let attempt=0;attempt<60;attempt+=1){
    try{const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:15_000});if(response?.ok()){await page.getByRole('region',{name:/DuckDuckGo/i}).waitFor();return;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,2_000));
  }
  throw new Error('Günnis OpenClaw-Pluginroute blieb nach dem Scope-Wechsel nicht erreichbar.');
}
async function runtimePlugin(attempts=30){
  for(let attempt=0;attempt<attempts;attempt+=1){
    const output=ssh(`c=$(docker ps --format '{{.Names}}' | grep '^guenni-gateway-' | head -1); docker exec "$c" node dist/index.js plugins list --json`,60_000);
    try{const inventory=JSON.parse(output),plugin=(inventory.plugins||[]).find(item=>/duckduckgo/i.test(`${item.id} ${item.name} ${item.description}`));if(plugin)return plugin;}catch{}
    await new Promise(resolve=>setTimeout(resolve,2_000));
  }
  throw new Error('DuckDuckGo-Plugin fehlt nach WebGUI-Installation im Runtime-Inventar.');
}

let browser,page,adminGranted=false;
const screenshot=path.resolve('output/playwright/guenni-openclaw-duckduckgo-webgui.png');
fs.mkdirSync(path.dirname(screenshot),{recursive:true});
try{
  setIdentityScopes(adminScopes);adminGranted=true;await waitForGateway();
  browser=await chromium.launch({channel:'chrome',headless:true});
  page=await browser.newPage({viewport:{width:1440,height:1000},locale:'de-DE'});page.setDefaultTimeout(90_000);
  const diagnostics={dialogs:[],responses:[],console:[],websocket:{opened:0,sent:[],receivedErrors:[],socketErrors:[]}};
  page.on('dialog',async dialog=>{const message=dialog.message();diagnostics.dialogs.push({type:dialog.type(),message:message.slice(0,500)});if(/(?:shell|host filesystem|payment|wallet|native ui)/i.test(message))await dialog.dismiss();else await dialog.accept();});
  page.on('response',response=>{if(response.status()>=400||/plugin|rpc/i.test(response.url()))diagnostics.responses.push({status:response.status(),method:response.request().method(),url:response.url().split('?')[0]});});
  page.on('console',message=>{if(['error','warning'].includes(message.type()))diagnostics.console.push({type:message.type(),text:message.text().slice(0,500)});});
  page.on('websocket',socket=>{diagnostics.websocket.opened+=1;socket.on('framesent',event=>{try{const frame=JSON.parse(String(event.payload||''));diagnostics.websocket.sent.push({type:frame.type||null,method:frame.method||null,id:frame.id||null});}catch{}});socket.on('framereceived',event=>{try{const frame=JSON.parse(String(event.payload||''));if(frame.error)diagnostics.websocket.receivedErrors.push({id:frame.id||null,code:String(frame.error.code||'').slice(0,100),message:String(frame.error.message||'').slice(0,300)});}catch{}});socket.on('socketerror',error=>diagnostics.websocket.socketErrors.push(String(error||'').slice(0,300)));});
  await page.goto(`${origin}/login`,{waitUntil:'networkidle'});await page.locator('#username').fill(login);await page.locator('#password').fill(password);await Promise.all([page.waitForURL(`${origin}/`),page.getByRole('button',{name:'Sicher anmelden'}).click()]);
  await openPluginPage(page);
  const region=page.getByRole('region',{name:/DuckDuckGo/i});
  const publisher=region.getByRole('link',{name:'@openclaw'});
  if(await publisher.count()===0||!/clawhub\.ai\/openclaw/.test(String(await publisher.first().getAttribute('href'))))throw new Error('Installation abgebrochen: DuckDuckGo-Paket stammt nicht vom erwarteten OpenClaw-Publisher.');
  const install=region.getByRole('button',{name:'Installieren',exact:true});
  if(await install.count()){
    if(!await install.isVisible()||await install.isDisabled())throw new Error('DuckDuckGo-Installation ist trotz temporärem operator.admin nicht sichtbar oder deaktiviert.');
    await install.click({trial:true});
    await install.click();
    const dialog=page.getByRole('dialog');
    const reviewVisible=await dialog.waitFor({state:'visible',timeout:8_000}).then(()=>true).catch(()=>false);
    if(reviewVisible){
      const review=(await dialog.innerText()).toLowerCase();
      if(/(?:shell|host filesystem|payment|wallet|native ui)/.test(review))throw new Error('Installation abgebrochen: unerwartete Hochrisiko-Fähigkeit in der Capability-Prüfung.');
      const confirm=dialog.getByRole('button',{name:/^(?:Installieren|Akzeptieren|Trotzdem installieren|Install anyway)$/i}).last();
      if(await confirm.count())await confirm.click();
    }
  }
  await page.waitForTimeout(5_000);
  const diagnostic=(await page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,12_000);
  fs.writeFileSync(path.resolve('output/demo/guenni-duckduckgo-webgui-state.txt'),diagnostic+'\n');
  fs.writeFileSync(path.resolve('output/demo/guenni-duckduckgo-webgui-diagnostics.json'),JSON.stringify(diagnostics,null,2)+'\n');
  await page.screenshot({path:screenshot,fullPage:true});
  const livePlugin=await runtimePlugin(5);
  if(livePlugin.status!=='loaded'||livePlugin.enabled!==true)throw new Error(`DuckDuckGo Runtime ist nach der WebGUI-Aktion nicht aktiv: ${livePlugin.status}`);
  await page.reload({waitUntil:'domcontentloaded'}).catch(()=>{});
}finally{
  await browser?.close();
  if(adminGranted){setIdentityScopes(ordinaryScopes);await waitForGateway();}
}
const plugin=await runtimePlugin();
if(plugin.status!=='loaded'||plugin.enabled!==true)throw new Error(`DuckDuckGo Runtime ist nicht aktiv: ${plugin.status}`);
process.stdout.write(JSON.stringify({ok:true,instance:'guenni',plugin:{id:plugin.id,name:plugin.name,status:plugin.status,enabled:plugin.enabled,origin:plugin.origin},installedVia:'OpenClaw Control UI',temporaryAdminRemoved:true,persistent:true,screenshot,secretsExposed:false})+'\n');
