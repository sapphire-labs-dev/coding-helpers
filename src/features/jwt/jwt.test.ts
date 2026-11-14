import { describe, expect, it } from 'vitest';
import { decodeJwt, timeClaims, verifyJwt, type DecodedJwt } from './jwt';

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const enc = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function sign(header: Record<string, unknown>, payload: Record<string, unknown>, alg: AlgorithmIdentifier | EcdsaParams | RsaPssParams, key: CryptoKey) {
  const input = `${enc(header)}.${enc(payload)}`;
  const sig = new Uint8Array(await crypto.subtle.sign(alg, key, new TextEncoder().encode(input)));
  return `${input}.${b64url(sig)}`;
}

const decoded = (token: string): DecodedJwt => {
  const r = decodeJwt(token);
  if (!r.ok) throw new Error(r.code);
  return r.jwt;
};

// The well-known example token from jwt.io (HS256, secret "your-256-bit-secret").
const JWT_IO = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('decoding', () => {
  it('reads header and payload, also with a "Bearer " prefix', () => {
    const jwt = decoded(`Bearer ${JWT_IO}`);
    expect(jwt.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(jwt.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 });
  });

  it('decodes UTF-8 claims', () => {
    expect(decoded(`${enc({ alg: 'none' })}.${enc({ name: 'José ✓' })}.`).payload.name).toBe('José ✓');
  });

  it('says which part is broken', () => {
    expect(decodeJwt('abc.def')).toMatchObject({ ok: false, code: 'parts' });
    expect(decodeJwt('a$b.c.d')).toMatchObject({ ok: false, code: 'base64', part: 'header' });
    expect(decodeJwt(`${enc({ a: 1 })}.${b64url(new TextEncoder().encode('not json'))}.x`)).toMatchObject({ ok: false, code: 'json', part: 'payload' });
    expect(decodeJwt(`${enc([1])}.${enc({})}.x`)).toMatchObject({ ok: false, code: 'notObject', part: 'header' });
  });
});

describe('time claims', () => {
  const now = Date.UTC(2026, 10, 13, 12);
  const s = now / 1000;
  it('tells expired, not yet valid, valid and no expiry apart', () => {
    expect(timeClaims({ exp: s - 1 }, now).status).toBe('expired');
    expect(timeClaims({ nbf: s + 60, exp: s + 3600 }, now).status).toBe('notYetValid');
    expect(timeClaims({ iat: s - 10, exp: s + 3600 }, now)).toMatchObject({ status: 'valid', iat: new Date(now - 10_000) });
    expect(timeClaims({ exp: 'soon' }, now)).toMatchObject({ status: 'noExpiry', exp: null });
  });
});

describe('verifying signatures', () => {
  it('HS256 with a text secret (jwt.io example)', async () => {
    expect(await verifyJwt(decoded(JWT_IO), 'your-256-bit-secret')).toBe('valid');
    expect(await verifyJwt(decoded(JWT_IO), 'wrong secret')).toBe('invalid');
  });

  it('HS256 with a base64 secret', async () => {
    const secret = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const token = await sign({ alg: 'HS256' }, { a: 1 }, 'HMAC', key);
    expect(await verifyJwt(decoded(token), Buffer.from(secret).toString('base64'), { secretIsBase64: true })).toBe('valid');
  });

  it('RS256 with a PEM key and ES256 with a JWK', async () => {
    const rsa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const rsToken = await sign({ alg: 'RS256' }, { sub: 'x' }, 'RSASSA-PKCS1-v1_5', rsa.privateKey);
    const spki = Buffer.from(await crypto.subtle.exportKey('spki', rsa.publicKey)).toString('base64');
    const pem = `-----BEGIN PUBLIC KEY-----\n${spki.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
    expect(await verifyJwt(decoded(rsToken), pem)).toBe('valid');

    const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const esToken = await sign({ alg: 'ES256' }, { sub: 'y' }, { name: 'ECDSA', hash: 'SHA-256' }, ec.privateKey);
    const jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', ec.publicKey));
    expect(await verifyJwt(decoded(esToken), jwk)).toBe('valid');
    // Change a character in the middle of the signature (the last one may only hold base64 padding bits).
    const at = esToken.length - 20;
    const tampered = esToken.slice(0, at) + (esToken[at] === 'A' ? 'B' : 'A') + esToken.slice(at + 1);
    expect(await verifyJwt(decoded(tampered), jwk)).toBe('invalid');
  });

  it('refuses "none", unknown algorithms and unusable keys', async () => {
    expect(await verifyJwt(decoded(`${enc({ alg: 'none' })}.${enc({})}.`), 'x')).toBe('noneAlg');
    expect(await verifyJwt(decoded(`${enc({ alg: 'XY999' })}.${enc({})}.`), 'x')).toBe('unsupportedAlg');
    expect(await verifyJwt(decoded(`${enc({ alg: 'RS256' })}.${enc({})}.`), 'not a key')).toBe('badKey');
    expect(await verifyJwt(decoded(JWT_IO), '')).toBe('badKey');
  });
});
