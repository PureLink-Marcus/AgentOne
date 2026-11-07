import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { createWhoopOnboardingStart, verifyWhoopOnboardingState } from './whoop-onboarding.mjs';
import {
  acquireWhoopSyncLease,
  consumeWhoopOAuthState,
  deleteWhoopConnection,
  getWhoopConnection,
  hasPendingWhoopOAuthState,
  initWhoopConnectionStore,
  publicWhoopConnection,
  recordWhoopSyncFailure,
  recordWhoopSyncSuccess,
  releaseWhoopSyncLease,
  rotateWhoopRefreshToken,
  saveWhoopConnection,
  saveWhoopOAuthState,
} from './whoop-connection-store.mjs';

const masterSecret='whoop-token-master-key-that-is-long-enough-for-tests';
const config={clientId:'client-id',clientSecret:'client-secret',stateSecret:'whoop-state-secret-that-is-at-least-thirty-two-bytes',redirectUri:'https://guenni.example.test/agentone/whoop/callback',scopes:['offline','read:sleep','read:recovery']};
function database(){const db=new DatabaseSync(':memory:');initWhoopConnectionStore(db);return db;}

test('OAuth state persists, binds user and redirect, and is consumed exactly once',()=>{
  const db=database(),start=createWhoopOnboardingStart({config,userId:'guenni',now:'2026-11-07T10:00:00.000Z'});saveWhoopOAuthState(db,{record:start.stateRecord});
  assert.throws(()=>consumeWhoopOAuthState(db,{state:start.state,userId:'fressi',config,redirectUri:config.redirectUri,verify:verifyWhoopOnboardingState,now:'2026-11-07T10:01:00.000Z'}),error=>error.code==='WHOOP_STATE_INVALID');
  const consumed=consumeWhoopOAuthState(db,{state:start.state,userId:'guenni',config,redirectUri:config.redirectUri,verify:verifyWhoopOnboardingState,now:'2026-11-07T10:01:00.000Z'});assert.equal(consumed.userId,'guenni');assert.equal(consumed.consumed,true);
  assert.throws(()=>consumeWhoopOAuthState(db,{state:start.state,userId:'guenni',config,redirectUri:config.redirectUri,verify:verifyWhoopOnboardingState,now:'2026-11-07T10:02:00.000Z'}),error=>error.code==='WHOOP_STATE_REPLAY');
  assert.equal(db.prepare('SELECT consumed_at AS consumedAt FROM personal_whoop_oauth_states').get().consumedAt,'2026-11-07T10:01:00.000Z');
});

