import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { FREQUENCY_LIST_PATH } from './generation.constants';
import { loadFrequencyListFile, type LoadedFrequencyList } from './text/frequency-list';

/**
 * Holds the frequency list the difficulty gate measures against. It is
 * loaded once, when the module initializes, and a missing, unreadable or
 * malformed file stops the API from booting (PRD F14): silently skipping the
 * gate would ship unverified content while appearing to work.
 */
@Injectable()
export class FrequencyListService implements OnModuleInit {
  private readonly logger = new Logger(FrequencyListService.name);
  private loaded: LoadedFrequencyList | undefined;

  onModuleInit(): void {
    this.load();
  }

  load(filePath: string = FREQUENCY_LIST_PATH): LoadedFrequencyList {
    this.loaded = loadFrequencyListFile(filePath);
    this.logger.log(`Loaded frequency list ${this.loaded.version} (${this.loaded.size} lemmas)`);
    return this.loaded;
  }

  current(): LoadedFrequencyList {
    return this.loaded ?? this.load();
  }
}
