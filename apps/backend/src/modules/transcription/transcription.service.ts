import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service.js';
import * as fs from 'fs';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TranscriptionService {
  constructor(private prisma: PrismaService, private http: HttpService) {}

  async triggerTranscription(trackId: string) {
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (!track) throw new Error('Track not found');

    await this.prisma.track.update({ where: { id: trackId }, data: { status: 'TRANSCRIBING' } });

    const form = new FormData();
    form.append('file', fs.createReadStream(track.filePath));

    const url = process.env.BASIC_PITCH_SERVICE_URL + '/transcribe';
    
    try {
      const response = await firstValueFrom(this.http.post(url, form, {
        headers: { ...form.getHeaders() }
      }));
      
      await this.prisma.track.update({ where: { id: trackId }, data: { status: 'READY' } });
      
      return response.data;
    } catch (error) {
      await this.prisma.track.update({ where: { id: trackId }, data: { status: 'SPLIT' } });
      throw new Error('Transcription failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
}