test('the first valid callback atomically closes every parallel OAuth state for that user',()=>{const db=database(),first=createWhoopOnboardingStart({config,userId:'guenni',now:'2026-11-07T10:00:00.000Z'}),second=createWhoopOnboardingStart({config,userId:'guenni',now:'2026-11-07T10:00:01.000Z'});saveWhoopOAuthState(db,{record:first.stateRecord});saveWhoopOAuthState(db,{record:second.stateRecord});assert.equal(hasPendingWhoopOAuthState(db,{userId:'guenni',asOf:'2026-11-07T10:00:02.000Z'}),true);consumeWhoopOAuthState(db,{state:first.state,userId:'guenni',config,redirectUri:config.redirectUri,verify:verifyWhoopOnboardingState,now:'2026-11-07T10:00:03.000Z'});assert.equal(hasPendingWhoopOAuthState(db,{userId:'guenni',asOf:'2026-11-07T10:00:04.000Z'}),false);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM personal_whoop_oauth_states WHERE user_id=? AND consumed_at IS NULL').get('guenni').count,0);assert.throws(()=>consumeWhoopOAuthState(db,{state:second.state,userId:'guenni',config,redirectUri:config.redirectUri,verify:verifyWhoopOnboardingState,now:'2026-11-07T10:00:05.000Z'}),error=>error.code==='WHOOP_STATE_REPLAY');});

test('repeated OAuth starts remain bounded and the newest retained state stays valid',()=>{const db=database();let latest;for(let index=0;index<30;index+=1){latest=createWhoopOnboardingStart({config,userId:'guenni',now:new Date(Date.parse('2026-11-07T10:00:00.000Z')+index*1000)});saveWhoopOAuthState(db,{record:latest.stateRecord});}assert.equal(db.prepare('SELECT COUNT(*) AS count FROM personal_whoop_oauth_states WHERE user_id=? AND consumed_at IS NULL').get('guenni').count,5);assert.ok(db.prepare('SELECT COUNT(*) AS count FROM personal_whoop_oauth_states').get().count<=20);consumeWhoopOAuthState(db,{state:latest.state,userId:'guenni',config,redirectUri:config.redirectUri,verify:verifyWhoopOnboardingState,now:'2026-11-07T10:00:31.000Z'});for(let index=0;index<30;index+=1){latest=createWhoopOnboardingStart({config,userId:'guenni',now:new Date(Date.parse('2026-11-07T10:01:00.000Z')+index*1000)});saveWhoopOAuthState(db,{record:latest.stateRecord});}assert.ok(db.prepare('SELECT COUNT(*) AS count FROM personal_whoop_oauth_states WHERE user_id=?').get('guenni').count<=20);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM personal_whoop_oauth_states WHERE user_id=? AND consumed_at IS NULL').get('guenni').count,5);const verified=consumeWhoopOAuthState(db,{state:latest.state,userId:'guenni',config,redirectUri:config.redirectUri,verify:verifyWhoopOnboardingState,now:'2026-11-07T10:01:31.000Z'});assert.equal(verified.userId,'guenni');assert.equal(hasPendingWhoopOAuthState(db,{userId:'guenni',asOf:'2026-11-07T10:01:32.000Z'}),false);});

test('refresh token is encrypted with per-user AAD and absent from public projections',()=>{
  const db=database(),connection=saveWhoopConnection(db,{userId:'guenni',refreshToken:'refresh-secret-original',masterSecret,grantedScopes:['offline','read:sleep'],consentId:'consent-whoop',authorizedAt:'2026-11-07T10:00:00.000Z'}),raw=db.prepare('SELECT * FROM personal_whoop_connections').get();
  assert.doesNotMatch(JSON.stringify(raw),/refresh-secret-original/);assert.equal(Object.hasOwn(connection,'refreshToken'),false);
  const internal=getWhoopConnection(db,{userId:'guenni',masterSecret,includeRefreshToken:true});assert.equal(internal.refreshToken,'refresh-secret-original');assert.doesNotMatch(JSON.stringify(internal),/refresh-secret-original/);
  assert.throws(()=>getWhoopConnection(db,{userId:'guenni',masterSecret:'different-master-secret-that-is-long-enough',includeRefreshToken:true}),error=>error.code==='WHOOP_TOKEN_CORRUPT');
  const publicValue=publicWhoopConnection(connection);assert.equal(publicValue.connected,true);assert.equal(publicValue.secretsExposed,false);assert.doesNotMatch(JSON.stringify(publicValue),/refresh-secret/);
});

test('rotated refresh tokens are persisted before future reads and connections stay user-isolated',()=>{
  const db=database();saveWhoopConnection(db,{userId:'guenni',refreshToken:'refresh-secret-original',masterSecret,grantedScopes:['read:sleep'],consentId:'consent-whoop'});const before=db.prepare('SELECT refresh_ciphertext AS value FROM personal_whoop_connections WHERE user_id=?').get('guenni').value;
  rotateWhoopRefreshToken(db,{userId:'guenni',refreshToken:'refresh-secret-rotated',masterSecret,tokenExpiresAt:'2026-11-07T12:00:00.000Z'});const after=db.prepare('SELECT refresh_ciphertext AS value FROM personal_whoop_connections WHERE user_id=?').get('guenni').value;
  assert.notEqual(after,before);assert.equal(getWhoopConnection(db,{userId:'guenni',masterSecret,includeRefreshToken:true}).refreshToken,'refresh-secret-rotated');assert.equal(getWhoopConnection(db,{userId:'fressi'}),null);
});

test('sync leases serialize refresh rotation and success/failure state is bounded',()=>{
  const db=database();saveWhoopConnection(db,{userId:'guenni',refreshToken:'refresh-secret-original',masterSecret,grantedScopes:['read:sleep'],consentId:'consent-whoop'});
  const lease=acquireWhoopSyncLease(db,{userId:'guenni',now:'2026-11-07T10:00:00.000Z',leaseSeconds:60});assert.equal(lease.lockedUntil,'2026-11-07T10:01:00.000Z');assert.throws(()=>acquireWhoopSyncLease(db,{userId:'guenni',now:'2026-11-07T10:00:30.000Z'}),error=>error.code==='WHOOP_SYNC_BUSY');releaseWhoopSyncLease(db,{userId:'guenni'});
  acquireWhoopSyncLease(db,{userId:'guenni',now:'2026-11-07T10:02:00.000Z'});recordWhoopSyncSuccess(db,{userId:'guenni',cursor:{syncedThrough:'2026-11-07T10:02:00.000Z'},lastSync:{status:'LIVE',syncedAt:'2026-11-07T10:02:00.000Z',metrics:12,inserted:10,updated:2,unchanged:0,failures:0},nextAttemptAt:'2026-11-07T10:17:00.000Z'});assert.equal(getWhoopConnection(db,{userId:'guenni'}).lastSync.metrics,12);
  const failed=recordWhoopSyncFailure(db,{userId:'guenni',code:'WHOOP_RATE_LIMITED',nextAttemptAt:'2026-11-07T10:32:00.000Z'});assert.equal(failed.failureCount,1);assert.equal(failed.lastSync.errorCode,'WHOOP_RATE_LIMITED');
  assert.equal(deleteWhoopConnection(db,{userId:'guenni'}).deleted,true);assert.equal(getWhoopConnection(db,{userId:'guenni'}),null);
});
