export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VIDEOMAX_PIPELINE_ENABLED === "0") return;
  const mod = await import("./app/_lib/pipeline/bootstrap");
  await mod.start();
}
