/** Ringkas User-Agent jadi "Chrome 131 · Android" + jenis perangkat (tanpa pustaka). */
export interface UaInfo { browser: string; os: string; kind: 'mobile' | 'tablet' | 'desktop' | 'app' | 'bot' | 'unknown' }

const BROWSERS: [RegExp, string][] = [
  [/EdgA?\/([\d]+)/, 'Edge'],
  [/OPR\/([\d]+)/, 'Opera'],
  [/SamsungBrowser\/([\d]+)/, 'Samsung Internet'],
  [/Firefox\/([\d]+)/, 'Firefox'],
  [/CriOS\/([\d]+)/, 'Chrome'],
  [/Chrome\/([\d]+)/, 'Chrome'],
  [/Version\/([\d]+).*Safari/, 'Safari'],
];

export function parseUa(ua: string | undefined | null): UaInfo | null {
  if (!ua) return null;
  if (/bot|crawler|spider|curl|wget|python-requests|httpx|okhttp|Go-http/i.test(ua)) {
    const m = ua.match(/^([\w.-]+)/);
    return { browser: m ? m[1] : 'Bot', os: '', kind: /curl|wget|python|httpx|okhttp|Go-http/i.test(ua) ? 'app' : 'bot' };
  }
  let browser = '';
  for (const [re, name] of BROWSERS) {
    const m = ua.match(re);
    if (m) { browser = `${name} ${m[1]}`; break; }
  }
  let os = '';
  const android = ua.match(/Android ([\d]+)/);
  const ios = ua.match(/(?:iPhone|CPU) OS ([\d]+)/);
  if (android) os = `Android ${android[1]}`;
  else if (/iPad/.test(ua)) os = ios ? `iPadOS ${ios[1]}` : 'iPadOS';
  else if (ios) os = `iOS ${ios[1]}`;
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const kind: UaInfo['kind'] = /iPad|Tablet/.test(ua) ? 'tablet' : /Mobi|iPhone|Android/.test(ua) ? 'mobile' : (browser || os) ? 'desktop' : 'unknown';
  if (/; wv\)/.test(ua) && browser.startsWith('Chrome')) browser = browser.replace('Chrome', 'WebView');
  return { browser: browser || 'Browser', os, kind };
}

/** Kode negara ISO → emoji bendera (🇮🇩). */
export function flag(cc: string | undefined | null): string {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}
