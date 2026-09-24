import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';

async function bootstrap() {
  const backendDirectory = resolve(__dirname, '..');
  dotenv.config({ path: resolve(backendDirectory, 'env.config'), override: true });
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
