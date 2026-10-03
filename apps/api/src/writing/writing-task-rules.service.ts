import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { WRITING_TASK_RULES_PATH } from './writing.constants';
import {
  checkRequirementsCoverage,
  loadWritingTaskRulesFile,
  WritingTaskRulesValidationError,
  type LoadedWritingTaskRules,
} from './rules/writing-task-rules';

/**
 * Holds the writing task rules in force (F17). Loaded once, when the module
 * initializes, against the taxonomy already loaded by `ErrorTaxonomyService`
 * — every analysis tag must have exactly one requirement sentence, and no
 * requirement may be declared for a tag outside the taxonomy. An invalid
 * file, or a file that disagrees with the taxonomy, stops the API from
 * booting with every issue listed at once. A scenario is looked up once per
 * task composition, never per request, so the file is never re-read.
 */
@Injectable()
export class WritingTaskRulesService implements OnModuleInit {
  private readonly logger = new Logger(WritingTaskRulesService.name);
  private loaded: LoadedWritingTaskRules | undefined;

  constructor(private readonly taxonomy: ErrorTaxonomyService) {}

  onModuleInit(): void {
    this.load();
  }

  load(filePath: string = WRITING_TASK_RULES_PATH): LoadedWritingTaskRules {
    const loaded = loadWritingTaskRulesFile(filePath);
    const coverageIssues = checkRequirementsCoverage(loaded.rules, this.taxonomy.current().analysisTags);
    if (coverageIssues.length > 0) {
      throw new WritingTaskRulesValidationError(coverageIssues);
    }
    this.loaded = loaded;
    this.logger.log(
      `Loaded writing task rules v${loaded.version} (${loaded.fingerprint.slice(0, 12)}), ${loaded.rules.scenarios.length} scenarios`,
    );
    return loaded;
  }

  current(): LoadedWritingTaskRules {
    return this.loaded ?? this.load();
  }
}
