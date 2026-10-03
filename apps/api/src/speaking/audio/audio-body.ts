import type { IncomingMessage } from 'node:http';

import { AppError } from '../../common/app-error';

/**
 * Reads a raw `audio/wav` request body with a running byte cap (A29). Nest's
 * JSON and urlencoded parsers skip any request whose `Content-Type` they do
 * not recognise, so `audio/wav` reaches the controller as an untouched
 * stream — no multer, no presigned URL, just this. `Content-Length` is
 * checked first so an oversized body never has to be streamed at all; the
 * running total covers a request lying about (or omitting) that header.
 */
export async function readAudioBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const contentType = req.headers['content-type'];
  if (!contentType?.toLowerCase().startsWith('audio/wav')) {
    throw AppError.validationFailed([{ path: 'content-type', message: 'Expected audio/wav.' }]);
  }

  const declaredLength = req.headers['content-length'];
  if (declaredLength !== undefined && Number(declaredLength) > maxBytes) {
    throw AppError.speakingAudioTooLong();
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = (result: { ok: true; buffer: Buffer } | { ok: false; error: Error }): void => {
      if (settled) {
        return;
      }
      settled = true;
      req.removeAllListeners('data');
      req.removeAllListeners('end');
      req.removeAllListeners('error');
      if (result.ok) {
        resolve(result.buffer);
      } else {
        reject(result.error);
      }
    };

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        finish({ ok: false, error: AppError.speakingAudioTooLong() });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish({ ok: true, buffer: Buffer.concat(chunks) }));
    req.on('error', (error) => finish({ ok: false, error: error instanceof Error ? error : new Error(String(error)) }));
  });
}
