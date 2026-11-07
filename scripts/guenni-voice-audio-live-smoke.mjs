import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const origin=String(env.AGENTONE_GUENNI_ORIGIN||'').replace(/\/$/,'');
const user=env.AGENTONE_GUENNI_USER;
const password=env.AGENTONE_GUENNI_PASSWORD;
const expectedRelease=process.env.AGENTONE_EXPECTED_RELEASE||'2026.11.07-99';
const expectedMinDurationMs=Number(process.env.VOICE_SMOKE_EXPECTED_MIN_DURATION||1000);
const fixturePath=path.resolve('scripts/fixtures/release98-voice-smoke-de.wav');

if(!origin||!user||!password)throw new Error('Günni Voice-Live-Smoke ist nicht konfiguriert.');
if(new URL(origin).protocol!=='https:')throw new Error('Der Voice-Live-Smoke benötigt die öffentliche HTTPS-Instanz.');

function wavMetadata(buffer){
  if(buffer.length<44||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WAVE')throw new Error('Voice-Fixture ist keine gültige WAV-Datei.');
  let offset=12,byteRate=0,dataBytes=0;
  while(offset+8<=buffer.length){
    const id=buffer.toString('ascii',offset,offset+4),size=buffer.readUInt32LE(offset+4),start=offset+8;
    if(start+size>buffer.length)throw new Error('Voice-Fixture enthält einen ungültigen WAV-Chunk.');
    if(id==='fmt '&&size>=16)byteRate=buffer.readUInt32LE(start+8);
    if(id==='data')dataBytes+=size;
    offset=start+size+(size%2);
  }
  if(byteRate<=0||dataBytes<=0)throw new Error('Voice-Fixture enthält keine nutzbaren PCM-Daten.');
  return {bytes:buffer.length,durationMs:Math.round(dataBytes/byteRate*1000),sha256:crypto.createHash('sha256').update(buffer).digest('hex')};
}

function normalizedWords(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function semanticMatchCount(value){
  const text=normalizedWords(value);
  return [/(?:^| )g(?:u|ue)nni(?: |$)/,/(?:^| )sprach ?test(?: |$)/,/(?:^| )kalender(?: |$)/,/(?:^| )e ?mail(?: |$)/,/(?:^| )bereit(?: |$)/].filter(pattern=>pattern.test(text)).length;
}

async function responseJson(response,label){
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`${label} fehlgeschlagen (HTTP ${response.status}, Code ${String(payload.error||'UNKNOWN').slice(0,80)}).`);
  return payload;
}

const audio=fs.readFileSync(fixturePath),fixture=wavMetadata(audio);
if(fixture.durationMs<1000||fixture.durationMs>20_000)throw new Error('Voice-Fixture muss zwischen einer und zwanzig Sekunden lang sein.');

const login=await fetch(`${origin}/login`,{
  method:'POST',
  headers:{origin,'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({username:user,password}),
  redirect:'manual',
  signal:AbortSignal.timeout(20_000),
});
if(login.status!==303)throw new Error(`Günni-Login fehlgeschlagen (HTTP ${login.status}).`);
const cookie=String(login.headers.get('set-cookie')||'').split(';')[0];
if(!cookie)throw new Error('Günni-Sessioncookie fehlt.');

const release=await responseJson(await fetch(`${origin}/agentone/release.json?smoke=voice-audio`,{headers:{cookie},cache:'no-store',signal:AbortSignal.timeout(20_000)}),'Release-Status');
if(release.release!==expectedRelease)throw new Error(`Live-Release ist ${release.release} statt ${expectedRelease}.`);

const status=await responseJson(await fetch(`${origin}/agentone/voice/status`,{headers:{cookie},cache:'no-store',signal:AbortSignal.timeout(20_000)}),'Voice-Status');
if(status.schema!=='agentone.voice-transcription-status/v1'||status.status!=='LIVE'||status.configured!==true||status.model!=='gpt-transcribe'||status.languageField!=='languages[]'||status.secretsExposed!==false)throw new Error('Voice-Status ist nicht vollständig LIVE und secret-frei.');
if(status.limits?.minDurationMs!==expectedMinDurationMs||!status.supportedMimeTypes?.includes('audio/wav'))throw new Error(`Voice-Limits stimmen nicht: minDurationMs=${status.limits?.minDurationMs}.`);

const transcription=await responseJson(await fetch(`${origin}/agentone/voice/transcribe`,{
  method:'POST',
  headers:{cookie,origin,'content-type':'audio/wav','x-agentone-language':'de-DE','x-agentone-audio-duration-ms':String(fixture.durationMs)},
  body:audio,
  signal:AbortSignal.timeout(60_000),
}),'Audio-Transkription');

const matches=semanticMatchCount(transcription.text);
if(matches<3)throw new Error(`Voice-Transkription entsprach der Testfixture nicht ausreichend (Treffer ${matches}/5).`);
if(transcription.language!=='de-DE'||transcription.diagnostics?.model!=='gpt-transcribe'||transcription.diagnostics?.mimeType!=='audio/wav'||Number(transcription.diagnostics?.bytes)!==audio.length||!Number.isFinite(Number(transcription.diagnostics?.latencyMs)))throw new Error('Voice-Transkriptionsdiagnostik ist unvollständig.');

let logsChecked=false;
const sshHost=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const sshUser=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const sshKey=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
if(sshHost&&sshUser&&sshKey){
  const knownHosts=path.resolve('output/demo/known_hosts');
  const command=`set -eu\naccess=$(docker ps --format '{{.Names}}' | grep '^guenni-access-' | head -1)\ntest -n "$access"\ndocker logs --since 5m "$access" 2>&1 | tail -600`;
  const result=spawnSync('ssh',['-i',sshKey,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${sshUser}@${sshHost}`,command],{encoding:'utf8',timeout:60_000});
  if(result.status!==0)throw new Error('Voice-Loggrenze konnte nicht geprüft werden.');
  const logs=normalizedWords(result.stdout||''),normalizedTranscript=normalizedWords(transcription.text);
  if((normalizedTranscript.length>=8&&logs.includes(normalizedTranscript))||/sprach ?test/.test(logs)||/kalender und e ?mail sind bereit/.test(logs))throw new Error('Voice-Transkriptionsinhalt ist im Access-Log sichtbar.');
  logsChecked=true;
}

const report={
  origin,
  release:expectedRelease,
  fixture:{format:'audio/wav',bytes:fixture.bytes,durationMs:fixture.durationMs,sha256:fixture.sha256},
  transcription:{status:'PASS',model:transcription.diagnostics.model,language:transcription.language,semanticMatches:matches,latencyMs:Number(transcription.diagnostics.latencyMs)},
  server:{minDurationMs:status.limits.minDurationMs,languageField:status.languageField,logsChecked},
  transcriptExposed:false,
  audioExposed:false,
  secretsExposed:false,
};
const serialized=JSON.stringify(report);
if(/Günni Sprachtest|Kalender und E Mail sind bereit/i.test(serialized))throw new Error('Der öffentliche Smoke-Bericht enthält Transkriptinhalt.');
console.log(JSON.stringify(report,null,2));
