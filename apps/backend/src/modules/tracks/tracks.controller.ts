import { Controller, Post, Body, UseInterceptors, UploadedFile, Get, Param, Res, Delete } from '@nestjs/common';
import { TracksService } from './tracks.service.js';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { Multer } from 'multer';

@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  async getTracks() {
    return await this.tracksService.getTracks();
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importTrack(
    @Body() importDto: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return await this.tracksService.importTrack(importDto, file);
  }

  @Get(':id')
  async getTrack(@Param('id') id: string) {
    return await this.tracksService.getTrack(id);
  }

  @Delete(':id')
  async deleteTrack(@Param('id') id: string) {
    return await this.tracksService.deleteTrack(id);
  }

  @Get(':id/stems/:filename')
  async getStemFile(
    @Param('id') id: string,
    @Param('filename') filename: string,
    @Res() response: Response,
  ) {
    const file = await this.tracksService.getStemFile(id, filename);
    const contentType = file.headers['content-type'];
    response.setHeader('Content-Type', typeof contentType === 'string' ? contentType : 'audio/wav');
    file.data.on('error', () => {
      if (!response.headersSent) response.status(502);
      response.end();
    });
    file.data.pipe(response);
  }
}
