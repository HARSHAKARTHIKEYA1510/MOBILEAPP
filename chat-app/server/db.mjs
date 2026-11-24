import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl || dbUrl.includes('<user>') || dbUrl.includes('<endpoint>')) {
    console.warn('\n⚠️ [db] WARNING: DATABASE_URL in .env has placeholder values.');
    console.warn('⚠️ [db] Please paste your real Neon PostgreSQL connection string into chat-app/.env to query Neon DB.\n');
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.__novaPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__novaPrisma = prisma;
}
