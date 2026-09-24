import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service.js';
import * as fs from 'fs';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';

type SeparationTask = {
  taskId: string;
  status: 'PROCESSING';
};

@Injectable()
export class StemSeparationService {
  constructor(private prisma: PrismaService, private http: HttpService) {}

  async triggerSeparation(trackId: string, model?: string) {
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (!track) throw new NotFoundException('Track not found');

    const serviceUrl = process.env.DEMUCS_SERVICE_URL;
    if (!serviceUrl) throw new BadGatewayException('Le service Demucs n’est pas configuré.');

    const form = new FormData();
    form.append('file', fs.createReadStream(track.filePath));
    form.append('model', model || 'htdemucs_6s');

    try {
      await this.prisma.track.update({ where: { id: trackId }, data: { status: 'SPLITTING' } });
      const response = await firstValueFrom(this.http.post(
        `${serviceUrl}/separate`,
        form,
        { headers: form.getHeaders() },
      ));
      if (!response.data.task_id) throw new Error('Demucs n’a pas renvoyé d’identifiant de traitement.');

      const task: SeparationTask = { taskId: response.data.task_id, status: 'PROCESSING' };
      fs.writeFileSync(`${track.filePath}.separation.json`, JSON.stringify(task));
      return { task_id: task.taskId, status: task.status, progress: 0 };
    } catch (error) {
      await this.prisma.track.update({ where: { id: trackId }, data: { status: 'IMPORTED' } });
      const reason = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(`Impossible de démarrer la séparation des pistes : ${reason}`);
    }
  }

  async getSeparationProgress(trackId: string) {
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (!track) throw new NotFoundException('Track not found');

    const taskPath = `${track.filePath}.separation.json`;
    if (!fs.existsSync(taskPath)) {
      if (track.status === 'SPLIT') return { status: 'COMPLETED', progress: 100 };
      return { status: track.status, progress: 0 };
    }

    const task = JSON.parse(fs.readFileSync(taskPath, 'utf8')) as SeparationTask;
    const serviceUrl = process.env.DEMUCS_SERVICE_URL;
    if (!serviceUrl) throw new BadGatewayException('Le service Demucs n’est pas configuré.');

    try {
      const response = await firstValueFrom(this.http.get(
        `${serviceUrl}/tasks/${encodeURIComponent(task.taskId)}`,
      ));
      const result = response.data as {
        status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
        progress?: number;
        stems?: Array<{ filename: string; name: string }>;
        error?: string;
      };

      if (result.status === 'COMPLETED') {
        const stems = (result.stems ?? []).map((stem) => ({ ...stem, taskId: task.taskId }));
        if (stems.length === 0) throw new Error('Demucs a terminé sans générer de pistes audio.');
        fs.writeFileSync(`${track.filePath}.stems.json`, JSON.stringify(stems));
        fs.rmSync(taskPath, { force: true });
        await this.prisma.track.update({ where: { id: trackId }, data: { status: 'SPLIT' } });
        return { status: 'COMPLETED', progress: 100, stems };
      }

      if (result.status === 'FAILED') {
        fs.rmSync(taskPath, { force: true });
        await this.prisma.track.update({ where: { id: trackId }, data: { status: 'IMPORTED' } });
        return { status: 'FAILED', progress: result.progress ?? 0, error: result.error ?? 'Demucs n’a pas pu séparer ce morceau.' };
      }

      return { status: 'PROCESSING', progress: Math.max(0, Math.min(99, result.progress ?? 0)) };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(`Impossible de lire la progression Demucs : ${reason}`);
    }
  }
}
