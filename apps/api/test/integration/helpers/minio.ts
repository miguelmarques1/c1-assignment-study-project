import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

export const TEST_MINIO_ACCESS_KEY = 'minioadmin';
export const TEST_MINIO_SECRET_KEY = 'minioadmin';
export const TEST_MINIO_BUCKET = 'english-quest-test';

export interface StartedMinio {
  container: StartedTestContainer;
  endpoint: string;
  stop: () => Promise<void>;
}

/**
 * F01's scheduled storage-adapter test debt, paid off here: the first suite
 * to actually exercise `StorageService` against a real object store, rather
 * than the boot-time `ensureBucket` call and the `/health` probe that were
 * its only indirect coverage until now.
 */
export async function startMinio(): Promise<StartedMinio> {
  const container = await new GenericContainer('quay.io/minio/minio:latest')
    .withCommand(['server', '/data'])
    .withEnvironment({
      MINIO_ROOT_USER: TEST_MINIO_ACCESS_KEY,
      MINIO_ROOT_PASSWORD: TEST_MINIO_SECRET_KEY,
    })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
    .start();

  const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;

  return {
    container,
    endpoint,
    stop: async () => {
      await container.stop();
    },
  };
}
