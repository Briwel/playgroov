import { Module } from '@nestjs/common';
import { TranscriptionController } from './transcription.controller.js';
import { TranscriptionService } from './transcription.service.js';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [HttpModule, PrismaModule],
  controllers: [TranscriptionController],
  providers: [TranscriptionService],
})
export class TranscriptionModule {}

