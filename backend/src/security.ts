import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PASSWORD_KEY_LENGTH = 64;
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

type TokenPayload = {
  sub: string;
  profileId: string;
  email: string;
  exp: number;
};

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function hashPassword(password: string, salt = randomBytes(16).toString("base64")) {
  const passwordHash = scryptSync(password, Buffer.from(salt, "base64"), PASSWORD_KEY_LENGTH).toString("base64");
  return { passwordHash, passwordSalt: salt };
}

export function verifyPassword(password: string, passwordSalt: string, expectedHash: string) {
  const actualHash = scryptSync(password, Buffer.from(passwordSalt, "base64"), PASSWORD_KEY_LENGTH);
  const expected = Buffer.from(expectedHash, "base64");

  if (actualHash.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actualHash, expected);
}

export function signToken(input: Omit<TokenPayload, "exp">, secret: string) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      ...input,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }),
  );
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");

  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const expectedSignature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");

  const signatureBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  const decoded = JSON.parse(base64UrlDecode(payload)) as TokenPayload;
  if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return decoded;
}
