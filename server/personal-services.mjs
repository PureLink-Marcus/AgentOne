import dns from 'node:dns/promises';
import net from 'node:net';

export const personalServiceCatalog={
  caldav:{name:'CalDAV / CardDAV',capabilities:['calendar.read','contacts.read','tasks.read'],healthPath:'/'},
  paperless:{name:'Paperless-ngx',capabilities:['documents.search','documents.ocr.read','documents.tags.read'],healthPath:'/api/documents/?page_size=1'},
  mealie:{name:'Mealie',capabilities:['recipes.read','mealplan.read','shopping.read'],healthPath:'/api/app/about'},
  immich:{name:'Immich',capabilities:['assets.read','albums.read','metadata.read'],healthPath:'/api/server/ping'},
  actual:{name:'Actual Budget',capabilities:['budgets.read','accounts.read','transactions.read','payments.none'],healthPath:'/health'},
  ntfy:{name:'ntfy',capabilities:['notifications.subscribe','notifications.preview','notifications.publish.approval'],healthPath:'/v1/health'},
  telegram:{name:'Telegram Bot',capabilities:['messages.receive','messages.preview','messages.send.approval'],healthPath:'/'}
};

function privateIp(address){if(net.isIP(address)===4){const parts=address.split('.').map(Number);return parts[0]===10||parts[0]===127||parts[0]===0||parts[0]===169&&parts[1]===254||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===192&&parts[1]===168;}return address==='::1'||address.startsWith('fc')||address.startsWith('fd')||address.startsWith('fe80:');}
export async function validatePublicServiceEndpoint(value,lookup=dns.lookup){const url=new URL(String(value||''));if(url.protocol!=='https:'||url.username||url.password||url.port&&!['443','8443'].includes(url.port))throw Object.assign(new Error('Nur öffentliche HTTPS-Endpunkte auf Port 443/8443 sind direkt zulässig'),{status:400});if(url.hostname==='localhost'||url.hostname.endsWith('.local')||net.isIP(url.hostname))throw Object.assign(new Error('Lokale Ziele müssen über den Home Connector laufen'),{status:400});const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(item=>privateIp(item.address)))throw Object.assign(new Error('Private Netzwerkziele müssen über den Home Connector laufen'),{status:400});return url;}
export function normalizePersonalService(input){const id=String(input.id||'');const definition=personalServiceCatalog[id];if(!definition)throw Object.assign(new Error('Unbekannter persönlicher Dienst'),{status:400});const secret=String(input.secret||'');if(secret.length<6||secret.length>2048)throw Object.assign(new Error('Token oder App-Passwort fehlt'),{status:400});const allowlist=String(input.allowlist||'').split(',').map(value=>value.trim()).filter(value=>/^-?\d{1,20}$/.test(value)).slice(0,20),quietHours=String(input.quietHours||'22:00-07:00');if(id==='telegram'&&!allowlist.length)throw Object.assign(new Error('Telegram benötigt mindestens eine numerische Benutzer-Allowlist'),{status:400});return {secret,service:{id,label:String(input.label||definition.name).slice(0,80),endpoint:String(input.endpoint||'').replace(/\/$/,''),username:String(input.username||'').slice(0,180),capabilities:definition.capabilities,settings:{readOnly:true,transport:'direct-https',allowlist,quietHours:/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(quietHours)?quietHours:'22:00-07:00',mutationsRequireApproval:['ntfy','telegram'].includes(id),financialData:id==='actual'}}};}
export async function testPersonalService(service,secret,{fetchImpl=fetch,lookup=dns.lookup}={}){const definition=personalServiceCatalog[service.id];if(!definition)throw new Error('Unbekannter Dienst');const base=await validatePublicServiceEndpoint(service.endpoint,lookup),url=new URL(definition.healthPath,base),headers={accept:'application/json'};let method='GET',body;
  if(service.id==='paperless')headers.authorization=`Token ${secret}`;
  if(service.id==='immich')headers['x-api-key']=secret;
  if(service.id==='mealie')headers.authorization=`Bearer ${secret}`;
  if(service.id==='actual')headers.authorization=`Bearer ${secret}`;
  if(service.id==='ntfy')headers.authorization=`Bearer ${secret}`;
  if(service.id==='telegram'){if(base.hostname!=='api.telegram.org')throw Object.assign(new Error('Telegram ist ausschließlich über api.telegram.org zulässig'),{status:400});url.pathname=`/bot${secret}/getMe`;}
  if(service.id==='caldav'){method='PROPFIND';headers.authorization=`Basic ${Buffer.from(`${service.username}:${secret}`).toString('base64')}`;headers.depth='0';headers['content-type']='application/xml';body='<?xml version="1.0"?><propfind xmlns="DAV:"><prop><displayname/><resourcetype/></prop></propfind>';}
  const started=Date.now(),response=await fetchImpl(url,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(12_000)});if(!response.ok&&!(service.id==='caldav'&&response.status===207))throw Object.assign(new Error(`${definition.name} HTTP ${response.status}`),{status:422});return {testedAt:new Date().toISOString(),ok:true,service:service.id,readOnly:true,latencyMs:Date.now()-started,httpStatus:response.status,capabilities:definition.capabilities};}
