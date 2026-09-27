import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { STUDY_PLAN_RULES_PATH } from './plan.constants';
import { loadPlanRulesFile, type LoadedPlanRules } from './rules/plan-rules';

/**
 * Holds the study plan rules in force. Loaded once when the module
 * initializes; an invalid file stops the API from booting with every
 * issue listed, as the generation rules and the prompt library do.
 */
@Injectable()
export class PlanRulesService implements OnModuleInit {
  private readonly logger = new Logger(PlanRulesService.name);
  private loaded: LoadedPlanRules | undefined;

  constructor() {}

  onModuleInit(): void {
    this.load();
  }

  load(filePath: string = STUDY_PLAN_RULES_PATH): LoadedPlanRules {
    this.loaded = loadPlanRulesFile(filePath);
    this.logger.log(`Loaded study plan rules v${this.loaded.version} (${this.loaded.fingerprint.slice(0, 12)})`);
    return this.loaded;
  }

  current(): LoadedPlanRules {
    return this.loaded ?? this.load();
  }
}
