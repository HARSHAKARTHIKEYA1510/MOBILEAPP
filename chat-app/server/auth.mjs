import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { prisma } from './db.mjs';

const scryptAsync = promisify(crypto.scrypt);

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

export function toPublicUser(u) {
  return {
    id: u.id,
    name: u.name,
    bio: u.bio ?? null,
  };
}

export async function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(plain, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(plain, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = await scryptAsync(plain, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derived);
}

export async function signupWithCredentials({ username, password, bio }) {
  const name = typeof username === 'string' ? username.trim() : '';
  const pass = typeof password === 'string' ? password : '';

  if (!name || name.length < 2) {
    const err = new Error('Username must be at least 2 characters');
    err.status = 400;
    throw err;
  }
  if (name.includes(':')) {
    const err = new Error('Username cannot contain ":"');
    err.status = 400;
    throw err;
  }
  if (!pass || pass.length < 4) {
    const err = new Error('Password must be at least 4 characters');
    err.status = 400;
    throw err;
  }

  const existing = await prisma.user.findUnique({ where: { name } });
  if (existing) {
    const err = new Error('Username already exists');
    err.status = 409;
    throw err;
  }

  const passwordHash = await hashPassword(pass);
  const created = await prisma.user.create({
    data: {
      name,
      passwordHash,
      bio: typeof bio === 'string' && bio.trim() ? bio.trim() : null,
    },
  });

  return toPublicUser(created);
}

export async function loginWithCredentials({ username, password }) {
  const name = typeof username === 'string' ? username.trim() : '';
  const pass = typeof password === 'string' ? password : '';

  if (!name || !pass) {
    const err = new Error('Username and password are required');
    err.status = 400;
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { name } });
  if (!user) {
    const err = new Error('Invalid username or password');
    err.status = 401;
    throw err;
  }

  const ok = await verifyPassword(pass, user.passwordHash);
  if (!ok) {
    const err = new Error('Invalid username or password');
    err.status = 401;
    throw err;
  }

  return toPublicUser(user);
}

export async function authenticateRequest(req) {
  const auth = req.headers['authorization'] || '';
  if (!auth) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  let username = '';
  let password = '';

  if (auth.startsWith('Basic ')) {
    const raw = auth.slice(6).trim();
    // Support either base64 "username:password" or raw "username:password"
    let decoded = '';
    try {
      const buf = Buffer.from(raw, 'base64');
      const test = buf.toString('utf8');
      if (test.includes(':')) decoded = test;
    } catch {}
    if (!decoded) decoded = raw;

    const idx = decoded.indexOf(':');
    if (idx !== -1) {
      username = decoded.slice(0, idx);
      password = decoded.slice(idx + 1);
    }
  }

  if (!username || !password) {
    const err = new Error('Invalid authorization header format');
    err.status = 401;
    throw err;
  }

  return loginWithCredentials({ username, password });
}
