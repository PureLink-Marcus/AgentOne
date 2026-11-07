import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env = loadEnv(path.resolve('.'));
const host = env.COOLIFY_HETZNER_SERVER_IP || env.COOLIFY_SERVER_IP;
const user = env.COOLIFY_HETZNER_SSH_USER || env.COOLIFY_SSH_USER;
const key = env.COOLIFY_HETZNER_SSH_KEY_PATH || env.COOLIFY_SSH_KEY_PATH;
const knownHosts = path.resolve('output/demo/known_hosts');
if (!host || !user || !key) throw new Error('SSH-Ziel fehlt');

const command = `set -eu
for prefix in fressi guenni; do
  for role in app access; do
    cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' -v prefix="$prefix-$role" '$2 ~ ("^" prefix "-") {print $1; exit}')
    test -n "$cid"
    image=$(docker inspect "$cid" --format '{{.Config.Image}}')
    release=$(docker exec "$cid" printenv AGENTONE_RELEASE 2>/dev/null || true)
    printf 'container|%s|%s|%s|%s' "$prefix" "$role" "$image" "${'${release:-DEFAULT}'}"
    for name in AGENTONE_VAPID_PUBLIC_KEY AGENTONE_VAPID_PRIVATE_KEY AGENTONE_VAPID_SUBJECT AGENTONE_PUSH_MASTER_KEY; do
      value=$(docker exec "$cid" printenv "$name" 2>/dev/null || true)
      printf '|%s' "${'${#value}'}"
    done
    printf '\n'
  done
done`;

const result = spawnSync('ssh', [
  '-i', key,
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=15',
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', `UserKnownHostsFile=${knownHosts}`,
  `${user}@${host}`,
  command
], { encoding: 'utf8', timeout: 45_000 });
if (result.status !== 0) throw new Error(`Release-111-Live-Audit fehlgeschlagen: ${(result.stderr || result.stdout || '').slice(-1000)}`);

const containers = result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
  const [marker, instance, role, image, release, publicKeyLength, privateKeyLength, subjectLength, masterKeyLength] = line.split('|');
  if (marker !== 'container') throw new Error('Unerwartete Audit-Ausgabe');
  return {
    instance,
    role,
    image,
    release,
    push: {
      publicKeyLength: Number(publicKeyLength),
      privateKeyLength: Number(privateKeyLength),
      subjectLength: Number(subjectLength),
      masterKeyLength: Number(masterKeyLength),
      masterKeyLengthOk: Number(masterKeyLength) >= 32
    }
  };
});
assert.equal(containers.length, 4);
for (const container of containers) {
  assert.equal(container.image, 'purelink/agentone:2026.11.07-111');
  if (container.role === 'app') {
    assert.equal(container.release, '2026.11.07-111');
    assert.ok(container.push.publicKeyLength >= 80);
    assert.ok(container.push.privateKeyLength >= 40);
    assert.ok(container.push.subjectLength >= 8);
    assert.equal(container.push.masterKeyLengthOk, true);
  } else {
    assert.equal(container.push.publicKeyLength, 0);
    assert.equal(container.push.privateKeyLength, 0);
    assert.equal(container.push.subjectLength, 0);
    assert.equal(container.push.masterKeyLength, 0);
  }
}
process.stdout.write(`${JSON.stringify({ release: '2026.11.07-111', containers, pushSecretBoundary: 'APP_ONLY', valuesPrinted: false, secretsExposed: false }, null, 2)}\n`);
