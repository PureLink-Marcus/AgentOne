export function normalizeMailPassword(provider,value){
  const password=String(value||'');
  return provider==='gmail'?password.replace(/\s+/g,''):password;
}

export function mailErrorCode(error){
  const source=[error?.message,error?.responseText,error?.code,error?.serverResponseCode].filter(Boolean).join(' ');
  if(/auth|credential|login|invalid|denied|command failed|web login required/i.test(source))return 'AUTH_REJECTED';
  if(/ETIMEDOUT|timeout|timed out/i.test(source))return 'TIMEOUT';
  if(/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|certificate|TLS/i.test(source))return 'NETWORK_OR_TLS';
  return 'CONNECTION_FAILED';
}

export function mailConnectionOptions(account,password){
  const shared={auth:{user:account.username,pass:password},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},socketTimeout:15_000,greetingTimeout:15_000};
  return {
    imap:{host:account.imap.host,port:account.imap.port,secure:account.imap.secure,...shared,logger:false},
    smtp:{host:account.smtp.host,port:account.smtp.port,secure:account.smtp.secure,...shared,requireTLS:true,connectionTimeout:15_000}
  };
}

export function publicMailError(error,provider='custom'){
  const source=[error?.message,error?.responseText,error?.code,error?.serverResponseCode].filter(Boolean).join(' ');
  if(provider==='gmail'&&/(command failed|auth|credential|login|invalid|denied|web login required)/i.test(source))return 'Gmail-Anmeldung abgelehnt. Verwende die vollständige Gmail-Adresse und ein 16-stelliges Google-App-Passwort – nicht dein normales Google-Passwort.';
  if(/ETIMEDOUT|timeout|timed out/i.test(source))return 'Der Mailserver antwortet nicht rechtzeitig. Netzwerk und Serveradresse prüfen.';
  if(/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|certificate|TLS/i.test(source))return 'Der Mailserver ist über die sichere Verbindung nicht erreichbar.';
  if(/auth|credential|login|invalid|denied|command failed/i.test(source))return 'Anmeldung am Mailserver abgelehnt. Benutzername und App-/Postfachpasswort prüfen.';
  return 'Mail-Verbindung fehlgeschlagen. Zugangsdaten und Anbieter prüfen.';
}

export function publicMailFailure(error,provider='custom',stage='imap'){
  return {stage,code:mailErrorCode(error),error:publicMailError(error,provider)};
}
