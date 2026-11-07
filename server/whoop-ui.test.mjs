import test from 'node:test';
import assert from 'node:assert/strict';
import { appleDirectPairingPresentation,personalUiCss,personalUiJs,whoopDisconnectNotice } from './personal-ui.mjs';
import { companionPairJs } from './companion-pair-page.mjs';

test('WHOOP mobile card exposes honest states and complete user controls',()=>{
  assert.doesNotThrow(()=>new Function(personalUiJs));
  for(const state of ['NOT_CONFIGURED','READY','CONNECTING','LIVE','RECONNECT_REQUIRED','DEGRADED'])assert.match(personalUiJs,new RegExp(`(?:^|[^A-Z_])${state}(?:[^A-Z_]|$)`));
  assert.match(personalUiJs,/WHOOP-Verbindung/);
  assert.match(personalUiJs,/location\.assign\('\/agentone\/whoop\/start'\)/);
  assert.match(personalUiJs,/fetch\('\/agentone\/whoop\/sync',\{method:'POST'/);
  assert.match(personalUiJs,/fetch\('\/agentone\/whoop\/connection',\{method:'DELETE'/);
  assert.match(personalUiJs,/confirm\('WHOOP-Verbindung lokal entfernen und Widerruf beim Anbieter versuchen\?/);
  assert.match(personalUiJs,/WHOOP kann den Widerruf ablehnen oder nicht bestätigen/);
  assert.doesNotMatch(personalUiJs,/Der Providerzugriff wird widerrufen|WHOOP-Zugriff wurde widerrufen\./);
  assert.match(personalUiJs,/LETZTE SYNCHRONISIERUNG/);
  assert.match(personalUiJs,/READ ONLY/);
  assert.match(personalUiJs,/GETRENNT VON APPLE/);
  assert.match(personalUiJs,/scope\.label[\s\S]*textContent/);
  assert.doesNotMatch(personalUiJs,/whoop-redirect|REDIRECT ·/);
  assert.match(personalUiCss,/\.whoop-actions button\{min-height:44px/);
  assert.match(personalUiCss,/@media\(max-width:680px\)[^{]*\{[\s\S]*\.whoop-actions button\{width:100%;min-height:48px\}/);
});

test('WHOOP disconnect copy distinguishes confirmed provider revoke from local-only removal',()=>{
  assert.match(whoopDisconnectNotice({providerRevocationConfirmed:true,providerStatus:'REVOKED_CONFIRMED'}),/Anbieter-Widerruf bestätigt/);
  assert.doesNotMatch(whoopDisconnectNotice({providerRevocationConfirmed:true,providerStatus:'REVOKED_CONFIRMED'}),/unbestätigt|unbekannt/);
  assert.match(whoopDisconnectNotice({providerRevocationConfirmed:false,providerReviewRequired:true,providerStatus:'REVOCATION_UNCONFIRMED'}),/Lokale WHOOP-Verbindung entfernt/);
  assert.match(whoopDisconnectNotice({providerRevocationConfirmed:false,providerReviewRequired:true,providerStatus:'REVOCATION_UNCONFIRMED'}),/WHOOP-Dashboard prüfen und dort widerrufen/);
  assert.match(whoopDisconnectNotice({providerStatus:'NO_LOCAL_CONNECTION'}),/Anbieterzugriff noch besteht, ist unbekannt/);
  assert.match(whoopDisconnectNotice({}),/Anbieterstatus ist unbestätigt/);
  assert.match(personalUiJs,/whoopCallbackNotice=whoopDisconnectNotice\(data\)/);
});

test('WHOOP callback feedback is consumed and removed from browser history',()=>{
  assert.match(personalUiJs,/url\.searchParams\.get\('whoop'\)/);
  assert.match(personalUiJs,/url\.searchParams\.delete\('whoop'\)/);
  assert.match(personalUiJs,/url\.searchParams\.delete\('code'\)/);
  assert.match(personalUiJs,/history\.replaceState\(\{\},document\.title,clean\)/);
  assert.match(personalUiJs,/\^\[A-Z\]\[A-Z0-9_\]\{2,63\}\$/);
  assert.doesNotMatch(personalUiJs,/searchParams\.get\('state'\)|searchParams\.get\('access_token'\)|searchParams\.get\('refresh_token'\)/);
});

test('Apple quickstart separates same-iPhone fragment pairing from secret-free base setup',()=>{
  assert.deepEqual(appleDirectPairingPresentation({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)',code:'123456'}),{visible:true,label:'Direkt in Safari koppeln',mode:'safari',href:'/iphone#code=123456'});
  assert.deepEqual(appleDirectPairingPresentation({userAgent:'Mozilla/5.0 (iPhone)',standalone:true,code:'654321'}),{visible:true,label:'In dieser App koppeln',mode:'standalone',href:'/iphone#code=654321'});
  assert.deepEqual(appleDirectPairingPresentation({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:'Win32',code:'123456'}),{visible:false,label:'Direkt in Safari koppeln',mode:'safari',href:'/iphone#code=123456'});
  assert.deepEqual(appleDirectPairingPresentation({userAgent:'Mozilla/5.0 (Macintosh)',platform:'MacIntel',maxTouchPoints:5}),{visible:true,label:'Direkt in Safari koppeln',mode:'safari',href:null});
  assert.equal(appleDirectPairingPresentation({userAgent:'iPhone',code:'12345x'}).href,null);
  assert.match(personalUiJs,/direct\.href=directPresentation\.href/);
  assert.match(personalUiJs,/\/\^\\d\{6\}\$\//);
  assert.doesNotMatch(personalUiJs,/\/\^d\{6\}\$\//);
  assert.match(personalUiJs,/direct\.hidden=!directPresentation\.visible/);
  assert.match(personalUiJs,/direct\.textContent=directPresentation\.label/);
  assert.match(personalUiJs,/Basis-Seite für anderes iPhone/);
  assert.match(personalUiJs,/direct\.rel='noopener'/);
  assert.match(personalUiJs,/baseUrl=location\.origin\+'\/iphone'/);
  assert.doesNotMatch(personalUiJs,/baseUrl[^\n]{0,120}[?&]code=/);
  assert.match(companionPairJs,/location\.hash\.replace/);
  assert.match(companionPairJs,/history\.replaceState\(\{\},'',location\.pathname\+location\.search\)/);
  assert.match(companionPairJs,/consumeFragmentCode\(\);/);
});
