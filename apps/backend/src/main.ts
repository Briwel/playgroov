import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function bootstrap() {
  const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const environmentPath = resolve(backendDirectory, 'env.config');
  const environment = parseEnv(readFileSync(environmentPath, 'utf8'));
  Object.assign(process.env, environment);
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
