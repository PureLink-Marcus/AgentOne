const definitions = [
  { id:'google-calendar', name:'Google Kalender', category:'Personal · Kalender', profile:'personal', recommended:true, preinstalled:true, requirements:['GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CALENDAR_REDIRECT_URI'], capabilities:['Kalender lesen','Free/Busy','Terminentwurf'], kind:'oauth', note:'OAuth wird erst beim Verbinden gestartet. Standard ist calendar.readonly; Schreiben benötigt eine eigene Freigabe.' },
  { id:'home-assistant', name:'Home Assistant', category:'Personal · Zuhause', profile:'personal', recommended:true, preinstalled:true, requirements:['HOME_ASSISTANT_URL','HOME_ASSISTANT_TOKEN'], capabilities:['Zustände lesen','Energie','Szenen vorschlagen','Ereignisse'], kind:'home-assistant', endpoint:'HOME_ASSISTANT_URL', token:'HOME_ASSISTANT_TOKEN', note:'Für das vorhandene Heimnetz vorbereitet. Zustände sind read-only; Schlösser, Alarm und andere kritische Aktionen bleiben gesperrt.' },
  { id:'home-connector', name:'AgentOne Home Connector', category:'Personal · Zuhause', profile:'personal', recommended:true, preinstalled:true, requirements:['HOME_CONNECTOR_URL','HOME_CONNECTOR_TOKEN'], capabilities:['Heimnetz sicher erreichen','Home Assistant lesen','Lokale Quellen'], kind:'http-auth', endpoint:'HOME_CONNECTOR_URL', token:'HOME_CONNECTOR_TOKEN', note:'Empfohlener Raspberry-Pi-Weg über privaten Tailscale-Tunnel und feste Capability-Allowlist.' },
  { id:'spotify', name:'Spotify', category:'Personal · Medien', profile:'personal', recommended:true, preinstalled:true, requirements:['SPOTIFY_CLIENT_ID','SPOTIFY_CLIENT_SECRET','SPOTIFY_REDIRECT_URI'], capabilities:['Aktuelle Wiedergabe','Playlists lesen','Suche','Wiedergabeentwurf'], kind:'oauth', note:'Offizieller OAuth-Code-Flow. Lesescopes zuerst; Wiedergabesteuerung und Playlist-Änderungen werden separat freigegeben.' },
  { id:'apple-companion', name:'Apple / iPhone Companion', category:'Personal · Geräte', profile:'personal', recommended:true, preinstalled:true, requirements:['APPLE_COMPANION_URL','APPLE_COMPANION_TOKEN'], capabilities:['Kalender','Erinnerungen','Kurzbefehle','Share Sheet'], kind:'configuration', note:'Lokaler iPhone-Companion für EventKit und Kurzbefehle. Keine iCloud-Passwörter im AgentOne-Server.' },
  { id:'apple-health', name:'Apple Health', category:'Personal · Gesundheit', profile:'personal', recommended:true, preinstalled:true, requirements:['APPLE_COMPANION_URL','APPLE_COMPANION_TOKEN'], capabilities:['Schritte lesen','Aktivität zusammenfassen','Schlaftrends','Workouts lesen'], kind:'configuration', note:'HealthKit ist nur über eine iPhone-Companion-App mit feingranularer Apple-Freigabe erreichbar. Standardmäßig werden nur ausgewählte Zusammenfassungen übertragen; keine Diagnosen oder klinischen Empfehlungen.' },
  { id:'iphone-location', name:'iPhone Standort', category:'Personal · Unterwegs', profile:'personal', recommended:true, preinstalled:true, requirements:['APPLE_COMPANION_URL','APPLE_COMPANION_TOKEN'], capabilities:['Einmaliger Standort','Ankunft/Abfahrt','Grobe Position','Ortsbezogene Erinnerung'], kind:'configuration', note:'Core Location benötigt eine ausdrückliche iPhone-Freigabe. Standard ist einmalig oder ereignisbasiert mit reduzierter Genauigkeit; kontinuierliches präzises Tracking bleibt deaktiviert.' },
  { id:'apple-shortcuts', name:'Apple Kurzbefehle', category:'Personal · Geräte', profile:'personal', recommended:true, preinstalled:true, requirements:['APPLE_COMPANION_URL','APPLE_COMPANION_TOKEN'], capabilities:['Ereignis senden','Notiz übergeben','Erinnerung übergeben','Share Sheet'], kind:'configuration', note:'Kurzbefehle übertragen nur die ausdrücklich ausgewählten Inhalte an den persönlichen Connector. Sicherheitskritische Aktionen benötigen weiterhin eine Bestätigung.' },
  { id:'caldav-carddav', name:'CalDAV / CardDAV', category:'Personal · Kalender', profile:'personal', recommended:true, preinstalled:true, requirements:['DAV_BASE_URL','DAV_USERNAME','DAV_APP_PASSWORD'], capabilities:['Kalender lesen','Kontakte lesen','Aufgaben lesen'], kind:'basic-auth', endpoint:'DAV_BASE_URL', username:'DAV_USERNAME', token:'DAV_APP_PASSWORD', note:'Anbieterneutraler Kalender-, Kontakt- und Aufgabenweg. Schreiben bleibt bis zur Einzelaktivierung blockiert.' },
  { id:'personal-mail', name:'Private Mail', category:'Personal · Kommunikation', profile:'personal', recommended:true, preinstalled:true, requirements:['PERSONAL_IMAP_HOST','PERSONAL_IMAP_USER','PERSONAL_IMAP_PASSWORD'], capabilities:['Posteingang lesen','Zusammenfassen','Antwortentwurf'], kind:'configuration', note:'IMAP read-only. SMTP-Versand ist nicht Teil der Standardfreigabe.' },
  { id:'gmail', name:'Gmail', category:'Personal · Kommunikation', profile:'personal', recommended:true, preinstalled:true, requirements:['GMAIL_ADDRESS','GOOGLE_APP_PASSWORD'], capabilities:['Posteingang lesen','Threads lesen','Zusammenfassen','Antwortentwurf'], kind:'imap-app-password', note:'Einfache Benutzerverbindung über vollständige Gmail-Adresse und Google-App-Passwort. Keine OAuth-Client-ID erforderlich; IMAP bleibt read-only, SMTP wird nur verifiziert und sendet keine Testmail.' },
  { id:'twitch', name:'Twitch', category:'Personal · Medien', profile:'personal', recommended:true, preinstalled:true, requirements:['TWITCH_CLIENT_ID','TWITCH_CLIENT_SECRET','TWITCH_REDIRECT_URI'], capabilities:['Streams lesen','Follows lesen','Benachrichtigungen','Chat read-only'], kind:'oauth', note:'Offizieller Twitch-OAuth-Flow mit minimalen Lesescopes. Bot-, Moderations- und Sendeaktionen bleiben deaktiviert.' },
  { id:'ntfy', name:'ntfy Push', category:'Personal · Kommunikation', profile:'personal', recommended:true, preinstalled:true, requirements:['NTFY_URL','NTFY_TOPIC','NTFY_TOKEN'], capabilities:['Push senden','Ereignisse empfangen'], kind:'http-auth', endpoint:'NTFY_URL', token:'NTFY_TOKEN', note:'Geschütztes persönliches Topic; Push-Inhalte werden auf das notwendige Minimum begrenzt.' },
  { id:'paperless', name:'Paperless-ngx', category:'Personal · Dokumente', profile:'personal', recommended:true, preinstalled:true, requirements:['PAPERLESS_URL','PAPERLESS_TOKEN'], capabilities:['Dokumente suchen','OCR lesen','Tags lesen','Fristen'], kind:'http-auth', endpoint:'PAPERLESS_URL', token:'PAPERLESS_TOKEN', note:'Dokumente und OCR read-only. Löschen, Korrespondenz und Tag-Änderungen benötigen Freigaben.' },
  { id:'immich', name:'Immich', category:'Personal · Fotos', profile:'personal', recommended:true, preinstalled:true, requirements:['IMMICH_URL','IMMICH_API_KEY'], capabilities:['Fotos suchen','Alben lesen','Metadaten lesen'], kind:'http-auth', endpoint:'IMMICH_URL', token:'IMMICH_API_KEY', note:'Private Foto- und Albumsuche; Gesichtserkennung und Standortauswertung sind opt-in.' },
  { id:'mealie', name:'Mealie', category:'Personal · Haushalt', profile:'personal', recommended:true, preinstalled:true, requirements:['MEALIE_URL','MEALIE_TOKEN'], capabilities:['Rezepte lesen','Wochenplan','Einkaufsliste'], kind:'http-auth', endpoint:'MEALIE_URL', token:'MEALIE_TOKEN', note:'Empfohlene stabile Basis für Rezepte und Einkaufslisten.' },
  { id:'actual-budget', name:'Actual Budget', category:'Personal · Finanzen', profile:'personal', recommended:true, preinstalled:true, requirements:['ACTUAL_BUDGET_URL','ACTUAL_BUDGET_PASSWORD','ACTUAL_BUDGET_SYNC_ID'], capabilities:['Budget lesen','Kategorien','Transaktionen lesen'], kind:'configuration', note:'Offizieller Node-Adapter mit lokaler Budgetkopie; keine Überweisungen oder Bank-Schreibzugriffe.' },
  { id:'bring-shopping', name:'Bring! Einkaufsliste', category:'Personal · Haushalt', profile:'personal', recommended:false, preinstalled:true, defaultMode:'disabled', requirements:['BRING_BRIDGE_URL','BRING_BRIDGE_TOKEN'], capabilities:['Bridge-Slot','Importentwurf'], kind:'configuration', note:'Keine dokumentierte öffentliche Bring!-Consumer-API. Der Bridge-Slot bleibt standardmäßig deaktiviert; keine Zugangsdaten werden abgegriffen.' },
  { id:'graph', name:'Microsoft Graph / Entra', category:'Identity & Collaboration', requirements:['GRAPH_TENANT_ID','GRAPH_CLIENT_ID','GRAPH_CLIENT_SECRET','GRAPH_REDIRECT_URI'], capabilities:['Login','Mail lesen','Kalender lesen','Teams'], kind:'oauth', note:'Echter OAuth-Login wird erst nach expliziter Benutzeranmeldung aktiv.' },
  { id:'coolify', name:'Coolify / Hetzner', category:'Infrastructure', requirements:['COOLIFY_HETZNER_URL','COOLIFY_HETZNER_API_TOKEN'], capabilities:['Health','Ressourcen lesen','Logs lesen'], kind:'coolify', endpoint:'COOLIFY_HETZNER_URL', token:'COOLIFY_HETZNER_API_TOKEN', note:'Provisionierung und Deployments bleiben in der Demo simuliert.' },
  { id:'erp-graphql', name:'ERP GraphQL', category:'Business Data', requirements:['ERP_GQL_LIVE_ENDPOINT','ERP_GQL_LIVE_CLIENT_ID','ERP_GQL_LIVE_CLIENT_SECRET'], capabilities:['Schema lesen','Queries lesen'], kind:'http', endpoint:'ERP_GQL_LIVE_ENDPOINT', note:'Nur Read-only-Abfragen mit festen Vorlagen.' },
  { id:'erp-postgres', name:'ERP PostgreSQL', category:'Business Data', requirements:['ERP_PG_HOST','ERP_PG_PORT','ERP_PG_DB','ERP_PG_USER','ERP_PG_PASSWORD'], capabilities:['Read-only SQL','Views'], kind:'database', note:'Kein DB-Treiber im Browser; produktive Schreiboperationen sind blockiert.' },
  { id:'shopware-staging', name:'Shopware Staging', category:'Commerce', requirements:['SHOPWARE_STAGING_URL','SHOPWARE_STAGING_CLIENT_ID','SHOPWARE_STAGING_CLIENT_SECRET'], capabilities:['Produkte lesen','Kategorien lesen','Staging'], kind:'http', endpoint:'SHOPWARE_STAGING_URL', note:'Staging-Lesezugriff; Änderungen werden als Change Set simuliert.' },
  { id:'shopware-test', name:'Shopware Test', category:'Commerce', requirements:['SHOPWARE_TEST_URL','SHOPWARE_TEST_ADMIN_USER','SHOPWARE_TEST_ADMIN_PASSWORD'], capabilities:['Produkte lesen','Testdaten','Vorschau'], kind:'http', endpoint:'SHOPWARE_TEST_URL', note:'Testsystem erkannt; Mutationen benötigen zusätzliche Demo-Freigabe.' },
  { id:'shopware-production', name:'Shopware Production', category:'Commerce', requirements:['SHOPWARE_PRODUCTION_URL'], capabilities:['Status lesen','Katalog lesen'], kind:'http', endpoint:'SHOPWARE_PRODUCTION_URL', note:'Production ist im Demomodus technisch auf Read-only begrenzt.' },
  { id:'openai', name:'OpenAI', category:'Models', requirements:['CrewAI_OpenAI_API_Key'], capabilities:['Modelle','Text','Strukturierte Ausgabe'], kind:'openai', token:'CrewAI_OpenAI_API_Key', note:'Healthcheck listet Modelle; keine Completion wird automatisch ausgelöst.' },
  { id:'ollama', name:'Ollama Studio', category:'Models', requirements:['STUDIO_OLLAMA_BASE_URL'], capabilities:['Lokale Modelle','Embeddings'], kind:'ollama', endpoint:'STUDIO_OLLAMA_BASE_URL', note:'Lokaler Provider; fällt bei Nichterreichbarkeit auf Simulation zurück.' },
  { id:'mail', name:'SMTP / Mail', category:'Channels', requirements:['TECHHUB_SMTP_HOST','TECHHUB_SMTP_PORT','MAIL_ABSENDER'], capabilities:['Entwürfe','Benachrichtigungen'], kind:'configuration', note:'Versand ist im Demomodus blockiert; Nachrichten erscheinen als Vorschau.' },
  { id:'techhub', name:'TechHub', category:'Platforms', requirements:['TECHHUB_FRONTEND_URL','TECHHUB_ADMIN_URL'], capabilities:['Health','Daten lesen','Sync-Status'], kind:'http', endpoint:'TECHHUB_FRONTEND_URL', note:'Normale Anbindung ohne Sonderrechte im AgentOne-Kern.' },
  { id:'coolify-mcp', name:'Coolify MCP', category:'MCP', requirements:['COOLIFY_MCP_URL','COOLIFY_MCP_TOKEN'], capabilities:['Tools entdecken','Status lesen'], kind:'http', endpoint:'COOLIFY_MCP_URL', note:'MCP-Werkzeuge sind in der Demo auf lesende Fähigkeiten begrenzt.' },
];

