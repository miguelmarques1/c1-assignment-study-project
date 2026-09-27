import {
  AzureSpeechIcon,
  CameraIcon,
  CameraOffIcon,
  CloudCheckIcon,
  EyeIcon,
  EyeOffIcon,
  GeminiIcon,
  HangUpIcon,
  HelpIcon,
  LockIcon,
  MailIcon,
  MicrophoneIcon,
  MicrophoneOffIcon,
  PencilIcon,
  PuzzleIcon,
  SettingsIcon,
  SignalIcon,
  TextIcon,
  TrashIcon,
  VerifiedIcon,
  type IconProps,
} from '@/components/ui';

import { SectionShell } from './section-shell';

const ICONS: { name: string; Icon: (props: IconProps) => React.JSX.Element }[] = [
  { name: 'Mail', Icon: MailIcon },
  { name: 'Lock', Icon: LockIcon },
  { name: 'Eye', Icon: EyeIcon },
  { name: 'EyeOff', Icon: EyeOffIcon },
  { name: 'Trash', Icon: TrashIcon },
  { name: 'Settings', Icon: SettingsIcon },
  { name: 'Gemini', Icon: GeminiIcon },
  { name: 'AzureSpeech', Icon: AzureSpeechIcon },
  { name: 'Help', Icon: HelpIcon },
  { name: 'Microphone', Icon: MicrophoneIcon },
  { name: 'MicrophoneOff', Icon: MicrophoneOffIcon },
  { name: 'Camera', Icon: CameraIcon },
  { name: 'CameraOff', Icon: CameraOffIcon },
  { name: 'HangUp', Icon: HangUpIcon },
  { name: 'Signal', Icon: SignalIcon },
  { name: 'Verified', Icon: VerifiedIcon },
  { name: 'CloudCheck', Icon: CloudCheckIcon },
  { name: 'Pencil', Icon: PencilIcon },
  { name: 'Text', Icon: TextIcon },
  { name: 'Puzzle', Icon: PuzzleIcon },
];

export function IconSection() {
  return (
    <SectionShell title="Icons" vrId="icons">
      <div className="grid grid-cols-3 gap-md sm:grid-cols-5 md:grid-cols-9">
        {ICONS.map(({ name, Icon }) => (
          <div key={name} className="flex flex-col items-center gap-xs">
            <Icon size={24} />
            <span className="text-label-sm text-on-surface-variant">{name}</span>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
