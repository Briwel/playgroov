import { BadGatewayException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service.js';
import * as fs from 'fs';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import * as path from 'path';

@Injectable()
export class TranscriptionService {
  constructor(private prisma: PrismaService, private http: HttpService) {}

  async triggerTranscription(trackId: string) {
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (!track) throw new NotFoundException('Morceau introuvable.');

    const midiPath = `${track.filePath}.mid`;
    if (fs.existsSync(midiPath)) return { status: 'READY', midiAvailable: true };
    if (track.status === 'TRANSCRIBING') throw new ConflictException('La transcription est déjà en cours.');
    if (!['SPLIT', 'READY'].includes(track.status)) {
      throw new ConflictException('Isolez les pistes avant de lancer la transcription MIDI.');
    }

    const serviceUrl = process.env.BASIC_PITCH_SERVICE_URL?.replace(/\/+$/, '');
    if (!serviceUrl) throw new BadGatewayException('Le service Basic Pitch n’est pas configuré.');

    await this.prisma.track.update({ where: { id: trackId }, data: { status: 'TRANSCRIBING' } });
    let taskId: string | undefined;
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(track.filePath));
      const response = await firstValueFrom(this.http.post(`${serviceUrl}/transcribe`, form, {
        headers: form.getHeaders(),
        timeout: 30 * 60 * 1000,
      }));
      taskId = response.data?.task_id;
      if (typeof taskId !== 'string' || !taskId) throw new Error('Basic Pitch n’a pas renvoyé d’identifiant de tâche.');

      const midi = await firstValueFrom(this.http.get<ArrayBuffer>(`${serviceUrl}/midi/${encodeURIComponent(taskId)}`, {
        responseType: 'arraybuffer',
        timeout: 60_000,
      }));
      const midiBuffer = Buffer.from(midi.data);
      if (midiBuffer.length < 14 || midiBuffer.toString('ascii', 0, 4) !== 'MThd') {
        throw new Error('Le service a renvoyé un fichier MIDI invalide.');
      }
      fs.writeFileSync(midiPath, midiBuffer);
      await this.prisma.track.update({ where: { id: trackId }, data: { status: 'READY' } });
      return { status: 'READY', midiAvailable: true, filename: path.basename(midiPath) };
    } catch (error) {
      if (fs.existsSync(midiPath)) fs.unlinkSync(midiPath);
      await this.prisma.track.update({ where: { id: trackId }, data: { status: 'SPLIT' } });
      const detail = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(`La transcription Basic Pitch a échoué : ${detail}`);
    } finally {
      if (taskId) {
        try {
          await firstValueFrom(this.http.delete(`${serviceUrl}/tasks/${encodeURIComponent(taskId)}`, { timeout: 10_000 }));
        } catch (error) {
          console.warn(`Impossible de nettoyer la tâche Basic Pitch ${taskId}`, error);
        }
      }
    }
  }
}