function isPresent(value) {
  return typeof value === 'string' && value.trim() !== '' && !/^(changeme|replace|todo|xxx)$/i.test(value.trim());
}

export function adapterCatalog(env, persisted = new Map()) {
  return definitions.map(def => {
    const saved = persisted.get(def.id) || {};
    const configured = def.requirements.every(key => isPresent(env[key]));
    const mode = saved.mode || def.defaultMode || 'auto';
    const status = mode === 'disabled' ? 'DISABLED' : saved.status || 'SIMULATED';
    return {
      id:def.id, name:def.name, category:def.category, mode, status, configured,
      requirements:def.requirements, capabilities:def.capabilities, writesBlocked:true,
      profile:def.profile || 'business', recommended:Boolean(def.recommended), preinstalled:Boolean(def.preinstalled),
      latency:saved.latency ?? null, checkedAt:saved.checkedAt || null,
      note:def.note,
    };
  });
}

function safeBaseUrl(raw) {
  const url = new URL(raw);
  if (!['http:','https:'].includes(url.protocol)) throw new Error('Nur HTTP(S)-Ziele sind erlaubt');
  url.username = '';
  url.password = '';
  return url;
}

async function probe(url, options = {}) {
  const started = performance.now();
  const response = await fetch(url, { redirect:'manual', signal:AbortSignal.timeout(3500), ...options });
  return { reachable:response.status >= 200 && response.status < 500, code:response.status, latency:Math.round(performance.now()-started) };
}

