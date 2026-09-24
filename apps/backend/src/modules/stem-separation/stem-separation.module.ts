import { Module } from '@nestjs/common';
import { StemSeparationController } from './stem-separation.controller.js';
import { StemSeparationService } from './stem-separation.service.js';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [HttpModule, PrismaModule],
  controllers: [StemSeparationController],
  providers: [StemSeparationService],
})
export class StemSeparationModule {}

