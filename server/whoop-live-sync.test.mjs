import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createHealthConsent } from './personal-health.mjs';
import { exchangeWhoopAuthorizationCode, prepareWhoopWebhookEnvelope, refreshWhoopToken, revokeWhoopAccess, syncWhoopReadOnly, whoopLiveSyncCapabilities } from './whoop-live-sync.mjs';

const consent=createHealthConsent({id:'consent-whoop',userId:'u1',providers:['whoop'],scopes:['activity','sleep','vitals','body','workouts'],grantedAt:'2026-10-01T00:00:00.000Z'});
const tokenPayload={access_token:'access-secret-never-public',refresh_token:'refresh-secret-rotated',expires_in:3600,token_type:'bearer',scope:'offline read:cycles read:recovery read:sleep read:workout read:body_measurement'};
const json=(value,{status=200,headers={}}={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});

test('authorization exchange and refresh rotate tokens without serializing them',async()=>{
  const requests=[],rotated=[],fetchImpl=async(url,options)=>{requests.push({url:String(url),body:String(options.body)});return json(tokenPayload);};
  const exchanged=await exchangeWhoopAuthorizationCode({clientId:'client-id',clientSecret:'client-secret',code:'authorization-code',redirectUri:'https://guenni.example/agentone/whoop/callback',fetchImpl,onRotatedRefreshToken:value=>rotated.push(value)});
  assert.equal(exchanged.accessToken,tokenPayload.access_token);assert.equal(exchanged.refreshToken,tokenPayload.refresh_token);assert.equal(exchanged.refreshRotated,true);assert.deepEqual(rotated,[tokenPayload.refresh_token]);assert.match(requests[0].body,/grant_type=authorization_code/);assert.match(requests[0].body,/redirect_uri=https%3A%2F%2Fguenni\.example/);assert.doesNotMatch(JSON.stringify(exchanged),/access-secret|refresh-secret/);
  const refreshed=await refreshWhoopToken({clientId:'client-id',clientSecret:'client-secret',refreshToken:'old-refresh-secret',fetchImpl});assert.equal(refreshed.refreshToken,tokenPayload.refresh_token);assert.match(requests[1].body,/grant_type=refresh_token/);assert.doesNotMatch(JSON.stringify(refreshed),/old-refresh|access-secret|refresh-secret/);
});

test('refresh fails closed when WHOOP omits the newly rotated refresh token',async()=>{const rotated=[];await assert.rejects(()=>refreshWhoopToken({clientId:'client-id',clientSecret:'client-secret',refreshToken:'old-refresh-must-not-be-reused',fetchImpl:async()=>json({access_token:'new-access',expires_in:3600,scope:'offline read:sleep'}),onRotatedRefreshToken:value=>rotated.push(value)}),error=>error.code==='WHOOP_INVALID_TOKEN_RESPONSE'&&error.retryable===false);assert.deepEqual(rotated,[]);});

test('disconnect uses the documented V2 revoke operation and redacts credentials',async()=>{
  const calls=[],success=await revokeWhoopAccess({accessToken:'access-secret-never-public',fetchImpl:async(url,options)=>{calls.push({url:String(url),method:options.method,authorization:options.headers.authorization});return new Response(null,{status:204});}});
  assert.deepEqual(success,{provider:'whoop',revoked:true,alreadyRevoked:false,secretsExposed:false});
  assert.equal(calls[0].url,'https://api.prod.whoop.com/developer/v2/user/access');assert.equal(calls[0].method,'DELETE');assert.equal(calls[0].authorization,'Bearer access-secret-never-public');assert.doesNotMatch(JSON.stringify(success),/access-secret/);
  await assert.rejects(()=>revokeWhoopAccess({accessToken:'access-secret-never-public',fetchImpl:async()=>new Response(null,{status:401})}),error=>error.code==='WHOOP_AUTHORIZATION_REQUIRED');
  await assert.rejects(()=>revokeWhoopAccess({accessToken:'access-secret-never-public',fetchImpl:async()=>new Response('upstream secret',{status:429,headers:{'retry-after':'7'}})}),error=>error.code==='WHOOP_RATE_LIMITED'&&error.retryAfterSeconds===7&&!String(error.message).includes('upstream'));
  await assert.rejects(()=>revokeWhoopAccess({accessToken:'access-secret-never-public',fetchImpl:async()=>new Response(null,{status:429,headers:{'x-ratelimit-reset':'11'}})}),error=>error.code==='WHOOP_RATE_LIMITED'&&error.retryAfterSeconds===11);
});

