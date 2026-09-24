import { Test, TestingModule } from '@nestjs/testing';
import { StemSeparationService } from './stem-separation.service';

describe('StemSeparationService', () => {
  let service: StemSeparationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StemSeparationService],
    }).compile();

    service = module.get<StemSeparationService>(StemSeparationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
