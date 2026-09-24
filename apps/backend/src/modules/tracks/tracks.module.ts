import { Module } from '@nestjs/common';
import { TracksController } from './tracks.controller.js';
import { TracksService } from './tracks.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [TracksController],
  providers: [TracksService],
})
export class TracksModule {}

