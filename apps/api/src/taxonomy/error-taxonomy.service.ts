import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { ERROR_TAXONOMY_PATH } from './error-taxonomy.constants';
import { loadErrorTaxonomyFile, type LoadedErrorTaxonomy } from './error-taxonomy';

/**
 * Holds the error taxonomy in force. Loaded once, when the module
 * initializes, and an invalid file stops the API from booting with every
 * issue listed, as the prompt library and F09's rules do. A tag is looked up
 * many times per analysis, so the file is never re-read per call.
 */
@Injectable()
export class ErrorTaxonomyService implements OnModuleInit {
  private readonly logger = new Logger(ErrorTaxonomyService.name);
  private loaded: LoadedErrorTaxonomy | undefined;

  onModuleInit(): void {
    this.load();
  }

  load(filePath: string = ERROR_TAXONOMY_PATH): LoadedErrorTaxonomy {
    this.loaded = loadErrorTaxonomyFile(filePath);
    this.logger.log(
      `Loaded error taxonomy v${this.loaded.version} (${this.loaded.fingerprint.slice(0, 12)}), ` +
        `${this.loaded.tags.length} tags, ${this.loaded.analysisTags.length} scored by lesson analysis`,
    );
    return this.loaded;
  }

  current(): LoadedErrorTaxonomy {
    return this.loaded ?? this.load();
  }

  /** The tag's human-readable label, or the tag itself for one retired from a later taxonomy version. */
  labelOf(tag: string): string {
    return this.current().tags.find((entry) => entry.tag === tag)?.label ?? tag;
  }

  isAnalysisTag(tag: string): boolean {
    return this.current().analysisTags.includes(tag);
  }
}
