import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { GENERATION_RULES_PATH } from './generation.constants';
import { loadGenerationRulesFile, type LoadedGenerationRules } from './rules/generation-rules';

/**
 * Holds the content generation rules in force. They are loaded once, when
 * the module initializes, and an invalid file stops the API from booting
 * with every issue listed, as the excerpt rules and the prompt library do.
 * The structure markers are checked against the taxonomy in force, so a
 * marker for a retired tag is a boot error rather than a silent no-op.
 */
@Injectable()
export class GenerationRulesService implements OnModuleInit {
  private readonly logger = new Logger(GenerationRulesService.name);
  private loaded: LoadedGenerationRules | undefined;

  constructor(private readonly taxonomy: ErrorTaxonomyService) {}

  onModuleInit(): void {
    this.load();
  }

  load(filePath: string = GENERATION_RULES_PATH): LoadedGenerationRules {
    this.loaded = loadGenerationRulesFile(filePath, this.taxonomy.current());
    this.logger.log(`Loaded content generation rules v${this.loaded.version} (${this.loaded.fingerprint.slice(0, 12)})`);
    return this.loaded;
  }

  current(): LoadedGenerationRules {
    return this.loaded ?? this.load();
  }
}
