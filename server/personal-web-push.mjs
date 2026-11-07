import crypto from 'node:crypto';
import webpush from 'web-push';

const USER_ID=/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,191}$/;
const SUBSCRIPTION_ID=/^[a-f0-9]{64}$/;
const BASE64URL=/^[A-Za-z0-9_-]+$/;

function pushError(message,code='PERSONAL_PUSH_INVALID',status=400){return Object.assign(new Error(message),{code,status});}
function owner(value){const userId=String(value??'').trim();if(!USER_ID.test(userId))throw pushError('userId ist ungültig');return userId;}
function safeText(value,max){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function deriveKey(secret){if(Buffer.byteLength(String(secret||''),'utf8')<32)throw pushError('Push-Verschlüsselung ist nicht konfiguriert','PERSONAL_PUSH_ENCRYPTION_NOT_CONFIGURED',503);return crypto.createHmac('sha256',Buffer.from(String(secret),'utf8')).update('agentone:personal-web-push:v1').digest();}
function aad(userId,id){return Buffer.from(`agentone:personal-web-push:v1:${userId}:${id}`,'utf8');}
function encryptSubscription(value,{userId,id,masterSecret}){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',deriveKey(masterSecret),iv);cipher.setAAD(aad(userId,id));const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return JSON.stringify({v:1,alg:'A256GCM',iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url')});}
function decryptSubscription(envelope,{userId,id,masterSecret}){let value;try{value=JSON.parse(envelope);if(value?.v!==1||value?.alg!=='A256GCM')throw new Error('schema');const decipher=crypto.createDecipheriv('aes-256-gcm',deriveKey(masterSecret),Buffer.from(value.iv,'base64url'));decipher.setAAD(aad(userId,id));decipher.setAuthTag(Buffer.from(value.tag,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64url')),decipher.final()]).toString('utf8'));}catch(error){if(error?.code==='PERSONAL_PUSH_ENCRYPTION_NOT_CONFIGURED')throw error;throw pushError('Push-Abonnement ist beschädigt','PERSONAL_PUSH_SUBSCRIPTION_CORRUPT',500);}}
function normalizeSubscription(input){if(!input||typeof input!=='object'||Array.isArray(input))throw pushError('Push-Abonnement fehlt');let endpoint;try{endpoint=new URL(String(input.endpoint||''));}catch{throw pushError('Push-Endpunkt ist ungültig');}if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.hash||String(input.endpoint).length>4096)throw pushError('Push-Endpunkt muss eine sichere HTTPS-Adresse sein');const p256dh=String(input.keys?.p256dh||''),auth=String(input.keys?.auth||'');if(!BASE64URL.test(p256dh)||p256dh.length<64||p256dh.length>256||!BASE64URL.test(auth)||auth.length<16||auth.length>128)throw pushError('Push-Schlüssel sind ungültig');return {endpoint:endpoint.toString(),expirationTime:Number.isFinite(Number(input.expirationTime))?Number(input.expirationTime):null,keys:{p256dh,auth}};}
function publicRow(row){return {id:row.id,createdAt:row.createdAt,lastSeenAt:row.lastSeenAt,userAgent:row.userAgent||'Gerät',status:'ACTIVE'};}
function safePayload(input={}){const url=String(input.url||'/');if(!/^\/(?!\/)[^\u0000-\u001f]*$/.test(url)||url.length>512)throw pushError('Push-Ziel ist ungültig');return {schema:'agentone.personal-push/v1',title:safeText(input.title||'AgentOne Personal',80),body:safeText(input.body||'Ein neuer persönlicher Hinweis ist verfügbar.',180),tag:safeText(input.tag||'agentone-personal',96).replace(/[^A-Za-z0-9._:-]/g,'-'),url,icon:'/agentone/icon.svg',badge:'/agentone/icon.svg',sensitive:false};}

export function personalPushConfig(env={}){const publicKey=String(env.AGENTONE_VAPID_PUBLIC_KEY||''),privateKey=String(env.AGENTONE_VAPID_PRIVATE_KEY||''),subject=String(env.AGENTONE_VAPID_SUBJECT||'').trim(),masterSecret=String(env.AGENTONE_PUSH_MASTER_KEY||env.AGENTONE_SECRET_KEY||'');let subjectValid=false;try{const parsed=new URL(subject);subjectValid=['mailto:','https:'].includes(parsed.protocol);}catch{}const configured=Boolean(publicKey&&privateKey&&subjectValid&&Buffer.byteLength(masterSecret,'utf8')>=32);return Object.freeze({configured,publicKey:configured?publicKey:'',privateKey:configured?privateKey:'',subject:configured?subject:'',masterSecret:configured?masterSecret:'',reason:configured?null:'VAPID oder Push-Verschlüsselung fehlt'});}

export function initPersonalPushStore(db){db.exec(`
  CREATE TABLE IF NOT EXISTS personal_push_subscription(
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint_hash TEXT NOT NULL,
    encrypted_subscription TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    UNIQUE(user_id,endpoint_hash)
  );
  CREATE INDEX IF NOT EXISTS personal_push_subscription_user ON personal_push_subscription(user_id,last_seen_at DESC);
`);}

export function savePersonalPushSubscription(db,{userId,subscription,userAgent='',masterSecret,now=new Date()}={}){const user=owner(userId),normalized=normalizeSubscription(subscription),at=new Date(now);if(!Number.isFinite(at.getTime()))throw pushError('now ist ungültig');const endpointHash=crypto.createHash('sha256').update(normalized.endpoint).digest('hex'),id=crypto.createHash('sha256').update(`${user}\u001f${endpointHash}`).digest('hex'),existing=db.prepare('SELECT created_at AS createdAt FROM personal_push_subscription WHERE user_id=? AND endpoint_hash=?').get(user,endpointHash),encrypted=encryptSubscription(normalized,{userId:user,id,masterSecret}),createdAt=existing?.createdAt||at.toISOString();db.prepare(`INSERT INTO personal_push_subscription(id,user_id,endpoint_hash,encrypted_subscription,user_agent,created_at,last_seen_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,endpoint_hash) DO UPDATE SET encrypted_subscription=excluded.encrypted_subscription,user_agent=excluded.user_agent,last_seen_at=excluded.last_seen_at`).run(id,user,endpointHash,encrypted,safeText(userAgent,180),createdAt,at.toISOString());return publicRow({id,createdAt,lastSeenAt:at.toISOString(),userAgent:safeText(userAgent,180)});}

export function listPersonalPushSubscriptions(db,userId){const user=owner(userId);return db.prepare('SELECT id,created_at AS createdAt,last_seen_at AS lastSeenAt,user_agent AS userAgent FROM personal_push_subscription WHERE user_id=? ORDER BY last_seen_at DESC').all(user).map(publicRow);}

export function removePersonalPushSubscription(db,{userId,id}={}){const user=owner(userId),value=String(id||'');if(!SUBSCRIPTION_ID.test(value))throw pushError('Push-Abonnement-ID ist ungültig');const result=db.prepare('DELETE FROM personal_push_subscription WHERE user_id=? AND id=?').run(user,value);return {removed:result.changes===1,id:value};}

export function personalPushStatus(db,{userId,config}={}){const subscriptions=listPersonalPushSubscriptions(db,userId),configured=Boolean(config?.configured);return {schema:'agentone.personal-push-status/v1',configured,vapidPublicKey:configured?config.publicKey:'',permissionRequired:true,subscriptions,subscriptionCount:subscriptions.length,capabilities:{notifications:configured,backgroundDelivery:configured},policy:{explicitOptIn:true,quietHoursEnforced:true,dailyBudgetEnforced:true,sensitiveContent:false,encryptedAtRest:true,userIsolated:true,secretsExposed:false}};}

export async function sendPersonalPush(db,{userId,config,payload,sendNotification=webpush.sendNotification,now=new Date()}={}){const user=owner(userId);if(!config?.configured)throw pushError('PWA-Push ist serverseitig nicht konfiguriert','PERSONAL_PUSH_NOT_CONFIGURED',503);const publicPayload=safePayload(payload),rows=db.prepare('SELECT id,encrypted_subscription AS encryptedSubscription FROM personal_push_subscription WHERE user_id=? ORDER BY last_seen_at DESC LIMIT 10').all(user),result={attempted:0,delivered:0,expired:0,failed:0,subscriptions:rows.length};for(const row of rows){let subscription;try{subscription=decryptSubscription(row.encryptedSubscription,{userId:user,id:row.id,masterSecret:config.masterSecret});result.attempted+=1;await sendNotification(subscription,JSON.stringify(publicPayload),{TTL:300,urgency:'normal',vapidDetails:{subject:config.subject,publicKey:config.publicKey,privateKey:config.privateKey}});result.delivered+=1;db.prepare('UPDATE personal_push_subscription SET last_seen_at=? WHERE user_id=? AND id=?').run(new Date(now).toISOString(),user,row.id);}catch(error){if([404,410].includes(Number(error?.statusCode))){db.prepare('DELETE FROM personal_push_subscription WHERE user_id=? AND id=?').run(user,row.id);result.expired+=1;}else result.failed+=1;}}return {...result,payload:{title:publicPayload.title,tag:publicPayload.tag,url:publicPayload.url,sensitive:false},secretsExposed:false};}

export const personalPushInternals=Object.freeze({normalizeSubscription,safePayload,encryptSubscription,decryptSubscription});
