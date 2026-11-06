import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export function parseCookies(header='') {
  return Object.fromEntries(header.split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const at=part.indexOf('=');return at<0?[part,'']:[part.slice(0,at),decodeURIComponent(part.slice(at+1))];}));
}

export function cookie(name,value,{maxAge=8*60*60,httpOnly=true,sameSite='Lax',secure=false,path='/'}={}) {
  const parts=[`${name}=${encodeURIComponent(value)}`,`Path=${path}`,`SameSite=${sameSite}`];
  if(httpOnly)parts.push('HttpOnly');
  if(secure)parts.push('Secure');
  if(maxAge!==undefined)parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

export const randomToken=(bytes=32)=>crypto.randomBytes(bytes).toString('base64url');
export const tokenHash=value=>crypto.createHash('sha256').update(value).digest('hex');
export const pkceChallenge=verifier=>crypto.createHash('sha256').update(verifier).digest('base64url');

export function createSession(state,user,role='User') {
  const token=randomToken(); const hash=tokenHash(token); const now=Date.now();
  state.db.prepare('INSERT INTO user_sessions(token_hash,user_id,email,name,role,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?)').run(hash,user.id,user.email,user.name,role,new Date(now).toISOString(),new Date(now+8*60*60*1000).toISOString(),new Date(now).toISOString());
  return token;
}

export function getSession(state,req) {
  const token=parseCookies(req.headers.cookie).a1_session;
  if(!token)return null;
  const session=state.db.prepare('SELECT token_hash as tokenHash,user_id as userId,email,name,role,expires_at as expiresAt FROM user_sessions WHERE token_hash=?').get(tokenHash(token));
  if(!session||Date.parse(session.expiresAt)<=Date.now())return null;
  state.db.prepare('UPDATE user_sessions SET last_seen_at=? WHERE token_hash=?').run(new Date().toISOString(),session.tokenHash);
  return session;
}

export function requireSession(state,req,{admin=false}={}) {
  const session=getSession(state,req);
  if(!session){const error=new Error('Anmeldung erforderlich');error.status=401;throw error;}
  if(admin&&session.role!=='Platform Admin'){const error=new Error('Administratorrolle erforderlich');error.status=403;throw error;}
  return session;
}

export function assertLocalOrigin(req,additionalOrigins=[]) {
  if(!['POST','PUT','PATCH','DELETE'].includes(req.method||''))return;
  const origin=req.headers.origin;
  const allowed=new Set(['http://127.0.0.1:4173','http://localhost:4173',...additionalOrigins.filter(Boolean)]);
  if(origin&&!allowed.has(origin)){
    const error=new Error('Origin nicht erlaubt');error.status=403;throw error;
  }
}

export function verifyBasicAuth(req,env){
  const expectedUser=env.AGENTONE_BASIC_AUTH_USER,expectedPassword=env.AGENTONE_BASIC_AUTH_PASSWORD;
  if(!expectedUser||!expectedPassword)return true;
  const header=String(req.headers.authorization||'');
  if(!header.startsWith('Basic '))return false;
  let decoded='';try{decoded=Buffer.from(header.slice(6),'base64').toString('utf8');}catch{return false;}
  const separator=decoded.indexOf(':');if(separator<1)return false;
  const user=Buffer.from(decoded.slice(0,separator)),password=Buffer.from(decoded.slice(separator+1));
  const safeEqual=(left,right)=>left.length===right.length&&crypto.timingSafeEqual(left,right);
  return safeEqual(user,Buffer.from(expectedUser))&&safeEqual(password,Buffer.from(expectedPassword));
}

export function verifyAccountCredentials(input,env){
  const expectedUser=String(env.AGENTONE_LOGIN_USER||'');
  const expectedPassword=String(env.AGENTONE_LOGIN_PASSWORD||'');
  if(!expectedUser||!expectedPassword)return false;
  const digest=value=>crypto.createHash('sha256').update(String(value??''),'utf8').digest();
  return crypto.timingSafeEqual(digest(input?.username),digest(expectedUser))
    && crypto.timingSafeEqual(digest(input?.password),digest(expectedPassword));
}

export function entraConfig(env) {
  const required=['GRAPH_TENANT_ID','GRAPH_CLIENT_ID','GRAPH_CLIENT_SECRET','GRAPH_REDIRECT_URI'];
  return { enabled:required.every(key=>Boolean(env[key]?.trim())),passwordEnabled:Boolean(env.AGENTONE_LOGIN_USER&&env.AGENTONE_LOGIN_PASSWORD),tenantConfigured:Boolean(env.GRAPH_TENANT_ID),redirectConfigured:Boolean(env.GRAPH_REDIRECT_URI),domains:['purelink.de','purelink.com'] };
}

export function createEntraAuthorization(state,env) {
  const stateValue=randomToken(24),nonce=randomToken(24),verifier=randomToken(48),challenge=pkceChallenge(verifier),expiresAt=new Date(Date.now()+10*60*1000).toISOString();
  state.db.prepare('INSERT INTO auth_pending(state,nonce,verifier,expires_at) VALUES(?,?,?,?)').run(stateValue,nonce,verifier,expiresAt);
  const url=new URL(`https://login.microsoftonline.com/${encodeURIComponent(env.GRAPH_TENANT_ID)}/oauth2/v2.0/authorize`);
  url.search=new URLSearchParams({client_id:env.GRAPH_CLIENT_ID,response_type:'code',redirect_uri:env.GRAPH_REDIRECT_URI,response_mode:'query',scope:'openid profile email User.Read',state:stateValue,nonce,code_challenge:challenge,code_challenge_method:'S256'}).toString();
  return {url:url.toString(),state:stateValue};
}

export async function completeEntraAuthorization(state,env,{code,stateValue,cookieState}) {
  if(!code||!stateValue||stateValue!==cookieState)throw Object.assign(new Error('OIDC-State ungültig'),{status:400});
  const pending=state.db.prepare('SELECT state,nonce,verifier,expires_at as expiresAt FROM auth_pending WHERE state=?').get(stateValue);
  state.db.prepare('DELETE FROM auth_pending WHERE state=?').run(stateValue);
  if(!pending||Date.parse(pending.expiresAt)<=Date.now())throw Object.assign(new Error('OIDC-Anfrage abgelaufen'),{status:400});
  const tokenUrl=`https://login.microsoftonline.com/${encodeURIComponent(env.GRAPH_TENANT_ID)}/oauth2/v2.0/token`;
  const response=await fetch(tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GRAPH_CLIENT_ID,client_secret:env.GRAPH_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:env.GRAPH_REDIRECT_URI,code_verifier:pending.verifier})});
  if(!response.ok)throw Object.assign(new Error('Microsoft-Tokenaustausch fehlgeschlagen'),{status:502});
  const tokens=await response.json();
  const issuer=`https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/v2.0`;
  const jwks=createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/discovery/v2.0/keys`));
  const {payload}=await jwtVerify(tokens.id_token,jwks,{issuer,audience:env.GRAPH_CLIENT_ID});
  if(payload.nonce!==pending.nonce)throw Object.assign(new Error('OIDC-Nonce ungültig'),{status:400});
  const email=String(payload.preferred_username||payload.email||'').toLowerCase();
  if(!/@purelink\.(de|com)$/.test(email)||payload.tid!==env.GRAPH_TENANT_ID)throw Object.assign(new Error('Microsoft-Konto nicht zugelassen'),{status:403});
  return {id:String(payload.oid||payload.sub),email,name:String(payload.name||email),role:'User'};
}
