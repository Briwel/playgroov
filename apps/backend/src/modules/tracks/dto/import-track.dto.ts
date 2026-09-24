import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber } from 'class-validator';

export enum ImportSource {
  LOCAL = 'local',
  MIC = 'mic',
  URL = 'url',
}

export class ImportTrackDto {
  @IsEnum(ImportSource)
  @IsNotEmpty()
  source: ImportSource;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  artist?: string;

  @IsString()
  @IsNotEmpty()
  filePath: string; // URL ou chemin de stockage

  @IsNumber()
  @IsOptional()
  bpm?: number;

  @IsString()
  @IsOptional()
  key?: string;
}
