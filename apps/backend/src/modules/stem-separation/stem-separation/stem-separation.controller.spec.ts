import { Test, TestingModule } from '@nestjs/testing';
import { StemSeparationController } from './stem-separation.controller';

describe('StemSeparationController', () => {
  let controller: StemSeparationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StemSeparationController],
    }).compile();

    controller = module.get<StemSeparationController>(StemSeparationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
