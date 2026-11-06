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
async function request(method,route,data){
  const response=await fetch(`${apiBase}${route}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(30_000)});
  const text=await response.text(); let parsed=null;try{parsed=text?JSON.parse(text):null}catch{parsed={message:text}}
  if(!response.ok)throw new Error(`${method} ${route}: HTTP ${response.status} ${String(parsed?.message||text).slice(0,200)}`);
  return parsed;
}
function ensureSecret(name){
  if(env[name])return env[name];
  const value=crypto.randomBytes(32).toString('base64url');
  fs.appendFileSync(masterPath,`\n${name}=${value}\n`,{encoding:'utf8'});
  env={...env,[name]:value};
  return value;
}
const agentDbPassword=ensureSecret('AGENTONE_POSTGRES_PASSWORD');
const personalDbPassword=ensureSecret('AGENTONE_PERSONAL_POSTGRES_PASSWORD');
const mobileUser=env.AGENTONE_MOBILE_USER||'marcus';
const mobilePassword=ensureSecret('AGENTONE_MOBILE_PASSWORD');
const personalLoginUser=env.AGENTONE_LOGIN_USER||mobileUser;
const personalLoginPassword=env.AGENTONE_LOGIN_PASSWORD||mobilePassword;
if(!env.AGENTONE_LOGIN_USER)fs.appendFileSync(masterPath,`\nAGENTONE_LOGIN_USER=${personalLoginUser}\n`,{encoding:'utf8'});
if(!env.AGENTONE_LOGIN_PASSWORD)fs.appendFileSync(masterPath,`\nAGENTONE_LOGIN_PASSWORD=${personalLoginPassword}\n`,{encoding:'utf8'});
const accessSessionSecret=ensureSecret('AGENTONE_ACCESS_SESSION_SECRET');
const internalApiToken=ensureSecret('AGENTONE_PLATFORM_INTERNAL_API_TOKEN');
const openAiKey=env.CrewAI_OpenAI_API_Key||env.STICKER_OPENAI_API_KEY;
if(!openAiKey)throw new Error('Kein vorhandener OpenAI-Key für AgentOne Assistant gefunden');
const personalConnectorKeys=['GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CALENDAR_REDIRECT_URI','HOME_ASSISTANT_URL','HOME_ASSISTANT_TOKEN','HOME_CONNECTOR_URL','HOME_CONNECTOR_TOKEN','SPOTIFY_CLIENT_ID','SPOTIFY_CLIENT_SECRET','SPOTIFY_REDIRECT_URI','APPLE_COMPANION_URL','APPLE_COMPANION_TOKEN','DAV_BASE_URL','DAV_USERNAME','DAV_APP_PASSWORD','PERSONAL_IMAP_HOST','PERSONAL_IMAP_USER','PERSONAL_IMAP_PASSWORD','NTFY_URL','NTFY_TOPIC','NTFY_TOKEN','PAPERLESS_URL','PAPERLESS_TOKEN','IMMICH_URL','IMMICH_API_KEY','MEALIE_URL','MEALIE_TOKEN','ACTUAL_BUDGET_URL','ACTUAL_BUDGET_PASSWORD','ACTUAL_BUDGET_SYNC_ID'];
const personalChannelKeys=['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REDIRECT_URI','TWITCH_CLIENT_ID','TWITCH_CLIENT_SECRET','TWITCH_REDIRECT_URI'];
const personalConnectorEnvironment=[...personalConnectorKeys,...personalChannelKeys].filter(key=>String(env[key]||'').trim()).map(key=>`      ${key}: ${JSON.stringify(env[key])}`).join('\n');
const publicIp=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const personalPublicOrigin=String(env.AGENTONE_PERSONAL_ORIGIN||`https://agentone-personal.${publicIp}.sslip.io`).replace(/\/$/,'');
const assistantPublicOrigin=String(env.AGENTONE_ASSISTANT_ORIGIN||`https://jarvis.${publicIp}.sslip.io`).replace(/\/$/,'');
for(const origin of [personalPublicOrigin,assistantPublicOrigin])if(!origin.startsWith('https://'))throw new Error(`Nur HTTPS-Origin erlaubt: ${origin}`);

const servers=await request('GET','/servers');
const server=servers.find(item=>item.name==='localhost')||servers[0];
if(!server)throw new Error('Kein Coolify-Server verfügbar');
let projects=await request('GET','/projects');
let project=projects.find(item=>item.name==='agentone');
if(!project){const created=await request('POST','/projects',{name:'agentone',description:'AgentOne Platform, AgentOne Personal und isolierter Personal Gateway'});project={uuid:created.uuid,name:'agentone'};}
let environmentName='production';
try{
  const details=await request('GET',`/projects/${project.uuid}`);
  const environments=details.environments||[];
  if(!environments.some(item=>item.name===environmentName))await request('POST',`/projects/${project.uuid}/environments`,{name:environmentName});
}catch(error){if(!String(error.message).includes('409'))throw error;}

const compose=`services:
  agentone-db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: agentone_app
      POSTGRES_PASSWORD: ${agentDbPassword}
      POSTGRES_DB: agentone
    volumes:
      - agentone-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agentone_app -d agentone"]
      interval: 10s
      timeout: 5s
      retries: 10
    security_opt: ["no-new-privileges:true"]
  agentone:
    image: purelink/agentone:${release}
    pull_policy: never
    restart: unless-stopped
    environment:
      HOST: 0.0.0.0
      PORT: 4173
      AGENTONE_DATA_DIR: /data
      AGENTONE_SERVICE_NAME: agentone
      AGENTONE_RELEASE: ${release}
      DATABASE_URL: postgres://agentone_app:${agentDbPassword}@agentone-db:5432/agentone
      DEMO_ALLOW_COOLIFY_MUTATIONS: "false"
    volumes:
      - agentone-data:/data
    depends_on:
      agentone-db:
        condition: service_healthy
    expose: ["4173"]
    read_only: true
    tmpfs: ["/tmp"]
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
  agentone-personal-db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: personal_app
      POSTGRES_PASSWORD: ${personalDbPassword}
      POSTGRES_DB: agentone_personal
    volumes:
      - agentone-personal-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U personal_app -d agentone_personal"]
      interval: 10s
      timeout: 5s
      retries: 10
    security_opt: ["no-new-privileges:true"]
  agentone-personal:
    image: purelink/agentone:${release}
    pull_policy: never
    restart: unless-stopped
    environment:
      HOST: 0.0.0.0
      PORT: 4173
      AGENTONE_DATA_DIR: /data
      AGENTONE_SERVICE_NAME: agentone-personal
      AGENTONE_RELEASE: ${release}
      AGENTONE_DEFAULT_PAGE: personal
      AGENTONE_PUBLIC_ORIGIN: ${personalPublicOrigin}
      COOKIE_SECURE: "true"
      AGENTONE_LOGIN_USER: ${personalLoginUser}
      AGENTONE_LOGIN_PASSWORD: ${personalLoginPassword}
      AGENTONE_INTERNAL_API_TOKEN: ${internalApiToken}
      OPENAI_API_KEY: ${JSON.stringify(openAiKey)}
${personalConnectorEnvironment}
      AGENTONE_PERSONAL_MODEL: gpt-6-luna
      AGENTONE_PERSONAL_FALLBACK_MODEL: gpt-6.1-sol
      DATABASE_URL: postgres://personal_app:${personalDbPassword}@agentone-personal-db:5432/agentone_personal
      DEMO_ALLOW_COOLIFY_MUTATIONS: "false"
    volumes:
      - agentone-personal-data:/data
    depends_on:
      agentone-personal-db:
        condition: service_healthy
    expose: ["4173"]
    read_only: true
    tmpfs: ["/tmp"]
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
  agentone-personal-gateway:
    image: ghcr.io/openclaw/openclaw:2026.10.8
    restart: unless-stopped
    environment:
      HOME: /home/node
      OPENCLAW_HOME: /home/node
      OPENCLAW_STATE_DIR: /home/node/.openclaw
      OPENCLAW_CONFIG_PATH: /home/node/.openclaw/openclaw.json
      OPENCLAW_CONFIG_DIR: /home/node/.openclaw
      OPENCLAW_WORKSPACE_DIR: /home/node/.openclaw/workspace
      OPENCLAW_GATEWAY_PORT: "18789"
      OPENAI_API_KEY: ${JSON.stringify(openAiKey)}
      OPENCLAW_DISABLE_BONJOUR: "1"
      TZ: Europe/Berlin
    volumes:
      - agentone-openclaw-config:/home/node/.openclaw
      - agentone-openclaw-workspace:/home/node/.openclaw/workspace
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
  jarvis-access:
    image: purelink/agentone:${release}
    pull_policy: never
    restart: unless-stopped
    environment:
      HOST: 0.0.0.0
      PORT: 8080
      UPSTREAM_URL: http://agentone-personal-gateway:18789
      BASIC_AUTH_USER: ${mobileUser}
      BASIC_AUTH_PASSWORD: ${mobilePassword}
      AGENTONE_DISPLAY_NAME: Marcus
      AGENTONE_INSTANCE_TYPE: business
      AGENTONE_BRAND_NAME: PureLink
      AGENTONE_BRAND_PRIMARY: "#005ae5"
      AGENTONE_BRAND_ACCENT: "#35d6c6"
      AGENTONE_BRAND_MARK: PL
      AGENTONE_INSTANCE_DIRECTORY: '[{"name":"PureLink","url":"https://agentone.purelink.de","type":"business","theme":{"primary":"#005ae5","accent":"#35d6c6"},"brand":{"name":"PureLink","primary":"#005ae5"},"active":true},{"name":"Fressi","url":"https://fressi.mwart.solutions","type":"personal","theme":{"primary":"#d8654f","accent":"#f0b35b","background":"#151116"},"brand":null,"active":true},{"name":"Günni","url":"https://guenni.mwart.solutions","type":"personal","theme":{"primary":"#7357d9","accent":"#43c3a6","background":"#11121a"},"brand":null,"active":true}]'
      AUTHENTICATED_USER: ${mobileUser}@purelink.de
      ACCESS_SESSION_SECRET: ${accessSessionSecret}
      OPENAI_API_KEY: ${JSON.stringify(openAiKey)}
      AGENTONE_VOICE_MODEL: gpt-6-luna
      PUBLIC_ORIGIN: ${assistantPublicOrigin}
      PERSONAL_API_URL: http://agentone-personal:4173
      PERSONAL_API_TOKEN: ${internalApiToken}
    command: ["node","server/basic-proxy.mjs"]
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/proxy-health >/dev/null || exit 1"]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 10s
    depends_on:
      agentone-personal-gateway:
        # Die PWA und das Live-Dashboard müssen auch bei einem noch startenden
        # OpenClaw-Gateway erreichbar bleiben; Chat zeigt dann DEGRADED.
        condition: service_started
    expose: ["8080"]
    read_only: true
    tmpfs: ["/tmp"]
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
volumes:
  agentone-postgres:
    name: agentone-postgres
  agentone-data:
    name: agentone-data
  agentone-personal-postgres:
    name: agentone-personal-postgres
  agentone-personal-data:
    name: agentone-personal-data
  agentone-openclaw-config:
    name: agentone-openclaw-config
  agentone-openclaw-workspace:
    name: agentone-openclaw-workspace
`;

const services=await request('GET','/services');
let service=services.find(item=>item.name==='agentone-platform-stack');
let created=false;
if(!service){
  const response=await request('POST','/services',{name:'agentone-platform-stack',description:'AgentOne, AgentOne Personal, separate PostgreSQL databases and isolated OpenClaw gateway',project_uuid:project.uuid,environment_name:environmentName,server_uuid:server.uuid,instant_deploy:true,docker_compose_raw:Buffer.from(compose).toString('base64'),connect_to_docker_network:true,redact_all_env_values_in_logs:true,tags:['agentone','personal','openclaw']});
  service={uuid:response.uuid,name:'agentone-platform-stack',domains:response.domains};created=true;
}else await request('PATCH',`/services/${service.uuid}`,{description:'AgentOne, AgentOne Personal, separate PostgreSQL databases and isolated OpenClaw gateway',instant_deploy:true,docker_compose_raw:Buffer.from(compose).toString('base64'),connect_to_docker_network:true,redact_all_env_values_in_logs:true});
const manifest={createdAt:new Date().toISOString(),project:{uuid:project.uuid,name:project.name},environment:environmentName,server:{uuid:server.uuid,name:server.name},service:{uuid:service.uuid,name:service.name,created},release,publicExposure:'https-form-session-trusted-proxy',components:['agentone','agentone-db','agentone-personal','agentone-personal-db','agentone-personal-gateway','jarvis-access'],secretValuesStoredIn:'master/env/.env.master'};
fs.writeFileSync(path.join(root,'output','demo','coolify-deployment.json'),JSON.stringify(manifest,null,2));
const personalUrl=personalPublicOrigin;
const assistantUrl=assistantPublicOrigin;
fs.writeFileSync(path.join(root,'output','demo','mobile-access.txt'),`AgentOne Personal\n${personalUrl}\n\nAgentOne Assistant\n${assistantUrl}\n\nBenutzer: ${mobileUser}\nPasswort: ${mobilePassword}\n\nNach dem ersten Login bitte ein persönliches Konto und ein neues Passwort anlegen, sobald der Account-Assistent aktiviert ist.\n`);
console.log(JSON.stringify(manifest,null,2));
