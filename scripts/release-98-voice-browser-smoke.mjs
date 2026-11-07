import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
const waitFor=async url=>{for(let attempt=0;attempt<60;attempt+=1){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Lokaler AgentOne-Proxy wurde nicht bereit');};

const upstreamPort=await freePort(),proxyPort=await freePort();
const upstream=http.createServer((_request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><title>AgentOne Voice Smoke</title>');});
await new Promise(resolve=>upstream.listen(upstreamPort,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${proxyPort}`;
const proxy=spawn(process.execPath,['server/basic-proxy.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(proxyPort),UPSTREAM_URL:`http://127.0.0.1:${upstreamPort}`,BASIC_AUTH_USER:'voice-browser',BASIC_AUTH_PASSWORD:'voice-browser-password',AUTHENTICATED_USER:'voice-browser@local',AGENTONE_DISPLAY_NAME:'Günni',OPENAI_API_KEY:'',ACCESS_SESSION_SECRET:'voice-browser-session-secret-with-more-than-32-characters',PUBLIC_ORIGIN:origin},stdio:'ignore'});

let browser;
try{
  await waitFor(`${origin}/proxy-health`);
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:430,height:932}}),pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.addInitScript(()=>{
    try{localStorage.setItem('agentone.voice.preferences.v2',JSON.stringify({language:'en-US',voice:'jarvis',microphone:'default'}));}catch{}
    window.__voiceGetUserMediaCalls=0;
    const mediaDevices={
      async getUserMedia(){window.__voiceGetUserMediaCalls+=1;return{getTracks:()=>[{stop(){}}]};},
      async enumerateDevices(){return[{kind:'audioinput',deviceId:'default',label:'Test microphone'}];},
      addEventListener(){},
    };
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:mediaDevices});
    class FakeMediaRecorder{
      static isTypeSupported(type){return type==='audio/webm;codecs=opus'||type==='audio/webm';}
      constructor(){this.state='inactive';this.mimeType='audio/webm;codecs=opus';}
      start(){this.state='recording';}
      stop(){if(this.state!=='recording')return;this.state='inactive';const data=new Blob([new Uint8Array(2048)],{type:this.mimeType});this.ondataavailable?.({data});setTimeout(()=>this.onstop?.(),0);}
    }
    Object.defineProperty(window,'MediaRecorder',{configurable:true,value:FakeMediaRecorder});
  });
  let streamRequests=0,transcriptionRequests=0;
  await page.route('**/agentone/voice/transcribe',async route=>{transcriptionRequests+=1;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Automatisch gesendete Testaufnahme.',diagnostics:{latencyMs:12}})});});
  await page.route('**/agentone/voice/chat/stream',async route=>{streamRequests+=1;await new Promise(resolve=>setTimeout(resolve,180));await route.fulfill({status:200,contentType:'application/x-ndjson',body:'{"type":"started","assistant":"Günni","model":"gpt-6-luna","language":"de-DE"}\n{"type":"delta","delta":"Erster Satz."}\n{"type":"delta","delta":" Zweiter Satz."}\n{"type":"done"}\n'});});
  await page.goto(`${origin}/login`);
  await page.locator('input[name="username"]').fill('voice-browser');
  await page.locator('input[name="password"]').fill('voice-browser-password');
  await Promise.all([page.waitForURL(`${origin}/`),page.locator('button[type="submit"]').click()]);
  await page.locator('[data-view="voice"]').click();
  if(await page.locator('#voice-language').inputValue()!=='en-US')throw new Error('Bestehende Voice-v2-Einstellungen wurden nicht übernommen');
  if(!await page.locator('#voice-auto-send').isChecked())throw new Error('Auto-Send ist nicht standardmäßig aktiv');
  await page.locator('#voice-auto-send').uncheck();
  const disabledPreference=await page.evaluate(()=>JSON.parse(localStorage.getItem('agentone.voice.preferences.v2')||'{}').autoSend);
  if(disabledPreference!==false)throw new Error('Auto-Send-Auswahl wurde nicht gespeichert');
  await page.locator('#voice-auto-send').check();
  await page.locator('#voice-record').click();
  await page.waitForTimeout(1050);
  await page.locator('#voice-record').click();
  await page.waitForRequest(request=>request.url().includes('/agentone/voice/chat/stream'));
  if(!await page.locator('#voice-record').isDisabled())throw new Error('Aufnahme ist während Voice-Stream nicht gesperrt');
  await page.evaluate(()=>document.querySelector('#voice-record').click());
  await page.locator('.voice-message.agent').last().filter({hasText:'Erster Satz. Zweiter Satz.'}).waitFor();
  await page.locator('#voice-status').filter({hasText:'STREAM'}).waitFor();
  if(transcriptionRequests!==1||streamRequests!==1)throw new Error(`Auto-Send war nicht exakt einmalig: transcribe=${transcriptionRequests}, stream=${streamRequests}`);
  if(await page.evaluate(()=>window.__voiceGetUserMediaCalls)!==1)throw new Error('Während der Antwort wurde eine zweite Aufnahme gestartet');
  await page.locator('#voice-text').fill('Doppelklick testen');
  await page.evaluate(()=>{const button=document.querySelector('#voice-send');button.click();button.click();});
  await page.locator('.voice-message.agent').last().filter({hasText:'Erster Satz. Zweiter Satz.'}).waitFor();
  await page.locator('#voice-status').filter({hasText:'STREAM'}).waitFor();
  if(streamRequests!==2)throw new Error(`Doppelklick startete ${streamRequests-1} statt genau einen weiteren Stream`);
  if(pageErrors.length)throw new Error(pageErrors.join(' | '));
  await mkdir(path.resolve('output/playwright'),{recursive:true});
  const screenshot=path.resolve('output/playwright/release-98-voice-mobile.png');
  await page.screenshot({path:screenshot,fullPage:true});
  process.stdout.write(JSON.stringify({ok:true,autoSend:'PERSISTED+ONCE',transcriptionRequests,streamRequests,getUserMediaCalls:1,stream:'NDJSON',screenshot,secretsExposed:false})+'\n');
}finally{
  await browser?.close();
  proxy.kill('SIGTERM');
  await new Promise(resolve=>upstream.close(resolve));
}
