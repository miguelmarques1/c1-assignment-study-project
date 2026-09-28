import type { PlanActivityKind } from '@english-quest/shared';

import {
  BookIcon,
  HeadphonesIcon,
  MicrophoneIcon,
  PencilIcon,
  PuzzleIcon,
  RefreshIcon,
  TextIcon,
  VolumeIcon,
  type IconProps,
} from '@/components/ui';

const KIND_ICON: Record<PlanActivityKind, (props: IconProps) => React.JSX.Element> = {
  listening: HeadphonesIcon,
  reading: BookIcon,
  vocabulary: TextIcon,
  grammar: PuzzleIcon,
  error_review: RefreshIcon,
  writing: PencilIcon,
  speaking: MicrophoneIcon,
  pronunciation: VolumeIcon,
};

export const KIND_LABEL: Record<PlanActivityKind, string> = {
  listening: 'Listening',
  reading: 'Reading',
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  error_review: 'Error review',
  writing: 'Writing',
  speaking: 'Speaking',
  pronunciation: 'Pronunciation',
};

/** An activity kind's icon, labelled for assistive tech since the icon alone carries the kind. */
export function ActivityKindIcon({ kind, size = 20 }: { kind: PlanActivityKind; size?: number }) {
  const Icon = KIND_ICON[kind];
  return (
    <span role="img" aria-label={KIND_LABEL[kind]} className="inline-flex">
      <Icon size={size} />
    </span>
  );
}
