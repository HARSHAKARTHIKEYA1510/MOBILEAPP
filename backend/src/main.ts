import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { join } from 'path';
import * as fs from 'fs';

function resolveFirstExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Support larger JSON payloads for base64 file/image uploads
  app.useBodyParser('json', { limit: '15mb' });
  app.useBodyParser('urlencoded', { limit: '15mb', extended: true });

  // Enable CORS for web and mobile client access
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,Accept',
  });

  // Serve Web UI static files from ../frontend/web (or Docker / legacy fallbacks)
  const webFrontendPath = resolveFirstExistingPath([
    join(process.cwd(), '..', 'frontend', 'web'),
    join(process.cwd(), 'frontend', 'web'),
    join(__dirname, '..', '..', '..', 'frontend', 'web'),
    '/frontend/web',
    join(process.cwd(), 'public'),
  ]);

  if (webFrontendPath) {
    app.useStaticAssets(webFrontendPath);
  }

  // Serve uploaded files from backend/uploads at /uploads/*
  const uploadsPath =
    resolveFirstExistingPath([
      join(process.cwd(), 'uploads'),
      join(__dirname, '..', '..', 'uploads'),
    ]) ?? join(process.cwd(), 'uploads');

  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  app.useStaticAssets(uploadsPath, { prefix: '/uploads/' });

  // Global validation pipe — transforms payloads to DTO instances
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger / OpenAPI 3.0 configuration
  const config = new DocumentBuilder()
    .setTitle('Chat App API')
    .setDescription(
      'NestJS Chat Backend — Users, Conversations, Files, and Messages with cursor-based pagination.\n\n' +
      '**Authentication**: All endpoints require an `Authorization` header in the format:\n\n' +
      '`Authorization: Basic <username>:<password>`\n\n' +
      'The `username` acts as the unique user identifier. ' +
      'The `password` is used for authentication. ' +
      'If no user exists with that username, one is created automatically.',
    )
    .setVersion('1.0')
    .addBasicAuth(
      {
        type: 'http',
        scheme: 'basic',
        description: 'Format: Basic <username>:<password>',
      },
      'basic-auth',
    )
    .addTag('users', 'User profile operations')
    .addTag('conversations', 'Conversation management')
    .addTag('messages', 'Message CRUD, archiving, and pagination')
    .addTag('files', 'File & image uploads')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const preferredPort = Number(process.env.PORT ?? 3001);
  let activePort = preferredPort;
  try {
    await app.listen(activePort, '0.0.0.0');
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE' && activePort === 3000) {
      activePort = 3001;
      await app.listen(activePort, '0.0.0.0');
    } else {
      throw err;
    }
  }
  console.log(`Application running on http://localhost:${activePort}`);
  console.log(`Web UI available at      http://localhost:${activePort}`);
  console.log(`Swagger UI available at  http://localhost:${activePort}/docs`);
}
bootstrap();
