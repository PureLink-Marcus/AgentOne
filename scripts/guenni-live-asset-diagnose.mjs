import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const origin=String(env.AGENTONE_GUENNI_ORIGIN||'').replace(/\/$/,'');
const login=await fetch(`${origin}/login`,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.AGENTONE_GUENNI_USER,password:env.AGENTONE_GUENNI_PASSWORD}),redirect:'manual',signal:AbortSignal.timeout(20_000)});
const cookie=String(login.headers.get('set-cookie')||'').split(';')[0];
if(login.status!==303||!cookie)throw new Error(`Login fehlgeschlagen: ${login.status}`);
const [releaseResponse,appResponse,homeResponse]=await Promise.all([
  fetch(`${origin}/agentone/release.json?diagnose=${Date.now()}`,{headers:{cookie},cache:'no-store'}),
  fetch(`${origin}/agentone/app.js?diagnose=${Date.now()}`,{headers:{cookie},cache:'no-store'}),
  fetch(`${origin}/?diagnose=${Date.now()}`,{headers:{cookie},cache:'no-store'})
]);
const release=await releaseResponse.json(),app=await appResponse.text(),home=await homeResponse.text();
console.log(JSON.stringify({release:release.release,appStatus:appResponse.status,appCacheControl:appResponse.headers.get('cache-control'),htmlRelease70:home.includes('2026.11.06-77'),directGmailFunction:app.includes('function openGmailSetup()'),privateButtonDirectCall:app.includes('else if(index===1)openGmailSetup()'),gmailThreeSteps:app.includes('Gmail · drei kurze Schritte'),oldAsyncClick:app.includes("document.querySelector('#google-oauth')?.click()"),secretsExposed:false},null,2));
