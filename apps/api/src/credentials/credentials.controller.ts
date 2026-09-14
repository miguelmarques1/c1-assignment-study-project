import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  credentialProviderSchema,
  saveCredentialSchema,
  type ApiSuccess,
  type CredentialProvider,
  type MaskedCredential,
  type SaveCredentialInput,
} from '@english-quest/shared';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { CredentialsService } from './credentials.service';

const providerParamPipe = new ZodValidationPipe(credentialProviderSchema);

@ApiTags('credentials')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@Controller('credentials')
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get()
  @ApiOperation({
    summary: 'List credentials',
    description:
      'Returns one entry per provider, always both, so the client never special-cases an ' +
      'absent credential. Key material is never included — only a mask of the last four characters.',
  })
  @ApiResponse({
    status: 200,
    description: 'The caller’s credentials, masked.',
    schema: dataEnvelope('MaskedCredentialList'),
  })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ApiSuccess<MaskedCredential[]>> {
    return { data: await this.credentials.list(user.id) };
  }

  @Put(':provider')
  @ApiOperation({
    summary: 'Save or replace a credential',
    description:
      'Validates against the provider before storing. A rejected key is discarded and any ' +
      'previously stored credential is left untouched; an unreachable provider stores the key ' +
      'as unverified for the daily job to retry.',
  })
  @ApiParam({ name: 'provider', enum: credentialProviderSchema.options })
  @ApiBody({ schema: { $ref: '#/components/schemas/SaveCredentialRequest' } })
  @ApiResponse({
    status: 200,
    description: 'Stored. Status is valid, or unverified when the provider could not be reached.',
    schema: dataEnvelope('MaskedCredential'),
  })
  @ApiResponse({
    status: 400,
    description: 'CRED001: the provider rejected the key; nothing was stored.',
    ...ERROR_RESPONSE,
  })
  async save(
    @Param('provider', providerParamPipe) provider: CredentialProvider,
    @Body(new ZodValidationPipe(saveCredentialSchema)) body: SaveCredentialInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<MaskedCredential>> {
    return {
      data: await this.credentials.save(user.id, provider, body.key, body.region ?? null),
    };
  }

  @Delete(':provider')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a credential',
    description:
      'Removes the stored key. The provider returns to missing, which immediately blocks the ' +
      'stages that depend on it without affecting any other participant.',
  })
  @ApiParam({ name: 'provider', enum: credentialProviderSchema.options })
  @ApiResponse({ status: 204, description: 'Deleted.' })
  async remove(
    @Param('provider', providerParamPipe) provider: CredentialProvider,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.credentials.remove(user.id, provider);
  }

  @Post(':provider/revalidate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Re-validate on demand',
    description: 'Re-probes the stored credential and persists the refreshed status.',
  })
  @ApiParam({ name: 'provider', enum: credentialProviderSchema.options })
  @ApiResponse({
    status: 200,
    description: 'Re-probed.',
    schema: dataEnvelope('MaskedCredential'),
  })
  @ApiResponse({
    status: 409,
    description: 'CRED002: no credential stored for that provider.',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({
    status: 500,
    description: 'CRED003: the stored credential could not be decrypted; it is now invalid.',
    ...ERROR_RESPONSE,
  })
  async revalidate(
    @Param('provider', providerParamPipe) provider: CredentialProvider,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<MaskedCredential>> {
    return { data: await this.credentials.revalidate(user.id, provider) };
  }
}
