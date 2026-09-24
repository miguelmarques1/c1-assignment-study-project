import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import ffmpegPath from 'ffmpeg-static';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PronunciationAssessmentService } from '../../src/speech/pronunciation-assessment.service';
import { SpeechToTextService } from '../../src/speech/speech-to-text.service';
import {
  createPipelineTestContext,
  resetPipelineTables,
  seedSpeaker,
  type PipelineTestContext,
} from './helpers/pipeline-fixtures';

const execFileAsync = promisify(execFile);

let pipeline: PipelineTestContext;
let workDir: string;
let clipPath: string;

beforeAll(async () => {
  pipeline = await createPipelineTestContext();
  workDir = await mkdtemp(join(tmpdir(), 'f08-clip-'));
  clipPath = join(workDir, 'clip.wav');
  // The shape F18 records: 16 kHz mono 16-bit WAV.
  await execFileAsync(ffmpegPath as unknown as string, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=2',
    '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
    clipPath,
  ]);
}, 240_000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
  await pipeline?.close();
});

beforeEach(async () => {
  pipeline.speech.reset();
  pipeline.pronunciation.reset();
  await resetPipelineTables(pipeline.ctx);
});

function speech(): SpeechToTextService {
  return pipeline.ctx.app.get(SpeechToTextService);
}

function pronunciation(): PronunciationAssessmentService {
  return pipeline.ctx.app.get(PronunciationAssessmentService);
}

describe('SpeechToTextService.transcribeClip', () => {
  it('transcribes_a_clip_with_the_callers_key', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { region: 'westeurope' });

    const clip = await speech().transcribeClip(ana.id, clipPath, 'F18_open_response');

    expect(pipeline.speech.calls).toEqual([
      expect.objectContaining({ key: ana.azureKey, region: 'westeurope', contentType: 'audio/wav' }),
    ]);
    expect(clip.text).toBe("I'd like to change my flight. Is Thursday possible?");
    expect(clip.confidence).toBeCloseTo((0.91 + 0.74) / 2, 5);
    expect(clip.words.map((word) => word.text)).toEqual([
      "I'd", 'like', 'to', 'change', 'my', 'flight.', 'Is', 'Thursday', 'possible?',
    ]);
  }, 60_000);

  it('a_clip_without_a_key_raises_credential_unavailable', async () => {
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withKey: false });

    await expect(speech().transcribeClip(bruno.id, clipPath, 'F18_open_response')).rejects.toMatchObject({
      code: 'CRED002',
    });
    expect(pipeline.speech.calls).toHaveLength(0);
  }, 60_000);

  it('audits_the_callers_feature_label', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');

    await speech().transcribeClip(ana.id, clipPath, 'F18_open_response');

    const usage = await pipeline.ctx.prisma.credentialUsage.findMany();
    expect(usage).toEqual([
      expect.objectContaining({ userId: ana.id, provider: 'azure_speech', feature: 'F18_open_response', outcome: 'ok' }),
    ]);
  }, 60_000);
});

describe('PronunciationAssessmentService.assessClip', () => {
  it('assesses_a_clip_with_the_callers_key', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { region: 'westeurope' });
    const referenceText = 'This is a short speaking response.';

    const result = await pronunciation().assessClip(ana.id, clipPath, referenceText, 'F18_speaking');

    expect(pipeline.pronunciation.calls).toEqual([
      expect.objectContaining({
        key: ana.azureKey,
        region: 'westeurope',
        locale: 'en-US',
        referenceText,
        contentType: 'audio/wav',
      }),
    ]);
    expect(result.scores).toEqual({ pronunciation: 85, accuracy: 88, fluency: 82, prosody: 80, completeness: 100 });
    expect(result.locale).toBe('en-US');
    expect(result.phonemeAlphabet).toBe('IPA');
  }, 60_000);

  it('audits_the_callers_feature_label_for_a_clip', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');

    await pronunciation().assessClip(ana.id, clipPath, 'A reference text.', 'F18_speaking');

    const usage = await pipeline.ctx.prisma.credentialUsage.findMany();
    expect(usage).toEqual([
      expect.objectContaining({ userId: ana.id, provider: 'azure_speech', feature: 'F18_speaking', outcome: 'ok' }),
    ]);
  }, 60_000);
});