function whoopFixtureFetch({partial=false,rateLimited=false,tokenScope=tokenPayload.scope}={}){
  const calls=[];
  const fetchImpl=async(input,options={})=>{
    const url=new URL(String(input));calls.push({url:url.toString(),authorization:options.headers?.authorization||''});
    if(url.toString().includes('/oauth/oauth2/token'))return json({...tokenPayload,scope:tokenScope});
    if(url.pathname.endsWith('/cycle')){
      if(rateLimited)return json({provider_message:'contains sensitive upstream text'},{status:429,headers:{'retry-after':'12'}});
      if(partial)return json({provider_message:'do not expose'},{status:500});
      if(!url.searchParams.get('nextToken'))return json({records:[{id:1,created_at:'2026-11-06T09:00:00.000Z',updated_at:'2026-11-06T10:00:00.000Z',start:'2026-11-06T00:00:00.000Z',end:'2026-11-06T08:00:00.000Z',timezone_offset:'+01:00',score_state:'SCORED',step_count:8000,score:{strain:7,kilojoule:1000,average_heart_rate:65}}],next_token:'cycle-page-2'});
      return json({records:[{id:2,created_at:'2026-11-05T09:00:00.000Z',updated_at:'2026-11-05T10:00:00.000Z',start:'2026-11-05T00:00:00.000Z',end:'2026-11-05T08:00:00.000Z',timezone_offset:'+01:00',score_state:'SCORED',step_count:7500,score:{strain:6,kilojoule:900,average_heart_rate:63}}]});
    }
    if(url.pathname.endsWith('/recovery'))return json({records:[{cycle_id:1,sleep_id:'123e4567-e89b-12d3-a456-426614174000',created_at:'2026-11-06T09:00:00.000Z',updated_at:'2026-11-06T10:00:00.000Z',score_state:'SCORED',score:{recovery_score:61,resting_heart_rate:58,hrv_rmssd_milli:42,spo2_percentage:97,skin_temp_celsius:33.2}}]});
    if(url.pathname.endsWith('/activity/sleep'))return json({records:[{id:'123e4567-e89b-12d3-a456-426614174000',cycle_id:1,created_at:'2026-11-06T09:00:00.000Z',updated_at:'2026-11-06T10:00:00.000Z',start:'2026-11-05T23:00:00.000Z',end:'2026-11-06T07:00:00.000Z',timezone_offset:'+01:00',nap:false,score_state:'SCORED',score:{stage_summary:{total_light_sleep_time_milli:12_000_000,total_slow_wave_sleep_time_milli:4_000_000,total_rem_sleep_time_milli:5_000_000},sleep_performance_percentage:90,sleep_consistency_percentage:82,sleep_efficiency_percentage:88,respiratory_rate:15}}]});
    if(url.pathname.endsWith('/activity/workout'))return json({records:[{id:'223e4567-e89b-12d3-a456-426614174000',created_at:'2026-11-06T18:00:00.000Z',updated_at:'2026-11-06T19:00:00.000Z',start:'2026-11-06T17:00:00.000Z',end:'2026-11-06T18:00:00.000Z',timezone_offset:'+01:00',score_state:'SCORED',sport_name:'Cycling',score:{strain:8}}]});
    if(url.pathname.endsWith('/user/measurement/body'))return json({height_meter:1.82,weight_kilogram:82,max_heart_rate:190});
    throw new Error(`unexpected ${url}`);
  };
  return {fetchImpl,calls};
}

test('sync paginates V2 collections, normalizes health metrics and remains idempotent',async()=>{
  const {fetchImpl,calls}=whoopFixtureFetch(),rotated=[];
  const first=await syncWhoopReadOnly({clientId:'client-id',clientSecret:'client-secret',refreshToken:'refresh-old',consent,fetchImpl,onRotatedRefreshToken:value=>rotated.push(value),now:'2026-11-07T12:00:00.000Z',retentionDays:30});
  assert.equal(first.status,'LIVE');assert.equal(first.stats.cycles.pages,2);assert.equal(first.stats.cycles.records,2);assert.ok(first.metrics.some(item=>item.metric==='recovery_score_percent'));assert.ok(first.metrics.some(item=>item.metric==='sleep_minutes'));assert.ok(first.metrics.some(item=>item.metric==='body_mass_kg'));assert.equal(first.cursor.syncedThrough,'2026-11-07T12:00:00.000Z');assert.deepEqual(rotated,['refresh-secret-rotated']);assert.ok(calls.every(call=>!call.url.includes('access-secret')&&!call.url.includes('refresh-secret')));assert.doesNotMatch(JSON.stringify(first),/access-secret|refresh-secret|client-secret/);
  const secondFetch=whoopFixtureFetch(),second=await syncWhoopReadOnly({clientId:'client-id',clientSecret:'client-secret',refreshToken:'refresh-old',consent,fetchImpl:secondFetch.fetchImpl,previousMetrics:first.metrics,cursor:first.cursor,now:'2026-11-07T12:00:00.000Z',retentionDays:30});assert.equal(second.metrics.length,first.metrics.length);assert.ok(secondFetch.calls.some(call=>new URL(call.url).searchParams.get('start')==='2026-11-07T06:00:00.000Z'));
});

