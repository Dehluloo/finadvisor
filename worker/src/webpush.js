// Web Push без залежностей: VAPID (ES256, RFC 8292) + шифрування aes128gcm (RFC 8291). Лише WebCrypto.
const enc = new TextEncoder();
export const b64u = {
  enc(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(str) { const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(str).length + 3) % 4)); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
};
const cat = (...parts) => { const n = parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
async function hmac(key, data) { const k = await crypto.subtle.importKey('raw', key, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, data)); }

// Ключі VAPID: створюються один раз і зберігаються в D1 (meta.vapid).
export async function makeVapid() {
  const kp = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return {pub: b64u.enc(pub), jwk};
}

const jwtCache = new Map();
async function vapidHeader(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin, now = Math.floor(Date.now() / 1000);
  const hit = jwtCache.get(aud); if (hit && hit.exp - now > 3600) return hit.h;
  const exp = now + 12 * 3600;
  const head = b64u.enc(enc.encode(JSON.stringify({typ: 'JWT', alg: 'ES256'})));
  const body = b64u.enc(enc.encode(JSON.stringify({aud, exp, sub: subject})));
  const key = await crypto.subtle.importKey('jwk', vapid.jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, enc.encode(head + '.' + body));
  const h = `vapid t=${head}.${body}.${b64u.enc(sig)}, k=${vapid.pub}`;
  jwtCache.set(aud, {h, exp}); return h;
}

async function encrypt(sub, payload) {
  const uaPub = b64u.dec(sub.p256dh), auth = b64u.dec(sub.auth);
  const ua = await crypto.subtle.importKey('raw', uaPub, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  const as = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: ua}, as.privateKey, 256));
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, cat(enc.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, {name: 'AES-GCM'}, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

// Надсилає одне сповіщення. Повертає HTTP-статус (201 — ок; 404/410 — підписка мертва).
export async function sendPush(sub, data, vapid, subject, ttl = 3600) {
  const body = await encrypt(sub, JSON.stringify(data));
  const r = await fetch(sub.endpoint, {method: 'POST', body, headers: {
    Authorization: await vapidHeader(sub.endpoint, vapid, subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
    TTL: String(ttl), Urgency: data.urgent ? 'high' : 'normal', ...(data.topic ? {Topic: String(data.topic).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)} : {})
  }});
  await r.arrayBuffer().catch(() => {}); // дочитати відповідь, щоб не лишати відкритих потоків
  return r.status;
}
