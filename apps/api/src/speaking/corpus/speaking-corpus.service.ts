import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { ErrorTaxonomyService } from '../../taxonomy/error-taxonomy.service';
import { SPEAKING_TASKS_PATH } from '../speaking.constants';
import { loadSpeakingCorpus, type LoadedSpeakingCorpus } from './speaking-corpus';

/**
 * Holds the speaking corpus in force. Loaded once the taxonomy has itself
 * loaded (both run at boot, and Nest resolves `ErrorTaxonomyService` for
 * this provider before this module's own `onModuleInit` fires since it is a
 * constructor dependency), so every tag in a drill or a target can be
 * checked against the taxonomy in force. An invalid file stops the API from
 * booting with every issue listed, as the taxonomy and the plan rules do.
 */
@Injectable()
export class SpeakingCorpusService implements OnModuleInit {
  private readonly logger = new Logger(SpeakingCorpusService.name);
  private loaded: LoadedSpeakingCorpus | undefined;

  constructor(private readonly taxonomy: ErrorTaxonomyService) {}

  onModuleInit(): void {
    this.load();
  }

  load(filePath: string = SPEAKING_TASKS_PATH): LoadedSpeakingCorpus {
    this.loaded = loadSpeakingCorpus(filePath, this.taxonomy);
    this.logger.log(
      `Loaded speaking corpus v${this.loaded.version} (${this.loaded.fingerprint.slice(0, 12)}), ` +
        `${this.loaded.readAloud.length} read-aloud passages, ${this.loaded.openResponse.length} open-response prompts`,
    );
    return this.loaded;
  }

  current(): LoadedSpeakingCorpus {
    return this.loaded ?? this.load();
  }
}