test('partial provider failure preserves successful normalized sources and does not advance cursor',async()=>{
  const {fetchImpl}=whoopFixtureFetch({partial:true}),cursor={syncedThrough:'2026-11-06T12:00:00.000Z',overlapHours:6},result=await syncWhoopReadOnly({clientId:'client-id',clientSecret:'client-secret',refreshToken:'refresh-old',consent,fetchImpl,cursor,now:'2026-11-07T12:00:00.000Z'});assert.equal(result.status,'PARTIAL');assert.deepEqual(result.cursor,cursor);assert.equal(result.failures[0].component,'cycles');assert.equal(result.failures[0].code,'WHOOP_PROVIDER_UNAVAILABLE');assert.ok(result.metrics.some(item=>item.metric==='sleep_minutes'));assert.doesNotMatch(JSON.stringify(result),/do not expose/);
});

test('refresh responses containing only offline scope keep the configured minimal read grants',async()=>{const {fetchImpl}=whoopFixtureFetch({tokenScope:'offline'}),result=await syncWhoopReadOnly({clientId:'client-id',clientSecret:'client-secret',refreshToken:'refresh-old',consent,fetchImpl,grantedScopes:['read:sleep'],now:'2026-11-07T12:00:00.000Z'});assert.equal(result.status,'LIVE');assert.deepEqual(Object.keys(result.stats),['sleeps']);assert.ok(result.metrics.some(item=>item.metric==='sleep_minutes'));});

test('rate limiting returns stable retry guidance without provider text or credentials',async()=>{
  const {fetchImpl}=whoopFixtureFetch({rateLimited:true});await assert.rejects(()=>syncWhoopReadOnly({clientId:'client-id',clientSecret:'client-secret',refreshToken:'refresh-old',consent,fetchImpl,grantedScopes:['read:cycles'],now:'2026-11-07T12:00:00.000Z'}),error=>{assert.equal(error.code,'WHOOP_RATE_LIMITED');assert.equal(error.retryAfterSeconds,12);assert.doesNotMatch(String(error.message),/provider_message|sensitive|secret/);return true;});
});

test('webhook envelope verifies the official signature and rejects replay or stale requests',()=>{
  const secret='webhook-secret-kept-server-side',timestamp=String(Date.parse('2026-11-07T12:00:00.000Z')),payload={user_id:10129,id:'123e4567-e89b-12d3-a456-426614174000',type:'sleep.updated',trace_id:'d3709ee7-104e-4f70-a928-2932964b017b'},rawBody=Buffer.from(JSON.stringify(payload)),signature=createHmac('sha256',secret).update(timestamp+rawBody.toString('utf8')).digest('base64'),headers={'X-WHOOP-Signature':signature,'X-WHOOP-Signature-Timestamp':timestamp},replayCache=new Set();
  const envelope=prepareWhoopWebhookEnvelope({rawBody,headers,secret,replayCache,now:Number(timestamp)});assert.equal(envelope.signatureVerified,true);assert.equal(envelope.operation,'refresh');assert.equal(envelope.rawBodyRetained,false);assert.doesNotMatch(JSON.stringify(envelope),/webhook-secret/);assert.throws(()=>prepareWhoopWebhookEnvelope({rawBody,headers,secret,replayCache,now:Number(timestamp)}),error=>error.code==='WHOOP_WEBHOOK_REPLAY');assert.throws(()=>prepareWhoopWebhookEnvelope({rawBody,headers,secret,replayCache:new Set(),now:Number(timestamp)+600_000}),error=>error.code==='WHOOP_WEBHOOK_SIGNATURE_INVALID');
});

test('capabilities expose only user OAuth read paths and require a webhook queue',()=>{assert.equal(whoopLiveSyncCapabilities.authorization,'oauth2-authorization-code');assert.equal(whoopLiveSyncCapabilities.tokenRotation,true);assert.equal(whoopLiveSyncCapabilities.webhookQueueRequired,true);assert.equal(whoopLiveSyncCapabilities.scopes.includes('read:profile'),false);});
