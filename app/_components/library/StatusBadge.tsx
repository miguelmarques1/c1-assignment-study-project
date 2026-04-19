type Tone = "neutral" | "success" | "error";

const STATUS_LABEL: Record<string, string> = {
  validating: "Validating",
  transcribing: "Transcribing",
  summarizing: "Summarizing",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_TONE: Record<string, Tone> = {
  validating: "neutral",
  transcribing: "neutral",
  summarizing: "neutral",
  ready: "success",
  failed: "error",
};

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  error: "bg-red-50 text-red-700 border-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const tone = STATUS_TONE[status] ?? "neutral";
  const showSpinner = tone === "neutral";
  return (
    <span
      role="status"
      data-status={status}
      aria-label={`Status: ${label}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {showSpinner && (
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-current opacity-70"
        />
      )}
      <span>{label}</span>
    </span>
  );
}
