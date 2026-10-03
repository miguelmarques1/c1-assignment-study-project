import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';

import { ERROR_CODES } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/common/app-error';
import { readAudioBody } from '../../src/speaking/audio/audio-body';

const MAX_BYTES = 10;

function fakeRequest(headers: Record<string, string | undefined>): IncomingMessage & EventEmitter {
  const emitter = new EventEmitter() as IncomingMessage & EventEmitter;
  (emitter as unknown as { headers: Record<string, string | undefined> }).headers = headers;
  return emitter;
}

describe('readAudioBody', () => {
  it('rejects_a_missing_content_type', async () => {
    const req = fakeRequest({});

    await expect(readAudioBody(req, MAX_BYTES)).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('rejects_a_content_type_that_is_not_audio_wav', async () => {
    const req = fakeRequest({ 'content-type': 'application/json' });

    await expect(readAudioBody(req, MAX_BYTES)).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('rejects_early_on_an_oversized_content_length_header', async () => {
    const req = fakeRequest({ 'content-type': 'audio/wav', 'content-length': '999' });

    await expect(readAudioBody(req, MAX_BYTES)).rejects.toMatchObject({ code: ERROR_CODES.SPEAKING_AUDIO_TOO_LONG });
  });

  it('resolves_with_the_concatenated_body_within_the_cap', async () => {
    const req = fakeRequest({ 'content-type': 'audio/wav' });
    const promise = readAudioBody(req, MAX_BYTES);

    req.emit('data', Buffer.from([1, 2, 3]));
    req.emit('data', Buffer.from([4, 5]));
    req.emit('end');

    await expect(promise).resolves.toEqual(Buffer.from([1, 2, 3, 4, 5]));
  });

  it('rejects_once_the_streamed_total_exceeds_the_cap_even_with_no_content_length', async () => {
    const req = fakeRequest({ 'content-type': 'audio/wav' });
    const promise = readAudioBody(req, MAX_BYTES);

    req.emit('data', Buffer.alloc(MAX_BYTES));
    req.emit('data', Buffer.alloc(1));

    await expect(promise).rejects.toMatchObject({ code: ERROR_CODES.SPEAKING_AUDIO_TOO_LONG });
  });

  it('propagates_a_stream_error', async () => {
    const req = fakeRequest({ 'content-type': 'audio/wav' });
    const promise = readAudioBody(req, MAX_BYTES);

    req.emit('error', new Error('socket hang up'));

    await expect(promise).rejects.toThrow('socket hang up');
  });

  it('accepts_a_content_type_with_a_charset_suffix', async () => {
    const req = fakeRequest({ 'content-type': 'audio/wav;codec=pcm' });
    const promise = readAudioBody(req, MAX_BYTES);

    req.emit('data', Buffer.from([9]));
    req.emit('end');

    await expect(promise).resolves.toEqual(Buffer.from([9]));
  });

  it('never_throws_a_bare_AppError_type_mismatch', () => {
    // Sanity: the factory used above really is an AppError.
    expect(AppError.speakingAudioTooLong()).toBeInstanceOf(AppError);
  });
});
