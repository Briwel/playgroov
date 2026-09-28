import { BadGatewayException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service.js';
import * as fs from 'fs';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import * as path from 'path';
import type { Readable } from 'stream';

type Stem = { filename: string; name: string; taskId: string };
export type StemTranscription = { stemName: string; label: string; filename: string };

const STEM_LABELS: Record<string, string> = {
  vocals: 'Voix', drums: 'Batterie', bass: 'Basse', guitar: 'Guitare', piano: 'Piano', other: 'Autres instruments',
};

@Injectable()
export class TranscriptionService {
  constructor(private prisma: PrismaService, private http: HttpService) {}

  async triggerTranscription(trackId: string) {
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (!track) throw new NotFoundException('Morceau introuvable.');
    if (track.status === 'TRANSCRIBING') throw new ConflictException('La transcription est déjà en cours.');
    if (!['SPLIT', 'READY'].includes(track.status)) {
      throw new ConflictException('Isolez les pistes avant de lancer la transcription MIDI.');
    }

    const stems = this.readStems(track.filePath);
    if (!stems.length) throw new ConflictException('Aucune piste isolée à transcrire. Isolez d’abord les instruments.');
    const existing = this.readTranscriptions(track.filePath).filter((item) => fs.existsSync(path.join(path.dirname(track.filePath), path.basename(item.filename))));
    const pending = stems.filter((stem) => !existing.some((item) => item.stemName === stem.name));
    if (!pending.length && existing.length) return { status: 'READY', midiAvailable: true, transcriptions: existing };

    const basicPitchUrl = process.env.BASIC_PITCH_SERVICE_URL?.replace(/\/+$/, '');
    const demucsUrl = process.env.DEMUCS_SERVICE_URL?.replace(/\/+$/, '');
    if (!basicPitchUrl || !demucsUrl) throw new BadGatewayException('Configurez les services Basic Pitch et Demucs.');

    await this.prisma.track.update({ where: { id: trackId }, data: { status: 'TRANSCRIBING' } });
    const generated = [...existing];
    const failures: string[] = [];
    try {
      // Process stems sequentially to keep CPU and memory usage predictable.
      for (const stem of pending) {
        let taskId: string | undefined;
        try {
          const audioResponse = await firstValueFrom(this.http.get<Readable>(
            `${demucsUrl}/stems/${encodeURIComponent(stem.taskId)}/${encodeURIComponent(stem.filename)}`,
            { responseType: 'stream', timeout: 120_000 },
          ));
          const form = new FormData();
          form.append('file', audioResponse.data, { filename: stem.filename, contentType: 'audio/wav' });
          const response = await firstValueFrom(this.http.post(`${basicPitchUrl}/transcribe`, form, {
            headers: form.getHeaders(), timeout: 30 * 60 * 1000,
          }));
          taskId = response.data?.task_id;
          if (typeof taskId !== 'string' || !taskId) throw new Error('Basic Pitch n’a pas renvoyé d’identifiant de tâche.');

          const midiResponse = await firstValueFrom(this.http.get<ArrayBuffer>(`${basicPitchUrl}/midi/${encodeURIComponent(taskId)}`, {
            responseType: 'arraybuffer', timeout: 60_000,
          }));
          const buffer = Buffer.from(midiResponse.data);
          if (buffer.length < 14 || buffer.toString('ascii', 0, 4) !== 'MThd') throw new Error('Fichier MIDI invalide.');

          const safeName = stem.name.replace(/[^a-zA-Z0-9_-]/g, '_');
          const filename = `${path.basename(track.filePath)}.${safeName}.mid`;
          fs.writeFileSync(path.join(path.dirname(track.filePath), filename), buffer);
          generated.push({ stemName: stem.name, label: STEM_LABELS[stem.name] ?? stem.name, filename });
        } catch (error) {
          failures.push(`${STEM_LABELS[stem.name] ?? stem.name}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          if (taskId) {
            try { await firstValueFrom(this.http.delete(`${basicPitchUrl}/tasks/${encodeURIComponent(taskId)}`, { timeout: 10_000 })); }
            catch (error) { console.warn(`Impossible de nettoyer la tâche Basic Pitch ${taskId}`, error); }
          }
        }
      }

      const unique = [...new Map(generated.map((item) => [item.stemName, item])).values()];
      fs.writeFileSync(`${track.filePath}.transcriptions.json`, JSON.stringify(unique, null, 2));
      if (!unique.length) throw new Error(failures.join(' · ') || 'Aucune piste n’a pu être transcrite.');
      await this.prisma.track.update({ where: { id: trackId }, data: { status: 'READY' } });
      return { status: 'READY', midiAvailable: true, transcriptions: unique, failures };
    } catch (error) {
      await this.prisma.track.update({ where: { id: trackId }, data: { status: generated.length ? 'READY' : 'SPLIT' } });
      const detail = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(`La transcription des pistes a échoué : ${detail}`);
    }
  }

  private readStems(filePath: string): Stem[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(`${filePath}.stems.json`, 'utf8')) as Stem[];
      return Array.isArray(parsed) ? parsed.filter((stem) => stem?.filename && stem?.name && stem?.taskId) : [];
    } catch { return []; }
  }

  readTranscriptions(filePath: string): StemTranscription[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(`${filePath}.transcriptions.json`, 'utf8')) as StemTranscription[];
      return Array.isArray(parsed) ? parsed.filter((item) => item?.stemName && item?.filename) : [];
    } catch { return []; }
  }

  async getStemMidiFile(trackId: string, stemName: string) {
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (!track) throw new NotFoundException('Morceau introuvable.');
    const item = this.readTranscriptions(track.filePath).find((entry) => entry.stemName === stemName);
    if (!item) throw new NotFoundException('Aucun MIDI n’est disponible pour cette piste.');
    const filePath = path.join(path.dirname(track.filePath), item.filename);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Le fichier MIDI de cette piste est introuvable.');
    return { filePath, filename: item.filename };
  }
}