export async function checkAdapter(id, mode, env) {
  const def = definitions.find(item => item.id === id);
  if (!def) throw new Error('Unbekannte Integration');
  if (mode === 'disabled') return { status:'DISABLED', latency:null, sample:{ mode:'disabled' }, note:def.note };
  const configured = def.requirements.every(key => isPresent(env[key]));
  if (mode === 'simulated' || !configured) {
    return { status:'SIMULATED', latency:18 + Math.floor(Math.random()*35), sample:sampleFor(def, false), note:configured ? def.note : 'Konfiguration unvollständig – Simulator aktiv.' };
  }
  try {
    let result;
    if (def.kind === 'coolify') {
      const base = safeBaseUrl(env[def.endpoint]);
      result = await probe(new URL('/api/health', base), { headers:{ authorization:`Bearer ${env[def.token]}` } });
    } else if (def.kind === 'openai') {
      result = await probe('https://api.openai.com/v1/models', { headers:{ authorization:`Bearer ${env[def.token]}` } });
    } else if (def.kind === 'ollama') {
      const base = safeBaseUrl(env[def.endpoint]);
      result = await probe(new URL('/api/tags', base));
    } else if (def.kind === 'home-assistant') {
      const base = safeBaseUrl(env[def.endpoint]);
      result = await probe(new URL('/api/', base), { headers:{ authorization:`Bearer ${env[def.token]}` } });
    } else if (def.kind === 'http-auth') {
      result = await probe(safeBaseUrl(env[def.endpoint]), { headers:{ authorization:`Bearer ${env[def.token]}` } });
    } else if (def.kind === 'basic-auth') {
      result = await probe(safeBaseUrl(env[def.endpoint]), { headers:{ authorization:`Basic ${Buffer.from(`${env[def.username]}:${env[def.token]}`).toString('base64')}` } });
    } else if (def.kind === 'http') {
      result = await probe(safeBaseUrl(env[def.endpoint]), { method:'HEAD' });
    } else {
      return { status:'SIMULATED', latency:24, sample:sampleFor(def, false), note:'Konfiguration erkannt; für diesen Adapter ist ein interaktiver Login oder Treiber erforderlich.' };
    }
    if (!result.reachable) throw new Error(`Dienst antwortet mit HTTP ${result.code}`);
    return { status:'LIVE', latency:result.latency, sample:sampleFor(def, true), note:`Read-only-Healthcheck erfolgreich (HTTP ${result.code}).` };
  } catch (error) {
    return { status:'DEGRADED', latency:null, sample:sampleFor(def, false), note:`Live-Prüfung fehlgeschlagen; Simulator bleibt verfügbar. ${String(error.message || error).slice(0,120)}` };
  }
}

function sampleFor(def, live) {
  return {
    adapter:def.id,
    source:live ? 'live-read-only' : 'simulator',
    schema:'agentone.integration.sample/v1',
    records: def.id.includes('shopware') ? 1248 : def.id.includes('erp') ? 36 : 4,
    writePolicy:'blocked',
  };
}

export const allowedModes = new Set(['auto','live','simulated','disabled']);
