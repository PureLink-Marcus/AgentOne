export const VOICE_TRANSCRIPTION_MODEL='gpt-transcribe';
export const VOICE_AUDIO_MIN_BYTES=512;
export const VOICE_AUDIO_MAX_BYTES=8_000_000;
export const VOICE_AUDIO_MIN_DURATION_MS=300;

const formatEntries=[
  ['audio/webm',{mimeType:'audio/webm',extension:'webm'}],
  ['audio/mp4',{mimeType:'audio/mp4',extension:'mp4'}],
  ['audio/x-m4a',{mimeType:'audio/x-m4a',extension:'m4a'}],
  ['audio/m4a',{mimeType:'audio/m4a',extension:'m4a'}],
  ['audio/mpeg',{mimeType:'audio/mpeg',extension:'mp3'}],
  ['audio/mp3',{mimeType:'audio/mpeg',extension:'mp3'}],
  ['audio/mpga',{mimeType:'audio/mpga',extension:'mpga'}],
  ['audio/ogg',{mimeType:'audio/ogg',extension:'ogg'}],
  ['audio/wav',{mimeType:'audio/wav',extension:'wav'}],
  ['audio/x-wav',{mimeType:'audio/wav',extension:'wav'}],
  ['audio/wave',{mimeType:'audio/wav',extension:'wav'}],
  ['audio/flac',{mimeType:'audio/flac',extension:'flac'}],
  ['audio/x-flac',{mimeType:'audio/flac',extension:'flac'}],
];

const formats=new Map(formatEntries);
export const VOICE_SUPPORTED_MIME_TYPES=Object.freeze([...new Set(formatEntries.map(([mime])=>mime))]);

export class VoiceTranscriptionError extends Error{
  constructor(code,publicMessage,{status=400,retryable=false,upstreamStatus=null}={}){
    super(code);
    this.name='VoiceTranscriptionError';
    this.code=code;
    this.publicMessage=publicMessage;
    this.status=status;
    this.retryable=retryable;
    this.upstreamStatus=upstreamStatus;
  }
}

export function voiceAudioFormat(contentType){
  const raw=String(contentType||'').split(';',1)[0].trim().toLowerCase();
  const format=formats.get(raw);
  if(!format)throw new VoiceTranscriptionError('VOICE_FORMAT_UNSUPPORTED','Dieses Audioformat wird nicht unterstützt. Bitte den Browser aktualisieren oder WebM, MP4, M4A, MP3, OGG, WAV beziehungsweise FLAC verwenden.',{status:415});
  return {...format,sourceMimeType:raw,filename:`voice.${format.extension}`};
}

export function validateVoiceAudio(audio,{durationMs=null,minBytes=VOICE_AUDIO_MIN_BYTES,maxBytes=VOICE_AUDIO_MAX_BYTES}={}){
  const bytes=audio?.byteLength??audio?.length??0;
  if(!Number.isFinite(bytes)||bytes<minBytes)throw new VoiceTranscriptionError('VOICE_AUDIO_TOO_SHORT','Die Aufnahme war leer oder zu kurz. Bitte mindestens eine Sekunde deutlich sprechen.',{status:400});
  if(bytes>maxBytes)throw new VoiceTranscriptionError('VOICE_AUDIO_TOO_LARGE','Die Aufnahme ist zu groß. Bitte eine kürzere Nachricht aufnehmen.',{status:413});
  const duration=Number(durationMs);
  if(Number.isFinite(duration)&&duration>0&&duration<VOICE_AUDIO_MIN_DURATION_MS)throw new VoiceTranscriptionError('VOICE_AUDIO_TOO_SHORT','Die Aufnahme war zu kurz. Bitte mindestens eine Sekunde deutlich sprechen.',{status:400});
  return {bytes,durationMs:Number.isFinite(duration)&&duration>0?Math.round(duration):null};
}

export function createVoiceTranscriptionForm({audio,format,languageCode}){
  const code=String(languageCode||'').trim().toLowerCase();
  if(!/^[a-z]{2,3}(?:-[a-z]{2})?$/.test(code))throw new VoiceTranscriptionError('VOICE_LANGUAGE_UNSUPPORTED','Die gewählte Sprache wird für die Transkription nicht unterstützt.',{status:400});
  const form=new FormData();
  form.append('model',VOICE_TRANSCRIPTION_MODEL);
  // gpt-transcribe accepts the plural languages array. Sending singular language
  // causes the API to reject the complete multipart request.
  form.append('languages[]',code);
  form.append('file',new Blob([audio],{type:format.mimeType}),format.filename);
  return form;
}

export function createVoiceUpstreamError(status){
  const upstreamStatus=Number(status)||502;
  if(upstreamStatus===429)return new VoiceTranscriptionError('VOICE_PROVIDER_BUSY','Die Spracherkennung ist gerade ausgelastet. Bitte in einem Moment erneut versuchen.',{status:503,retryable:true,upstreamStatus});
  if(upstreamStatus===408||upstreamStatus===504)return new VoiceTranscriptionError('VOICE_PROVIDER_TIMEOUT','Die Spracherkennung hat zu lange gebraucht. Bitte erneut versuchen.',{status:504,retryable:true,upstreamStatus});
  if(upstreamStatus>=400&&upstreamStatus<500)return new VoiceTranscriptionError('VOICE_AUDIO_REJECTED','Die Aufnahme konnte nicht verarbeitet werden. Bitte erneut ein bis sechzig Sekunden deutlich sprechen.',{status:422,retryable:false,upstreamStatus});
  return new VoiceTranscriptionError('VOICE_PROVIDER_UNAVAILABLE','Die Spracherkennung ist vorübergehend nicht erreichbar. Bitte erneut versuchen.',{status:502,retryable:true,upstreamStatus});
}

export function publicVoiceTranscriptionError(error){
  if(error instanceof VoiceTranscriptionError)return {status:error.status,body:{error:error.code,message:error.publicMessage,retryable:error.retryable}};
  if(error?.name==='AbortError'||error?.name==='TimeoutError')return {status:504,body:{error:'VOICE_PROVIDER_TIMEOUT',message:'Die Spracherkennung hat zu lange gebraucht. Bitte erneut versuchen.',retryable:true}};
  if(Number(error?.status)===413)return {status:413,body:{error:'VOICE_AUDIO_TOO_LARGE',message:'Die Aufnahme ist zu groß. Bitte eine kürzere Nachricht aufnehmen.',retryable:false}};
  return {status:502,body:{error:'VOICE_TRANSCRIPTION_FAILED',message:'Die Spracherkennung konnte nicht abgeschlossen werden. Bitte erneut versuchen.',retryable:true}};
}

export function voiceTranscriptionStatus({configured}){
  return {
    schema:'agentone.voice-transcription-status/v1',
    status:configured?'LIVE':'SETUP',
    configured:Boolean(configured),
    provider:'openai',
    model:VOICE_TRANSCRIPTION_MODEL,
    languageField:'languages[]',
    limits:{minBytes:VOICE_AUDIO_MIN_BYTES,maxBytes:VOICE_AUDIO_MAX_BYTES,minDurationMs:VOICE_AUDIO_MIN_DURATION_MS},
    supportedMimeTypes:VOICE_SUPPORTED_MIME_TYPES,
    secretsExposed:false,
  };
}
