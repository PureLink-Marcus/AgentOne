import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('mobile refresh indicator cannot block IPA and SideStore controls',async()=>{
  const [shell,personal]=await Promise.all([
    readFile(new URL('./agentone-command-center.mjs',import.meta.url),'utf8'),
    readFile(new URL('./personal-ui.mjs',import.meta.url),'utf8')
  ]);
  assert.match(shell,/\.pull-refresh\{[^}]*pointer-events:none/);
  assert.match(personal,/sidestore:\/\/install\?url=/);
  assert.match(personal,/IPA in Dateien speichern/);
});
