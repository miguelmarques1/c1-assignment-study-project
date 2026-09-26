import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ledgerListQuerySchema,
  type ApiSuccess,
  type LearningProfileView,
  type LedgerEntryDetailView,
  type LedgerEntryListView,
  type LedgerListQuery,
} from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { ProfileService } from './profile.service';

const entryIdParamPipe = new ZodValidationPipe(z.uuid());
const ledgerQueryPipe = new ZodValidationPipe(ledgerListQuerySchema);

@ApiTags('profile')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @ApiOperation({
    summary: "Read the caller's learning profile",
    description:
      'Six smoothed competency scores (always six, Pronunciation last) with delta, measurement count, the ' +
      '`Warming up` flag and trend, Pronunciation with its accuracy and prosody sub-scores, the recurring ' +
      'weaknesses (unmastered tags with at least 3 occurrences in the last 30 days, ranked) and server-built ' +
      "notes such as the partial-update note. The caller's own profile only.",
  })
  @ApiResponse({ status: 200, description: "The caller's learning profile.", schema: dataEnvelope('LearningProfileView') })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async get(@CurrentUser() user: AuthenticatedUser): Promise<ApiSuccess<LearningProfileView>> {
    return { data: await this.profile.getProfile(user.id) };
  }

  @Get('ledger')
  @ApiOperation({
    summary: "List the caller's error ledger",
    description:
      "Every one of the caller's ledger records, non-retired first, each group by last seen. `tag` narrows it " +
      "to that tag's record (0 or 1 entries), which is how a tag chip resolves to an entry id.",
  })
  @ApiQuery({ name: 'tag', required: false, type: 'string', description: 'An exact taxonomy tag, 3–64 characters.' })
  @ApiResponse({ status: 200, description: "The caller's ledger records.", schema: dataEnvelope('LedgerEntryListView') })
  @ApiResponse({ status: 400, description: 'VAL001: tag outside 3–64 characters.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async list(
    @Query(ledgerQueryPipe) query: LedgerListQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LedgerEntryListView>> {
    return { data: await this.profile.listLedger(user.id, query.tag) };
  }

  @Get('ledger/:entryId')
  @ApiOperation({
    summary: 'Read one ledger record with its examples',
    description:
      "One of the caller's own records: up to 5 examples, most recent first, and every lesson or activity it " +
      "was seen in. Another user's entry id is indistinguishable from an unknown one.",
  })
  @ApiParam({ name: 'entryId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The ledger record.', schema: dataEnvelope('LedgerEntryDetailView') })
  @ApiResponse({ status: 404, description: 'PROF001: no such record for the caller.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 400, description: 'VAL001: entryId is not a valid UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async detail(
    @Param('entryId', entryIdParamPipe) entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LedgerEntryDetailView>> {
    return { data: await this.profile.getLedgerEntry(user.id, entryId) };
  }
}
