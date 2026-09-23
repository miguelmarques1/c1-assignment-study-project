import { cleanup, render, screen } from '@testing-library/react';
import { ConnectionQuality } from 'livekit-client';
import { afterEach, describe, expect, it } from 'vitest';

import { ConnectionQualityIndicator } from '@/components/classroom/connection-quality';
import { ParticipantGrid } from '@/components/classroom/participant-grid';
import { ParticipantTile } from '@/components/classroom/participant-tile';
import type { ParticipantView } from '@/components/classroom/use-classroom-room';

function participant(overrides: Partial<ParticipantView> = {}): ParticipantView {
  return {
    identity: 'user-1',
    displayName: 'Alice',
    isLocal: false,
    isSpeaking: false,
    muted: false,
    cameraOff: true,
    quality: ConnectionQuality.Excellent,
    videoPublication: null,
    audioPublication: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('ParticipantTile', () => {
  it('shows_a_mute_badge_on_a_muted_remote_participant', () => {
    render(<ParticipantTile participant={participant({ muted: true })} size="large" />);
    expect(screen.getByText('Muted')).toBeInTheDocument();
  });

  it('shows_a_mute_badge_on_the_local_tile_when_self_muted', () => {
    render(
      <ParticipantTile participant={participant({ isLocal: true, muted: true })} size="small" />,
    );
    expect(screen.getByText('Muted')).toBeInTheDocument();
  });

  it('replaces_the_tile_with_initials_when_the_camera_is_off', () => {
    const { container } = render(
      <ParticipantTile
        participant={participant({ videoPublication: null, cameraOff: true })}
        size="large"
      />,
    );

    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByRole('img', { name: 'Alice' })).toBeInTheDocument();
  });
});

describe('ParticipantGrid', () => {
  it('renders_two_tiles_at_the_default_cap', () => {
    const local = participant({ identity: 'local', displayName: 'You', isLocal: true });
    const remote = participant({ identity: 'remote', displayName: 'Ana' });

    render(<ParticipantGrid participants={[local, remote]} />);

    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('You (you)')).toBeInTheDocument();
  });

  it('renders_a_uniform_grid_above_the_default_cap', () => {
    const local = participant({ identity: 'local', displayName: 'You', isLocal: true });
    const remoteA = participant({ identity: 'remote-a', displayName: 'Ana' });
    const remoteB = participant({ identity: 'remote-b', displayName: 'Bob' });

    const { container } = render(<ParticipantGrid participants={[local, remoteA, remoteB]} />);

    const grid = container.querySelector('.grid-cols-2');
    expect(grid).not.toBeNull();
    expect(grid?.children).toHaveLength(2);
    expect(screen.getByText('You (you)')).toBeInTheDocument();
  });
});

describe('ConnectionQualityIndicator', () => {
  it('pairs_the_quality_icon_with_a_text_label', () => {
    const cases: Array<[ConnectionQuality, string]> = [
      [ConnectionQuality.Excellent, 'Excellent'],
      [ConnectionQuality.Good, 'Good'],
      [ConnectionQuality.Poor, 'Poor'],
      [ConnectionQuality.Lost, 'Lost'],
    ];

    for (const [quality, label] of cases) {
      const { unmount } = render(<ConnectionQualityIndicator quality={quality} />);
      // Text is present regardless of the icon — never colour or shape alone.
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});
