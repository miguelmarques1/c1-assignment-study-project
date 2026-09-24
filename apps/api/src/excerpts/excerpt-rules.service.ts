import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { loadExcerptRulesFile, type LoadedExcerptRules } from './excerpt-rules';
import { EXCERPT_RULES_PATH } from './excerpt-selection.constants';

/**
 * Holds the excerpt selection rules in force. They are loaded once, when
 * the module initializes, and an invalid file stops the API from booting
 * with every issue listed, as the prompt library does. A stage run never
 * reads the file itself, so every selection in one process uses one version.
 */
@Injectable()
export class ExcerptRulesService implements OnModuleInit {
  private readonly logger = new Logger(ExcerptRulesService.name);
  private loaded: LoadedExcerptRules | undefined;

  onModuleInit(): void {
    this.load();
  }

  load(filePath: string = EXCERPT_RULES_PATH): LoadedExcerptRules {
    this.loaded = loadExcerptRulesFile(filePath);
    this.logger.log(`Loaded excerpt selection rules v${this.loaded.version} (${this.loaded.fingerprint.slice(0, 12)})`);
    return this.loaded;
  }

  current(): LoadedExcerptRules {
    return this.loaded ?? this.load();
  }
}
