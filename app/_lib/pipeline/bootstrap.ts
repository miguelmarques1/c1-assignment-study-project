import { createWorker, type Worker } from "./worker";
import { startListener, stopListener } from "./events";

type BootstrapState = {
  worker: Worker | null;
  signalsWired: boolean;
};

const globalForBootstrap = globalThis as unknown as {
  __videomaxPipelineBootstrap?: BootstrapState;
};

function getState(): BootstrapState {
  if (!globalForBootstrap.__videomaxPipelineBootstrap) {
    globalForBootstrap.__videomaxPipelineBootstrap = {
      worker: null,
      signalsWired: false,
    };
  }
  return globalForBootstrap.__videomaxPipelineBootstrap;
}

function isEnabled(): boolean {
  return process.env.VIDEOMAX_PIPELINE_ENABLED !== "0";
}

export async function start(): Promise<void> {
  const state = getState();
  if (!isEnabled()) return;
  if (state.worker) return; // already running
  try {
    await startListener();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        scope: "pipeline",
        level: "warn",
        msg: "listener_start_failed",
        error: (err as Error).message,
      }),
    );
  }
  const worker = createWorker();
  await worker.start();
  state.worker = worker;

  if (!state.signalsWired) {
    const stopHandler = () => {
      void stop();
    };
    process.on("beforeExit", stopHandler);
    process.on("SIGTERM", stopHandler);
    process.on("SIGINT", stopHandler);
    state.signalsWired = true;
  }
}

export async function stop(): Promise<void> {
  const state = getState();
  if (!state.worker) return;
  const worker = state.worker;
  state.worker = null;
  await worker.stop().catch(() => undefined);
  await stopListener().catch(() => undefined);
}
