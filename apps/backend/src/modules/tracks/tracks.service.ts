import { BadGatewayException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ImportTrackDto } from './dto/import-track.dto.js';
import { HttpService } from '@nestjs/axios';
import * as fs from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import type { Multer } from 'multer';

@Injectable()
export class TracksService {
  constructor(private prisma: PrismaService, private http: HttpService) {}

  async getTracks() {
    const tracks = await this.prisma.track.findMany({ orderBy: { updatedAt: 'desc' } });
    return tracks.map((track) => {
      const { filePath, ...publicTrack } = track;
      const metadataPath = `${filePath}.stems.json`;
      let stems: Array<{ filename: string; name: string; taskId: string }> = [];
      if (fs.existsSync(metadataPath)) {
        try {
          stems = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        } catch {
          stems = [];
        }
      }
      return { ...publicTrack, stems };
    });
  }

  async deleteTrack(id: string) {
    const track = await this.prisma.track.findUnique({ where: { id } });
    if (!track) throw new NotFoundException('Track not found');
    if (track.status === 'SPLITTING') {
      throw new ConflictException('Attendez la fin de la séparation avant de supprimer ce morceau.');
    }

    const uploadDirectory = path.resolve('./uploads');
    const sourcePath = path.resolve(track.filePath);
    const relativeSourcePath = path.relative(uploadDirectory, sourcePath);
    if (relativeSourcePath.startsWith('..') || path.isAbsolute(relativeSourcePath)) {
      throw new ConflictException('Le fichier source est en dehors du dossier audio du studio.');
    }

    const stemsPath = `${track.filePath}.stems.json`;
    const taskPath = `${track.filePath}.separation.json`;
    const taskIds = new Set<string>();
    try {
      const stems = JSON.parse(fs.readFileSync(stemsPath, 'utf8')) as Array<{ taskId?: string }>;
      for (const stem of stems) if (stem.taskId) taskIds.add(stem.taskId);
    } catch {
      // A missing sidecar should not prevent removing the source recording.
    }
    try {
      const task = JSON.parse(fs.readFileSync(taskPath, 'utf8')) as { taskId?: string };
      if (task.taskId) taskIds.add(task.taskId);
    } catch {
      // A missing task file means no active Demucs task is associated with it.
    }

    await this.prisma.track.delete({ where: { id } });
    for (const filePath of [sourcePath, stemsPath, taskPath]) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (error) {
        console.error(`Unable to remove track asset ${filePath}`, error);
      }
    }

    const serviceUrl = process.env.DEMUCS_SERVICE_URL;
    if (serviceUrl) {
      await Promise.all([...taskIds].map(async (taskId) => {
        try {
          await firstValueFrom(this.http.delete(`${serviceUrl}/tasks/${encodeURIComponent(taskId)}`));
        } catch (error) {
          console.warn(`Unable to remove Demucs output for task ${taskId}`, error);
        }
      }));
    }

    return { id, deleted: true };
  }

  async importTrack(importDto: ImportTrackDto, file: Express.Multer.File) {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    
    const filePath = path.join(uploadDir, file.originalname);
    fs.writeFileSync(filePath, file.buffer);

    return this.prisma.track.create({
      data: {
        title: importDto.title,
        artist: importDto.artist,
        bpm: importDto.bpm ? Number(importDto.bpm) : null,
        key: importDto.key,
        filePath: filePath,
        status: 'IMPORTED',
      },
    });
  }

  async getTrack(id: string) {
    const track = await this.prisma.track.findUnique({ where: { id } });
    if (!track) throw new NotFoundException('Track not found');
    const { filePath, ...publicTrack } = track;
    const metadataPath = `${track.filePath}.stems.json`;
    const stems = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : [];
    return { ...publicTrack, stems };
  }

  async getStemFile(id: string, filename: string): Promise<AxiosResponse<Readable>> {
    const track = await this.prisma.track.findUnique({ where: { id } });
    if (!track) throw new NotFoundException('Track not found');

    const metadataPath = `${track.filePath}.stems.json`;
    const stems = fs.existsSync(metadataPath)
      ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Array<{ filename: string; taskId: string }>
      : [];
    const stem = stems.find((item) => item.filename === filename);
    if (!stem) throw new NotFoundException('Stem not found');

    const serviceUrl = process.env.DEMUCS_SERVICE_URL;
    if (!serviceUrl) throw new BadGatewayException('Stem separation service is not configured');

    try {
      return await firstValueFrom(this.http.get<Readable>(
        `${serviceUrl}/stems/${encodeURIComponent(stem.taskId)}/${encodeURIComponent(stem.filename)}`,
        { responseType: 'stream' },
      ));
    } catch {
      throw new BadGatewayException('Unable to retrieve this audio stem');
    }
  }
}
