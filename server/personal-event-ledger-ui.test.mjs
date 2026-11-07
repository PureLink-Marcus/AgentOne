import test from 'node:test';
import assert from 'node:assert/strict';

import { personalUiJs } from './personal-ui.mjs';

function ledgerUi(){const start=personalUiJs.indexOf('const ledgerCenter'),marker='\n  loadEventLedger();',end=personalUiJs.indexOf(marker,start)+marker.length;assert.ok(start>=0&&end>start+marker.length,'Ledger-UI-Block fehlt');return personalUiJs.slice(start,end);}

test('personal UI payload remains valid browser JavaScript',()=>{assert.doesNotThrow(()=>new Function(personalUiJs));});

test('personal UI exposes the minimized mobile Event Ledger card and source filter',()=>{
  const ui=ledgerUi();
  for(const value of ['PERSONAL EVENT LEDGER','Deine sichere Zeitachse','ledger-total','ledger-source-count','ledger-visible','ledger-source','ledger-refresh','ledger-feed','Zeitpunkt, Quelle, Typ und kurze Zusammenfassung'])assert.match(ui,new RegExp(value));
  assert.match(ui,/fetch\('\/agentone\/events\?'/);
  assert.match(ui,/event\.occurredAt/);assert.match(ui,/event\.source/);assert.match(ui,/event\.type/);assert.match(ui,/event\.summary/);
  assert.doesNotMatch(ui,/structuredPayload|provenance|consentId|sourceEventId|dedupeKey/);
});

test('Ledger export is an explicit plaintext download with the server confirmation phrase',()=>{
  const ui=ledgerUi();
  assert.match(ui,/SENSIBLER KLARTEXT-EXPORT/);
  assert.match(ui,/querySelector\('#ledger-export'\)\.addEventListener\('click'.*confirm\(.*\/agentone\/events\/export.*method:'POST'.*EXPORT_MY_PERSONAL_EVENTS/s);
  assert.match(ui,/URL\.createObjectURL/);assert.match(ui,/agentone-personal-events-/);
});

test('Ledger deletion exists only behind the exact irreversible confirmation phrase',()=>{
  const ui=ledgerUi();
  assert.match(ui,/LÖSCHEN IST UNWIDERRUFLICH/);
  assert.match(ui,/querySelector\('#ledger-delete'\)\.addEventListener\('click'.*prompt\('UNWIDERRUFLICH:.*DELETE_MY_PERSONAL_EVENTS'.*phrase!=='DELETE_MY_PERSONAL_EVENTS'.*method:'DELETE'.*confirm:'DELETE_MY_PERSONAL_EVENTS'/s);
  assert.equal((ui.match(/method:'DELETE'/g)||[]).length,1);
});
