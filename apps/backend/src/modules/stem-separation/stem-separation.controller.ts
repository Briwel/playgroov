import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { StemSeparationService } from './stem-separation.service.js';

@Controller('stem-separation')
export class StemSeparationController {
  constructor(private readonly stemService: StemSeparationService) {}

  @Post(':trackId')
  async requestSeparation(@Param('trackId') trackId: string, @Body('model') model: string) {
    return await this.stemService.triggerSeparation(trackId, model);
  }

  @Get(':trackId/status')
  async getSeparationStatus(@Param('trackId') trackId: string) {
    return await this.stemService.getSeparationProgress(trackId);
  }
}
