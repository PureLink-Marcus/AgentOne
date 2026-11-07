import test from 'node:test';
import assert from 'node:assert/strict';
import { commandCenterCss,commandCenterJs } from './agentone-command-center.mjs';
import {
  VOICE_AUDIO_MAX_BYTES,
  VOICE_AUDIO_MIN_DURATION_MS,
  VOICE_TRANSCRIPTION_MODEL,
  VoiceTranscriptionError,
  createVoiceTranscriptionForm,
  createVoiceUpstreamError,
  publicVoiceTranscriptionError,
  validateVoiceAudio,
  voiceAudioFormat,
  voiceTranscriptionStatus,
} from './voice-transcription.mjs';

test('voice formats preserve matching MIME metadata and filename extensions',()=>{
  assert.deepEqual(voiceAudioFormat('audio/webm;codecs=opus'),{mimeType:'audio/webm',extension:'webm',sourceMimeType:'audio/webm',filename:'voice.webm'});
  assert.equal(voiceAudioFormat('audio/mp4').filename,'voice.mp4');
  assert.equal(voiceAudioFormat('audio/x-m4a').filename,'voice.m4a');
  assert.equal(voiceAudioFormat('audio/ogg; codecs=opus').filename,'voice.ogg');
  assert.equal(voiceAudioFormat('audio/x-wav').mimeType,'audio/wav');
  assert.throws(()=>voiceAudioFormat('application/octet-stream'),error=>error instanceof VoiceTranscriptionError&&error.code==='VOICE_FORMAT_UNSUPPORTED'&&error.status===415);
});

test('gpt-transcribe multipart uses plural languages and extension-bearing file',()=>{
  const format=voiceAudioFormat('audio/mp4;codecs=mp4a.40.2');
  const form=createVoiceTranscriptionForm({audio:Buffer.alloc(1024,1),format,languageCode:'de'});
  assert.equal(form.get('model'),VOICE_TRANSCRIPTION_MODEL);
  assert.deepEqual(form.getAll('languages[]'),['de']);
  assert.equal(form.get('language'),null);
  const file=form.get('file');
  assert.equal(file.name,'voice.mp4');
  assert.equal(file.type,'audio/mp4');
  assert.equal(file.size,1024);
});

test('empty, too-short, too-large and sub-second recordings are rejected locally',()=>{
  assert.throws(()=>validateVoiceAudio(Buffer.alloc(0)),error=>error.code==='VOICE_AUDIO_TOO_SHORT');
  assert.throws(()=>validateVoiceAudio(Buffer.alloc(511)),error=>error.code==='VOICE_AUDIO_TOO_SHORT');
  assert.equal(VOICE_AUDIO_MIN_DURATION_MS,1000);
  assert.throws(()=>validateVoiceAudio(Buffer.alloc(1024),{durationMs:999}),error=>error.code==='VOICE_AUDIO_TOO_SHORT');
  assert.throws(()=>validateVoiceAudio({byteLength:VOICE_AUDIO_MAX_BYTES+1}),error=>error.code==='VOICE_AUDIO_TOO_LARGE'&&error.status===413);
  assert.deepEqual(validateVoiceAudio(Buffer.alloc(1024),{durationMs:1000}),{bytes:1024,durationMs:1000});
});

test('provider failures are mapped to stable public messages without raw provider content',()=>{
  const providerError=createVoiceUpstreamError(400);
  const publicError=publicVoiceTranscriptionError(providerError);
  assert.equal(publicError.status,422);
  assert.equal(publicError.body.error,'VOICE_AUDIO_REJECTED');
  assert.doesNotMatch(JSON.stringify(publicError),/HTTP 400|provider|secret/i);
  assert.equal(publicVoiceTranscriptionError(createVoiceUpstreamError(429)).body.retryable,true);
  for(const status of [401,403]){
    const authFailure=publicVoiceTranscriptionError(createVoiceUpstreamError(status));
    assert.equal(authFailure.status,503);
    assert.equal(authFailure.body.error,'VOICE_PROVIDER_AUTH_FAILED');
    assert.equal(authFailure.body.retryable,false);
  }
  const missingProvider=publicVoiceTranscriptionError(createVoiceUpstreamError(404));
  assert.equal(missingProvider.status,503);
  assert.equal(missingProvider.body.error,'VOICE_PROVIDER_CONFIGURATION_ERROR');
  assert.equal(missingProvider.body.retryable,false);
  assert.equal(publicVoiceTranscriptionError(createVoiceUpstreamError(413)).body.error,'VOICE_AUDIO_TOO_LARGE');
  assert.equal(publicVoiceTranscriptionError(Object.assign(new Error('upstream secret'),{status:413})).body.error,'VOICE_AUDIO_TOO_LARGE');
});

test('voice status is operational metadata only',()=>{
  const status=voiceTranscriptionStatus({configured:true});
  assert.equal(status.status,'LIVE');
  assert.equal(status.model,'gpt-transcribe');
  assert.equal(status.languageField,'languages[]');
  assert.equal(status.secretsExposed,false);
  assert.ok(status.supportedMimeTypes.includes('audio/webm'));
  assert.equal(JSON.stringify(status).includes('apiKey'),false);
});

test('command center exposes recorder negotiation and visible voice diagnostics',()=>{
  assert.doesNotThrow(()=>new Function(commandCenterJs));
  assert.match(commandCenterJs,/id="voice-diagnostics"/);
  assert.match(commandCenterJs,/voiceMimeCandidates/);
  assert.match(commandCenterJs,/MediaRecorder\.isTypeSupported/);
  assert.match(commandCenterJs,/x-agentone-audio-duration-ms/);
  assert.match(commandCenterJs,/durationMs<1000/);
  assert.match(commandCenterJs,/id="voice-auto-send"/);
  assert.match(commandCenterJs,/agentone\.voice\.preferences\.v2/);
  assert.match(commandCenterJs,/fetch\('\/agentone\/voice\/chat\/stream'/);
  assert.match(commandCenterJs,/response\.body\.getReader/);
  assert.match(commandCenterJs,/Voice-Stream wurde nicht vollständig abgeschlossen/);
  assert.match(commandCenterJs,/autoSend:true/);
  assert.match(commandCenterJs,/voiceCaptureBusy&&!fromTranscription/);
  assert.match(commandCenterJs,/if\(voiceSending\)\{voiceStatus/);
  assert.match(commandCenterJs,/await sendVoiceText\(true\)/);
  assert.doesNotMatch(commandCenterJs,/antwortet live/);
  assert.match(commandCenterJs,/data\.message/);
  assert.match(commandCenterCss,/\.voice-diagnostics/);
});
