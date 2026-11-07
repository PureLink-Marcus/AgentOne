import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';

const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
async function waitFor(url){for(let attempt=0;attempt<60;attempt+=1){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Demo-Server wurde nicht bereit');}
function headers(token,userId,extra={}){return {'x-agentone-internal-token':token,'x-agentone-user':userId,...extra};}
async function stop(child){if(child.exitCode!==null)return;await new Promise(resolve=>{const timer=setTimeout(resolve,5_000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill();});}

const privateCalendar=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:private-1\r\nDTSTART;TZID=Europe/Berlin:20261108T090000\r\nDTEND;TZID=Europe/Berlin:20261108T100000\r\nSUMMARY:Arzttermin\r\nDESCRIPTION:niemals speichern\r\nLOCATION:private adresse\r\nATTENDEE:mailto:secret@example.test\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:private-2\r\nDTSTART:20261109T120000Z\r\nSUMMARY:Planung\r\nRRULE:FREQ=WEEKLY;INTERVAL=1\r\nEND:VEVENT\r\nEND:VCALENDAR`;

test('ICS upload is authenticated, minimized, user-isolated and replaceable',async()=>{
  const port=await freePort(),dataDir=mkdtempSync(path.join(os.tmpdir(),'agentone-ics-api-')),token='ics-internal-test-token-with-enough-length',origin=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server/demo-server.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),AGENTONE_DATA_DIR:dataDir,DATABASE_URL:'',AGENTONE_BASIC_AUTH_USER:'',AGENTONE_BASIC_AUTH_PASSWORD:'',AGENTONE_INTERNAL_API_TOKEN:token},stdio:'ignore'});
  try{
    await waitFor(`${origin}/api/health`);
    assert.equal((await fetch(`${origin}/api/internal/personal/calendar/ics`,{headers:headers('wrong','alice')})).status,403);
    const empty=await fetch(`${origin}/api/internal/personal/calendar/ics`,{headers:headers(token,'alice')}).then(response=>response.json());assert.equal(empty.status,'NOT_CONNECTED');assert.equal(empty.eventCount,0);
    const imported=await fetch(`${origin}/api/internal/personal/calendar/ics/import`,{method:'POST',headers:headers(token,'alice',{'content-type':'text/calendar'}),body:privateCalendar});assert.equal(imported.status,201);const result=await imported.json();assert.equal(result.status,'LIVE');assert.equal(result.eventCount,2);assert.equal(result.policy.descriptionStored,false);
    const alice=await fetch(`${origin}/api/internal/personal/events?source=calendar.ics`,{headers:headers(token,'alice')}).then(response=>response.json()),serialized=JSON.stringify(alice);assert.equal(alice.events.length,2);assert.equal(serialized.includes('niemals speichern'),false);assert.equal(serialized.includes('private adresse'),false);assert.equal(serialized.includes('secret@example.test'),false);
    const bob=await fetch(`${origin}/api/internal/personal/events?source=calendar.ics`,{headers:headers(token,'bob')}).then(response=>response.json());assert.equal(bob.events.length,0);
    const plan=await fetch(`${origin}/api/internal/personal/calendar/plan?date=2026-11-08&timeZone=Europe%2FBerlin&workdayStart=08%3A00&workdayEnd=18%3A00`,{headers:headers(token,'alice')}).then(response=>response.json()),planText=JSON.stringify(plan);assert.equal(plan.schema,'agentone.calendar.daily-plan/v1');assert.equal(plan.events.length,1);assert.equal(plan.events[0].title,'Arzttermin');assert.equal(plan.events[0].source,'calendar.ics');assert.equal(plan.policy.readOnly,true);assert.equal(planText.includes('niemals speichern'),false);assert.equal(planText.includes('private adresse'),false);assert.equal(planText.includes('secret@example.test'),false);
    const bobPlan=await fetch(`${origin}/api/internal/personal/calendar/plan?date=2026-11-08`,{headers:headers(token,'bob')}).then(response=>response.json());assert.equal(bobPlan.events.length,0);
    const rejectedFeed=await fetch(`${origin}/api/internal/personal/calendar/ics/feed`,{method:'POST',headers:headers(token,'alice',{'content-type':'application/json'}),body:JSON.stringify({url:'http://127.0.0.1/private.ics?token=must-not-leak'})});assert.equal(rejectedFeed.status,400);const rejectedFeedText=await rejectedFeed.text();assert.match(rejectedFeedText,/ICS_ENDPOINT_REJECTED/);assert.equal(rejectedFeedText.includes('must-not-leak'),false);
    assert.equal((await fetch(`${origin}/api/internal/personal/calendar/plan?unexpected=value`,{headers:headers(token,'alice')})).status,400);
    const malformed=await fetch(`${origin}/api/internal/personal/calendar/ics/import`,{method:'POST',headers:headers(token,'alice',{'content-type':'text/calendar'}),body:'not a calendar'});assert.equal(malformed.status,400);const failed=await malformed.json();assert.equal(failed.status,'ERROR');const preserved=await fetch(`${origin}/api/internal/personal/events?source=calendar.ics`,{headers:headers(token,'alice')}).then(response=>response.json());assert.equal(preserved.events.length,2);
    const replacement=privateCalendar.replace(/BEGIN:VEVENT\r\nUID:private-2[\s\S]*?END:VEVENT\r\n/,'');const replaced=await fetch(`${origin}/api/internal/personal/calendar/ics/import`,{method:'POST',headers:headers(token,'alice',{'content-type':'application/octet-stream'}),body:replacement});assert.equal(replaced.status,201);assert.equal((await replaced.json()).eventCount,1);
    const badType=await fetch(`${origin}/api/internal/personal/calendar/ics/import`,{method:'POST',headers:headers(token,'alice',{'content-type':'application/json'}),body:'{}'});assert.equal(badType.status,415);
    const unconfirmed=await fetch(`${origin}/api/internal/personal/calendar/ics`,{method:'DELETE',headers:headers(token,'alice',{'content-type':'application/json'}),body:'{}'});assert.equal(unconfirmed.status,409);
    const removed=await fetch(`${origin}/api/internal/personal/calendar/ics`,{method:'DELETE',headers:headers(token,'alice',{'content-type':'application/json'}),body:JSON.stringify({confirm:'REMOVE_ICS_CALENDAR'})});assert.equal(removed.status,200);assert.equal((await removed.json()).status,'NOT_CONNECTED');
    const tooLarge=await new Promise((resolve,reject)=>{const request=http.request({host:'127.0.0.1',port,path:'/api/internal/personal/calendar/ics/import',method:'POST',headers:{...headers(token,'alice',{'content-type':'text/calendar'}),'content-length':String(4*1024*1024+1)}},response=>{response.resume();response.once('end',()=>resolve(response.statusCode));});request.once('error',reject);request.end();});assert.equal(tooLarge,413);
  }finally{await stop(child);rmSync(dataDir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
