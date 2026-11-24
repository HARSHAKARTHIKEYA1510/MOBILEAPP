import http from 'node:http';
import { prisma } from './db.mjs';
import { authenticateRequest, loginWithCredentials, signupWithCredentials } from './auth.mjs';
import { handleApiRoute, readJsonBody } from './routes.mjs';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  // Health check endpoint
  if (req.method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true, app: 'Nova Chat API', timestamp: new Date().toISOString() });
    return;
  }

  try {
    // Public routes: /auth/signup & /auth/login
    if (req.method === 'POST' && path === '/auth/signup') {
      const body = await readJsonBody(req);
      const user = await signupWithCredentials(body);
      sendJson(res, 201, user);
      return;
    }

    if (req.method === 'POST' && path === '/auth/login') {
      const body = await readJsonBody(req);
      const user = await loginWithCredentials(body);
      sendJson(res, 200, user);
      return;
    }

    // Authenticated API routes
    const me = await authenticateRequest(req);
    const result = await handleApiRoute(req, url, me);
    if (!result) {
      sendJson(res, 404, { message: `Not found: ${req.method} ${url.pathname}` });
      return;
    }
    sendJson(res, result.status, result.data);
  } catch (err) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    if (status >= 500) {
      console.error(`[server] ${req.method} ${url.pathname} error:`, err);
    }
    sendJson(res, status, { message: err instanceof Error ? err.message : 'Internal server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n🚀 [Nova Server] API online at http://${HOST}:${PORT}`);
  console.log(`📡 [Nova Server] Listening for mobile clients on http://10.7.11.169:${PORT}`);
  console.log(`🗄️ [Nova Server] Powered by Prisma ORM & PostgreSQL (Neon DB)\n`);
});

const shutdown = async () => {
  console.log('\n[Nova Server] Shutting down gracefully...');
  server.close();
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
