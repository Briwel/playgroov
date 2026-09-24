import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { TracksModule } from './modules/tracks/tracks.module.js';
import { StemSeparationModule } from './modules/stem-separation/stem-separation.module.js';
import { TranscriptionModule } from './modules/transcription/transcription.module.js';

@Module({
  imports: [
    TracksModule,
    StemSeparationModule,
    TranscriptionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
