import { LoadingState, TextArea } from '@/components/ui';

export interface CheckingPanelProps {
  text: string;
}

/** `Checking your writing…`, with the submitted text still visible (spec §4). */
export function CheckingPanel({ text }: CheckingPanelProps) {
  return (
    <div className="flex flex-col gap-md">
      <LoadingState variant="text-block" label="Checking your writing…" />
      <TextArea label="Your writing" value={text} readOnly readOnlyPresentation rows={12} />
    </div>
  );
}
