import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadEnv } from "../server/state.mjs";
import { redact } from "../server/secrets.mjs";
const env = loadEnv(path.resolve("."));
const host = env.COOLIFY_HETZNER_SERVER_IP || env.COOLIFY_SERVER_IP;
const user = env.COOLIFY_HETZNER_SSH_USER || env.COOLIFY_SSH_USER;
const key = env.COOLIFY_HETZNER_SSH_KEY_PATH || env.COOLIFY_SSH_KEY_PATH;
const knownHosts = path.resolve("output/demo/known_hosts");
const items = [
  ["fressi", env.AGENTONE_FRESSI_ORIGIN, env.AGENTONE_FRESSI_USER],
  ["guenni", env.AGENTONE_GUENNI_ORIGIN, env.AGENTONE_GUENNI_USER],
];
for (const [id, origin, login] of items) {
  const identity = `${login}@agentone.private`;
  const displayName = id === "fressi" ? "Fressi" : "Günni";
  const scopes = [
    "operator.read",
    "operator.write",
    "operator.approvals",
    "operator.questions",
  ];
  const settings = JSON.stringify([
    { path: "gateway.mode", value: "local" },
    { path: "gateway.bind", value: "lan" },
    { path: "gateway.trustedProxies", value: ["__PROXY_IP__"] },
    { path: "gateway.auth.mode", value: "trusted-proxy" },
    { path: "gateway.auth.identityScopes", value: { [identity]: scopes } },
    {
      path: "gateway.auth.trustedProxy",
      value: {
        userHeader: "x-forwarded-user",
        requiredHeaders: ["x-forwarded-proto", "x-forwarded-host"],
        allowUsers: [identity],
        allowLoopback: false,
        deviceAutoApprove: { enabled: true, scopes },
      },
    },
    {
      path: "gateway.controlUi.allowedOrigins",
      value: ["http://127.0.0.1:18789", origin],
    },
    {
      path: "agents.defaults.models",
      value: {
        "openai/gpt-6-luna": { alias: "Luna · Alltag" },
        "openai/gpt-6.1-sol": { alias: "Sol · Stark" },
        "openai/gpt-6-astra": { alias: "Astra · Premium" },
      },
    },
    {
      path: "agents.defaults.model",
      value: {
        primary: "openai/gpt-6-luna",
        fallbacks: ["openai/gpt-6.1-sol"],
      },
    },
    { path: "agents.defaults.utilityModel", value: "openai/gpt-6-luna" },
    { path: "agents.defaults.thinkingDefault", value: "low" },
    {
      path: "agents.entries.main.identity",
      value: {
        name: displayName,
        theme: `Persönlicher AgentOne für ${displayName}`,
        emoji: "✦",
      },
    },
    {
      path: "agents.entries.mail_reader.identity",
      value: {
        name: `${displayName} Mail Reader`,
        theme: "Isolierter read-only Mailklassifizierer",
        emoji: "✉",
      },
    },
    { path: "agents.entries.mail_reader.model", value: "openai/gpt-6-luna" },
    {
      path: "agents.entries.mail_reader.sandbox",
      value: { mode: "all", scope: "session", workspaceAccess: "none" },
    },
    {
      path: "agents.entries.mail_reader.tools",
      value: {
        profile: "minimal",
        allow: ["session_status"],
        deny: [
          "group:fs",
          "group:runtime",
          "group:web",
          "browser",
          "cron",
          "gateway",
          "nodes",
        ],
      },
    },
    { path: "memory.search.provider", value: "none" },
  ]);
  const encoded = Buffer.from(settings).toString("base64");
  const command = `set -eu; c=$(docker ps -a --format '{{.Names}}' | grep '^${id}-gateway-' | head -1); proxy=$(docker ps --format '{{.Names}}' | grep '^${id}-access-' | head -1); test -n "$c"; test -n "$proxy"; net=$(docker inspect -f '{{range $n,$v := .NetworkSettings.Networks}}{{println $n}}{{end}}' "$c" | grep -v '^coolify$' | head -1); ip=$(docker inspect -f '{{range $n,$v := .NetworkSettings.Networks}}{{println $n $v.IPAddress}}{{end}}' "$proxy" | awk -v n="$net" '$1==n {print $2; exit}'); echo "$ip" | grep -Eq '^[0-9]+(\.[0-9]+){3}$'; cfg=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/node/.openclaw"}}{{.Name}}{{end}}{{end}}' "$c"); ws=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/node/.openclaw/workspace"}}{{.Name}}{{end}}{{end}}' "$c"); batch=$(printf '%s' '${encoded}' | base64 -d | sed "s/__PROXY_IP__/$ip/g"); docker stop "$c" >/dev/null; docker run --rm -e HOME=/home/node -e OPENCLAW_STATE_DIR=/home/node/.openclaw -e OPENCLAW_CONFIG_PATH=/home/node/.openclaw/openclaw.json -v "$cfg":/home/node/.openclaw -v "$ws":/home/node/.openclaw/workspace --entrypoint node ghcr.io/openclaw/openclaw:2026.10.8 dist/index.js config set --batch-json "$batch"; docker start "$c" >/dev/null; echo ${id.toUpperCase()}_INITIALIZED`;
  const result = spawnSync(
    "ssh",
    [
      "-i",
      key,
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=15",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      `UserKnownHostsFile=${knownHosts}`,
      `${user}@${host}`,
      command,
    ],
    { encoding: "utf8", timeout: 120_000 },
  );
  const secrets = Object.entries(env)
    .filter(
      ([name, value]) =>
        /(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)/i.test(name) &&
        String(value).length >= 8,
    )
    .map(([, value]) => String(value));
  console.log(
    redact(`${result.stdout || ""}\n${result.stderr || ""}`.trim(), secrets),
  );
  if (result.status !== 0)
    throw new Error(
      `${id}: OpenClaw-Initialisierung fehlgeschlagen (${result.status})`,
    );
}
