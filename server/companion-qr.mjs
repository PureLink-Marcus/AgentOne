import QRCode from 'qrcode';

export function companionBaseUrl(publicOrigin) {
  let origin;
  try {
    const parsed = new URL(String(publicOrigin || ''));
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.username || parsed.password || (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback))) {
      throw new Error('unsafe_origin');
    }
    origin = parsed.origin;
  } catch {
    throw Object.assign(new Error('Öffentliche Companion-Adresse ist nicht sicher konfiguriert.'), {
      code: 'COMPANION_QR_ORIGIN_INVALID',
      status: 503,
    });
  }
  return new URL('/iphone', `${origin}/`).toString();
}

export async function companionQrSvg(publicOrigin) {
  const payload = companionBaseUrl(publicOrigin);
  const svg = await QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
    color: { dark: '#07111f', light: '#ffffff' },
  });
  return { payload, svg };
}
