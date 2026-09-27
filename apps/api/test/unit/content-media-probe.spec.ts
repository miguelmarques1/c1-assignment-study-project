import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MAX_AUDIO_BYTES } from '../../src/content/content-constants';
import { contentTypeFor, probeAudio } from '../../src/content/import/media-probe';
import { makeWav } from '../integration/helpers/content-fixtures';

describe('media probe (real ffmpeg-static)', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'eq-probe-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function file(name: string, content: Buffer): Promise<string> {
    const path = join(dir, name);
    await writeFile(path, content);
    return path;
  }

  it('measures_the_duration_of_a_generated_wav', async () => {
    const result = await probeAudio(await file('three.wav', makeWav(3)));
    expect(result).toMatchObject({ ok: true, audio: { durationSeconds: 3, contentType: 'audio/wav', fileName: 'three.wav' } });
  });

  it('rejects_a_file_that_is_not_decodable_audio', async () => {
    const result = await probeAudio(await file('noise.mp3', randomBytes(64 * 1024)));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/^audio file could not be decoded/);
  });

  it('rejects_a_file_without_an_audio_stream', async () => {
    const result = await probeAudio(await file('silent.wav', makeWav(0)));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/^audio file could not be decoded/);
  });

  it('rejects_an_empty_or_oversized_file', async () => {
    expect(await probeAudio(await file('empty.mp3', Buffer.alloc(0)))).toEqual({ ok: false, reason: 'audio file is empty' });

    const huge = await file('huge.wav', Buffer.alloc(0));
    await truncate(huge, MAX_AUDIO_BYTES + 1);
    const result = await probeAudio(huge);
    expect(result).toEqual({ ok: false, reason: 'audio file is 100.0 MB, over the 100.0 MB limit' });
    await rm(huge);
  });

  it('rejects_a_file_name_that_would_not_be_url_safe', async () => {
    const result = await probeAudio(await file('my audio.wav', makeWav(1)));
    expect(result).toEqual({
      ok: false,
      reason: 'audio file name "my audio.wav" may only contain letters, digits, ".", "_" and "-"',
    });
  });

  it('computes_sha256_and_size', async () => {
    const bytes = makeWav(2);
    const result = await probeAudio(await file('two.wav', bytes));
    expect(result).toMatchObject({
      ok: true,
      audio: { bytes: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') },
    });
  });

  it('maps_extension_to_content_type', () => {
    expect(contentTypeFor('a.mp3')).toBe('audio/mpeg');
    expect(contentTypeFor('a.m4a')).toBe('audio/mp4');
    expect(contentTypeFor('a.wav')).toBe('audio/wav');
    expect(contentTypeFor('a.ogg')).toBe('audio/ogg');
    expect(contentTypeFor('AUDIO.MP3')).toBe('audio/mpeg');
    expect(contentTypeFor('notes.txt')).toBeNull();
  });
});
