import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const root=path.resolve('.');
const release='2026.11.06-77';
const masterPath=path.join(root,'master','env','.env.master');
let env=loadEnv(root);
const base=String(env.COOLIFY_HETZNER_URL||env.COOLIFY_URL||'').replace(/\/$/,'');
const token=env.COOLIFY_HETZNER_API_TOKEN||env.COOLIFY_API_TOKEN;
if(!base||!token)throw new Error('Coolify URL oder Token fehlt');
const apiBase=base.endsWith('/api/v1')?base:`${base}/api/v1`;
const headers={authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json'};
async function request(method,route,data){const response=await fetch(`${apiBase}${route}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(30_000)});const text=await response.text();let parsed=null;try{parsed=text?JSON.parse(text):null}catch{parsed={message:text}}if(!response.ok)throw new Error(`${method} ${route}: HTTP ${response.status} ${String(parsed?.message||text).slice(0,240)}`);return parsed;}
function ensure(name,factory){if(env[name])return env[name];const value=factory();fs.appendFileSync(masterPath,`\n${name}=${value}\n`);env={...env,[name]:value};return value;}
const random=()=>crypto.randomBytes(32).toString('base64url');
const openAiKey=env.CrewAI_OpenAI_API_Key||env.STICKER_OPENAI_API_KEY;if(!openAiKey)throw new Error('OpenAI-Key fehlt');
const personalConnectorKeys=['GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CALENDAR_REDIRECT_URI','HOME_ASSISTANT_URL','HOME_ASSISTANT_TOKEN','HOME_CONNECTOR_URL','HOME_CONNECTOR_TOKEN','SPOTIFY_CLIENT_ID','SPOTIFY_CLIENT_SECRET','SPOTIFY_REDIRECT_URI','APPLE_COMPANION_URL','APPLE_COMPANION_TOKEN','DAV_BASE_URL','DAV_USERNAME','DAV_APP_PASSWORD','PERSONAL_IMAP_HOST','PERSONAL_IMAP_USER','PERSONAL_IMAP_PASSWORD','NTFY_URL','NTFY_TOPIC','NTFY_TOKEN','PAPERLESS_URL','PAPERLESS_TOKEN','IMMICH_URL','IMMICH_API_KEY','MEALIE_URL','MEALIE_TOKEN','ACTUAL_BUDGET_URL','ACTUAL_BUDGET_PASSWORD','ACTUAL_BUDGET_SYNC_ID'];
const personalChannelKeys=['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REDIRECT_URI','TWITCH_CLIENT_ID','TWITCH_CLIENT_SECRET','TWITCH_REDIRECT_URI'];
const personalConnectorEnvironment=item=>[...personalConnectorKeys,...personalChannelKeys].map(key=>[key,env[`AGENTONE_${item.id.toUpperCase()}_${key}`]||env[key]]).filter(([,value])=>String(value||'').trim()).map(([key,value])=>`      ${key}: ${JSON.stringify(value)}`).join('\n');
const homeConnectorAccessEnvironment=item=>['HOME_CONNECTOR_URL','HOME_CONNECTOR_TOKEN','HOME_CONNECTOR_TAILSCALE_IP','HOME_CONNECTOR_DNS_NAME','HOME_CONNECTOR_KEY_EXPIRY'].map(key=>[key,env[`AGENTONE_${item.id.toUpperCase()}_${key}`]||env[key]]).filter(([,value])=>String(value||'').trim()).map(([key,value])=>`      ${key}: ${JSON.stringify(value)}`).join('\n');
const googleOAuthAccessEnvironment=item=>['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REDIRECT_URI'].map(key=>[key,env[`AGENTONE_${item.id.toUpperCase()}_${key}`]||env[key]]).filter(([,value])=>String(value||'').trim()).map(([key,value])=>`      ${key}: ${JSON.stringify(value)}`).join('\n');
const instances=[
  {id:'fressi',label:'Fressi',primary:'#d8654f',accent:'#f0b35b',background:'#151116',panel:'#211920',line:'#433039',origin:ensure('AGENTONE_FRESSI_ORIGIN',()=> 'https://fressi.mwart.solutions'),user:ensure('AGENTONE_FRESSI_USER',()=> 'fressi'),password:ensure('AGENTONE_FRESSI_PASSWORD',random),session:ensure('AGENTONE_FRESSI_SESSION_SECRET',random),siri:ensure('AGENTONE_FRESSI_SIRI_API_KEY',random),db:ensure('AGENTONE_FRESSI_POSTGRES_PASSWORD',random)},
  {id:'guenni',label:'Günni',primary:'#7357d9',accent:'#43c3a6',background:'#11121a',panel:'#191b29',line:'#343750',origin:ensure('AGENTONE_GUENNI_ORIGIN',()=> 'https://guenni.mwart.solutions'),user:ensure('AGENTONE_GUENNI_USER',()=> 'guenni'),password:ensure('AGENTONE_GUENNI_PASSWORD',random),session:ensure('AGENTONE_GUENNI_SESSION_SECRET',random),siri:ensure('AGENTONE_GUENNI_SIRI_API_KEY',random),db:ensure('AGENTONE_GUENNI_POSTGRES_PASSWORD',random)}
];
const instanceDirectory=JSON.stringify([{name:'PureLink',url:'https://agentone.purelink.de',type:'business',theme:{primary:'#005ae5',accent:'#35d6c6'},brand:{name:'PureLink',primary:'#005ae5'},active:true},...instances.map(item=>({name:item.label,url:item.origin,type:'personal',theme:{primary:item.primary,accent:item.accent,background:item.background},brand:null,active:true}))]);
for(const item of instances)if(!item.origin.startsWith('https://'))throw new Error(`HTTPS erforderlich: ${item.id}`);
const servers=await request('GET','/servers');const server=servers.find(item=>item.name==='localhost')||servers[0];if(!server)throw new Error('Kein Coolify-Server');
let projects=await request('GET','/projects');let project=projects.find(item=>item.name==='agentone-private');if(!project){const created=await request('POST','/projects',{name:'agentone-private',description:'Private AgentOne Instanzen mit strikt getrennten Daten, Runtimes und Identitäten'});project={uuid:created.uuid,name:'agentone-private'};}
try{const details=await request('GET',`/projects/${project.uuid}`);if(!(details.environments||[]).some(item=>item.name==='production'))await request('POST',`/projects/${project.uuid}/environments`,{name:'production'});}catch(error){if(!String(error.message).includes('409'))throw error;}
const block=item=>`  ${item.id}-db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${item.id}_app
      POSTGRES_PASSWORD: ${item.db}
      POSTGRES_DB: agentone_${item.id}
    volumes: ["${item.id}-postgres:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${item.id}_app -d agentone_${item.id}"]
      interval: 10s
      timeout: 5s
      retries: 10
    security_opt: ["no-new-privileges:true"]
  ${item.id}-app:
    image: purelink/agentone:${release}
    pull_policy: never
    restart: unless-stopped
    environment:
      HOST: 0.0.0.0
      PORT: 4173
      AGENTONE_DATA_DIR: /data
      AGENTONE_SERVICE_NAME: agentone-private-${item.id}
      AGENTONE_RELEASE: ${release}
      AGENTONE_DEFAULT_PAGE: personal
      AGENTONE_PUBLIC_ORIGIN: ${item.origin}
      COOKIE_SECURE: "true"
      AGENTONE_LOGIN_USER: ${item.user}
      AGENTONE_LOGIN_PASSWORD: ${item.password}
      AGENTONE_INTERNAL_API_TOKEN: ${item.session}
      AGENTONE_DEMO_MASTER_KEY: ${item.session}
      OPENAI_API_KEY: ${JSON.stringify(openAiKey)}
${personalConnectorEnvironment(item)}
      AGENTONE_PERSONAL_MODEL: gpt-6-luna
      AGENTONE_PERSONAL_FALLBACK_MODEL: gpt-6.1-sol
      DATABASE_URL: postgres://${item.id}_app:${item.db}@${item.id}-db:5432/agentone_${item.id}
      DEMO_ALLOW_COOLIFY_MUTATIONS: "false"
    volumes: ["${item.id}-data:/data"]
    depends_on:
      ${item.id}-db:
        condition: service_healthy
    expose: ["4173"]
    read_only: true
    tmpfs: ["/tmp"]
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
  ${item.id}-gateway:
    image: ghcr.io/openclaw/openclaw:2026.10.8
    restart: unless-stopped
    environment:
      HOME: /home/node
      OPENCLAW_HOME: /home/node
      OPENCLAW_STATE_DIR: /home/node/.openclaw
      OPENCLAW_CONFIG_PATH: /home/node/.openclaw/openclaw.json
      OPENCLAW_WORKSPACE_DIR: /home/node/.openclaw/workspace
      OPENCLAW_GATEWAY_PORT: "18789"
      OPENAI_API_KEY: ${JSON.stringify(openAiKey)}
      OPENCLAW_DISABLE_BONJOUR: "1"
      TZ: Europe/Berlin
    volumes: ["${item.id}-openclaw-config:/home/node/.openclaw", "${item.id}-openclaw-workspace:/home/node/.openclaw/workspace"]
    expose: ["18789"]
    init: true
    command: ["node","dist/index.js","gateway","--bind","lan","--port","18789"]
    healthcheck:
      test: ["CMD","node","dist/docker-healthcheck.js"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
    cap_drop: ["NET_RAW","NET_ADMIN"]
    security_opt: ["no-new-privileges:true"]
  ${item.id}-access:
    image: purelink/agentone:${release}
    pull_policy: never
    restart: unless-stopped
    environment:
      HOST: 0.0.0.0
      PORT: 8080
      UPSTREAM_URL: http://${item.id}-gateway:18789
      PERSONAL_API_URL: http://${item.id}-app:4173
      PERSONAL_API_TOKEN: ${item.session}
      BASIC_AUTH_USER: ${item.user}
      BASIC_AUTH_PASSWORD: ${item.password}
      AGENTONE_DISPLAY_NAME: ${item.label}
      AGENTONE_INSTANCE_TYPE: personal
      AGENTONE_BRAND_PRIMARY: "${item.primary}"
      AGENTONE_BRAND_ACCENT: "${item.accent}"
      AGENTONE_THEME_BACKGROUND: "${item.background}"
      AGENTONE_THEME_PANEL: "${item.panel}"
      AGENTONE_THEME_LINE: "${item.line}"
      AGENTONE_INSTANCE_DIRECTORY: '${instanceDirectory}'
      AUTHENTICATED_USER: ${item.user}@agentone.private
      ACCESS_SESSION_SECRET: ${item.session}
      AGENTONE_SIRI_API_KEY: ${item.siri}
      AGENTONE_INSTRUCTION_RECIPIENT: ${env.AGENTONE_INSTRUCTION_RECIPIENT||'mw@ric2k.de'}
      AGENTONE_INSTRUCTION_DELIVERY_MODE: ${env.AGENTONE_INSTRUCTION_DELIVERY_MODE||'manual-approved'}
      AGENTONE_INSTRUCTION_INCLUDE_TASK_KEYS: ${JSON.stringify(String(env.AGENTONE_INSTRUCTION_INCLUDE_TASK_KEYS||'true'))}
      OPENAI_API_KEY: ${JSON.stringify(openAiKey)}
${googleOAuthAccessEnvironment(item)}
${homeConnectorAccessEnvironment(item)}
      AGENTONE_VOICE_MODEL: gpt-6-luna
      PUBLIC_ORIGIN: ${item.origin}
    command: ["node","server/basic-proxy.mjs"]
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/proxy-health >/dev/null || exit 1"]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 10s
    depends_on:
      ${item.id}-gateway:
        condition: service_started
    expose: ["8080"]
    read_only: true
    tmpfs: ["/tmp"]
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]`;
const volumeLines=instances.flatMap(item=>[`  ${item.id}-postgres:`,`    name: agentone-private-${item.id}-postgres`,`  ${item.id}-data:`,`    name: agentone-private-${item.id}-data`,`  ${item.id}-openclaw-config:`,`    name: agentone-private-${item.id}-openclaw-config`,`  ${item.id}-openclaw-workspace:`,`    name: agentone-private-${item.id}-openclaw-workspace`]).join('\n');
const compose=`services:\n${instances.map(block).join('\n')}\nvolumes:\n${volumeLines}\n`;
const services=await request('GET','/services');let service=services.find(item=>item.name==='agentone-private-stack');let created=false;
if(!service){const response=await request('POST','/services',{name:'agentone-private-stack',description:'Fressi und Günni als vollständig isolierte AgentOne Personal Instanzen',project_uuid:project.uuid,environment_name:'production',server_uuid:server.uuid,instant_deploy:true,docker_compose_raw:Buffer.from(compose).toString('base64'),connect_to_docker_network:true,redact_all_env_values_in_logs:true,tags:['agentone','private','fressi','guenni']});service={uuid:response.uuid,name:'agentone-private-stack'};created=true;}else await request('PATCH',`/services/${service.uuid}`,{description:'Fressi und Günni als vollständig isolierte AgentOne Personal Instanzen',instant_deploy:true,docker_compose_raw:Buffer.from(compose).toString('base64'),connect_to_docker_network:true,redact_all_env_values_in_logs:true});
let details=await request('GET',`/services/${service.uuid}`);for(const item of instances){const app=(details.applications||[]).find(app=>app.name===`${item.id}-access`);if(!app)throw new Error(`Route-App fehlt: ${item.id}`);await request('PATCH',`/services/${service.uuid}/applications/${app.uuid}`,{url:`${item.origin}:8080`,noindex_domains:[item.origin],is_force_https_enabled:true,is_permanent_redirect_enabled:true,human_name:`AgentOne Personal · ${item.label}`});}
const start=await fetch(`${apiBase}/services/${service.uuid}/start`,{method:'POST',headers});const startText=await start.text();if(!start.ok&&!(start.status===400&&/already running/i.test(startText)))throw new Error(`Start fehlgeschlagen: ${start.status} ${startText.slice(0,200)}`);
const manifest={createdAt:new Date().toISOString(),release,project:{uuid:project.uuid,name:project.name},service:{uuid:service.uuid,name:service.name,created},instances:instances.map(({id,label,origin,user})=>({id,label,origin,user,components:[`${id}-app`,`${id}-db`,`${id}-gateway`,`${id}-access`]})),secretValuesStoredIn:'master/env/.env.master'};
fs.writeFileSync(path.join(root,'output','demo','coolify-private-deployment.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(root,'output','demo','private-access.txt'),instances.map(item=>`${item.label}\n${item.origin}\nBenutzer: ${item.user}\nPasswort: ${item.password}`).join('\n\n'));
console.log(JSON.stringify(manifest,null,2));
