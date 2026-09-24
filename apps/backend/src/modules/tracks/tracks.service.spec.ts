import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TracksService } from './tracks.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TracksService', () => {
  let service: TracksService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TracksService, { provide: PrismaService, useValue: { track: { create: () => ({ id: '1' }) } } }],
    }).compile();

    service = module.get<TracksService>(TracksService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should import a track', async () => {
    const dto = { title: 'Test', filePath: 'test.mp3', source: 'local' as any };
    const file = { originalname: 'test.mp3', buffer: Buffer.from('test') } as any;
    const result = await service.importTrack(dto, file);
    expect(result.id).toBe('1');
  });
});
