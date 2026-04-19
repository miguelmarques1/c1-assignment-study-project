import { Client } from "pg";

export type VideoEventPayload = {
  videoId: string;
  userId: string;
  fromStatus: string | null;
  toStatus: string;
  stage: string | null;
  attempt: number;
  errorCode: string | null;
  createdAt: string;
};

type Subscriber = {
  filter: (evt: VideoEventPayload) => boolean;
  push: (evt: VideoEventPayload) => void;
};

let listenerClient: Client | null = null;
const subscribers = new Set<Subscriber>();
let startPromise: Promise<void> | null = null;

function resolveDatabaseUrl(): string | null {
  return process.env.DATABASE_URL ?? null;
}

async function ensureStarted(): Promise<void> {
  if (listenerClient) return;
  if (startPromise) return startPromise;
  startPromise = startInternal();
  try {
    await startPromise;
  } finally {
    startPromise = null;
  }
}

async function startInternal(): Promise<void> {
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to start the video-events listener");
  }
  const client = new Client({ connectionString });
  await client.connect();
  await client.query("LISTEN video_events");
  client.on("notification", (msg) => {
    if (!msg.payload) return;
    let parsed: VideoEventPayload;
    try {
      parsed = JSON.parse(msg.payload) as VideoEventPayload;
    } catch {
      return;
    }
    for (const sub of subscribers) {
      if (sub.filter(parsed)) {
        try {
          sub.push(parsed);
        } catch {
          // ignore subscriber errors
        }
      }
    }
  });
  client.on("error", () => {
    // Let the next ensureStarted call recover on its own; swallow here.
  });
  listenerClient = client;
}

export async function startListener(): Promise<void> {
  await ensureStarted();
}

export async function stopListener(): Promise<void> {
  const client = listenerClient;
  listenerClient = null;
  subscribers.clear();
  if (client) {
    try {
      await client.query("UNLISTEN video_events");
    } catch {
      // ignore
    }
    await client.end().catch(() => undefined);
  }
}

export async function subscribeToVideoEvents(params: {
  videoId?: string;
  userId?: string;
  signal?: AbortSignal;
}): Promise<AsyncIterable<VideoEventPayload>> {
  await ensureStarted();
  const { videoId, userId, signal } = params;

  const queue: VideoEventPayload[] = [];
  let resolveNext: ((value: IteratorResult<VideoEventPayload>) => void) | null = null;
  let closed = false;

  const subscriber: Subscriber = {
    filter: (evt) => {
      if (videoId && evt.videoId !== videoId) return false;
      if (userId && evt.userId !== userId) return false;
      return true;
    },
    push: (evt) => {
      if (closed) return;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: evt, done: false });
      } else {
        queue.push(evt);
      }
    },
  };
  subscribers.add(subscriber);

  const close = () => {
    if (closed) return;
    closed = true;
    subscribers.delete(subscriber);
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: undefined, done: true });
    }
  };

  if (signal) {
    if (signal.aborted) close();
    else signal.addEventListener("abort", close, { once: true });
  }

  return {
    [Symbol.asyncIterator](): AsyncIterator<VideoEventPayload> {
      return {
        next(): Promise<IteratorResult<VideoEventPayload>> {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (closed) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise((resolve) => {
            resolveNext = resolve;
          });
        },
        return(): Promise<IteratorResult<VideoEventPayload>> {
          close();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}
