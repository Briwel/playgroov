import { Controller, Post, Body, Param } from '@nestjs/common';
import { TranscriptionService } from './transcription.service.js';

@Controller('transcription')
export class TranscriptionController {
  constructor(private readonly transService: TranscriptionService) {}

  @Post(':trackId')
  async requestTranscription(@Param('trackId') trackId: string) {
    return await this.transService.triggerTranscription(trackId);
  }
}
