// JWT logic (no DOM): decode a token, read its time claims and verify its
// signature with the browser's Web Crypto API. Nothing is sent anywhere and
// tokens are never stored.

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** The signed part ("header.payload") and the raw signature bytes. */
  signingInput: string;
  signature: Uint8Array<ArrayBuffer>;
}

export type DecodeErrorCode = 'parts' | 'base64' | 'json' | 'notObject';
export type DecodeResult = { ok: true; jwt: DecodedJwt } | { ok: false; code: DecodeErrorCode; part: 'header' | 'payload' | 'signature' | null };

export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) throw new Error('base64');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeJson(segment: string): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(segment)));
}

export function decodeJwt(token: string): DecodeResult {
  const parts = token.trim().replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 3) return { ok: false, code: 'parts', part: null };
  const decoded: Record<string, unknown>[] = [];
  for (const [i, name] of (['header', 'payload'] as const).entries()) {
    let value: unknown;
    try { base64UrlToBytes(parts[i]); } catch { return { ok: false, code: 'base64', part: name }; }
    try { value = decodeJson(parts[i]); } catch { return { ok: false, code: 'json', part: name }; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: 'notObject', part: name };
    decoded.push(value as Record<string, unknown>);
  }
  let signature: Uint8Array<ArrayBuffer>;
  try { signature = base64UrlToBytes(parts[2]); } catch { return { ok: false, code: 'base64', part: 'signature' }; }
  return { ok: true, jwt: { header: decoded[0], payload: decoded[1], signingInput: `${parts[0]}.${parts[1]}`, signature } };
}

// ───────────── Time claims ─────────────

export type TimeStatus = 'valid' | 'expired' | 'notYetValid' | 'noExpiry';

export interface TimeClaims { iat: Date | null; nbf: Date | null; exp: Date | null; status: TimeStatus }

const asDate = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? new Date(v * 1000) : null);

/** Reads iat / nbf / exp (seconds since 1970) and whether the token is valid now. */
export function timeClaims(payload: Record<string, unknown>, now: number): TimeClaims {
  const iat = asDate(payload.iat);
  const nbf = asDate(payload.nbf);
  const exp = asDate(payload.exp);
  const status: TimeStatus = exp && exp.getTime() <= now ? 'expired' : nbf && nbf.getTime() > now ? 'notYetValid' : exp ? 'valid' : 'noExpiry';
  return { iat, nbf, exp, status };
}

// ───────────── Signature ─────────────

type Family = 'HS' | 'RS' | 'PS' | 'ES' | 'EdDSA';
interface AlgSpec { family: Family; hash?: string; curve?: string; saltLength?: number }

export const ALGS: Record<string, AlgSpec> = {
  HS256: { family: 'HS', hash: 'SHA-256' }, HS384: { family: 'HS', hash: 'SHA-384' }, HS512: { family: 'HS', hash: 'SHA-512' },
  RS256: { family: 'RS', hash: 'SHA-256' }, RS384: { family: 'RS', hash: 'SHA-384' }, RS512: { family: 'RS', hash: 'SHA-512' },
  PS256: { family: 'PS', hash: 'SHA-256', saltLength: 32 }, PS384: { family: 'PS', hash: 'SHA-384', saltLength: 48 }, PS512: { family: 'PS', hash: 'SHA-512', saltLength: 64 },
  ES256: { family: 'ES', hash: 'SHA-256', curve: 'P-256' }, ES384: { family: 'ES', hash: 'SHA-384', curve: 'P-384' }, ES512: { family: 'ES', hash: 'SHA-512', curve: 'P-521' },
  EdDSA: { family: 'EdDSA' },
};

export const isSymmetric = (alg: string) => ALGS[alg]?.family === 'HS';

export type VerifyResult = 'valid' | 'invalid' | 'unsupportedAlg' | 'noneAlg' | 'badKey';

function pemToDer(pem: string): Uint8Array<ArrayBuffer> | null {
  const m = /-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/.exec(pem);
  if (!m) return null;
  try { return Uint8Array.from(atob(m[1].replace(/\s+/g, '')), (c) => c.charCodeAt(0)); } catch { return null; }
}

function importParams(spec: AlgSpec): RsaHashedImportParams | EcKeyImportParams | Algorithm {
  if (spec.family === 'RS') return { name: 'RSASSA-PKCS1-v1_5', hash: spec.hash! };
  if (spec.family === 'PS') return { name: 'RSA-PSS', hash: spec.hash! };
  if (spec.family === 'ES') return { name: 'ECDSA', namedCurve: spec.curve! };
  return { name: 'Ed25519' };
}

function verifyParams(spec: AlgSpec): AlgorithmIdentifier | RsaPssParams | EcdsaParams {
  if (spec.family === 'HS') return { name: 'HMAC' };
  if (spec.family === 'PS') return { name: 'RSA-PSS', saltLength: spec.saltLength! };
  if (spec.family === 'ES') return { name: 'ECDSA', hash: spec.hash! };
  if (spec.family === 'RS') return { name: 'RSASSA-PKCS1-v1_5' };
  return { name: 'Ed25519' };
}

/**
 * Verify the signature. For HS* the key is the shared secret (text, or
 * base64 when `secretIsBase64`); for the others, a public key as PEM
 * ("BEGIN PUBLIC KEY") or as a JWK in JSON.
 */
export async function verifyJwt(jwt: DecodedJwt, key: string, opts: { secretIsBase64?: boolean } = {}): Promise<VerifyResult> {
  const alg = String(jwt.header.alg ?? '');
  if (alg.toLowerCase() === 'none') return 'noneAlg';
  const spec = ALGS[alg];
  if (!spec) return 'unsupportedAlg';
  const data = new TextEncoder().encode(jwt.signingInput);
  let cryptoKey: CryptoKey;
  try {
    if (spec.family === 'HS') {
      const raw = opts.secretIsBase64 ? base64UrlToBytes(key.trim().replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')) : new TextEncoder().encode(key);
      if (!raw.length) return 'badKey';
      cryptoKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: spec.hash! }, false, ['verify']);
    } else {
      const trimmed = key.trim();
      if (trimmed.startsWith('{')) {
        const jwk = JSON.parse(trimmed) as JsonWebKey;
        cryptoKey = await crypto.subtle.importKey('jwk', jwk, importParams(spec), false, ['verify']);
      } else {
        const der = pemToDer(trimmed);
        if (!der) return 'badKey';
        cryptoKey = await crypto.subtle.importKey('spki', der, importParams(spec), false, ['verify']);
      }
    }
  } catch (e) {
    return (e as Error)?.name === 'NotSupportedError' ? 'unsupportedAlg' : 'badKey';
  }
  try {
    return (await crypto.subtle.verify(verifyParams(spec), cryptoKey, jwt.signature, data)) ? 'valid' : 'invalid';
  } catch {
    return 'invalid';
  }
}

/** Short explanations for the registered claim names. */
export const CLAIM_KEYS: Record<string, string> = {
  iss: 'jwt.claim.iss', sub: 'jwt.claim.sub', aud: 'jwt.claim.aud', exp: 'jwt.claim.exp', nbf: 'jwt.claim.nbf',
  iat: 'jwt.claim.iat', jti: 'jwt.claim.jti', alg: 'jwt.claim.alg', typ: 'jwt.claim.typ', kid: 'jwt.claim.kid',
};
