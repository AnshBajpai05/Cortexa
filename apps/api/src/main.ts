import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ApiKeyGuard } from './common/api-key.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for the frontend (Vite dev server on 5173 + 3000 fallback)
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000').split(','),
    allowedHeaders: ['Content-Type', 'x-api-key', 'x-internal-secret'],
  });

  // T1-6: opt-in API-key guard (no-op unless CORTEXA_API_KEY is set)
  app.useGlobalGuards(new ApiKeyGuard());

  // Auto-validate all DTOs via class-validator decorators
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown fields
      forbidNonWhitelisted: false,
      transform: true,       // auto-cast primitives
    }),
  );

  // Global API prefix
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 Cortexa API is running on http://localhost:${port}/api`);
}

bootstrap();
