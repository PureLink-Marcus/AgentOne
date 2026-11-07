import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const fixturePath=path.resolve('scripts/fixtures/release98-voice-smoke-de.wav');

test('release 98 voice fixture is deterministic, synthetic WAV audio',()=>{
  const audio=fs.readFileSync(fixturePath);
  assert.equal(audio.toString('ascii',0,4),'RIFF');
  assert.equal(audio.toString('ascii',8,12),'WAVE');
  assert.equal(audio.length,233_632);
  assert.equal(crypto.createHash('sha256').update(audio).digest('hex'),'943a7a2e410e0dfb8e22b01cb2f1c49e59a9cea76d930425cf40374146067681');
  assert.match(fs.readFileSync(path.resolve('scripts/fixtures/README.md'),'utf8'),/synthetische, nicht personenbezogene/);
});
