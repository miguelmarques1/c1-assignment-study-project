import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { NotRecordingBanner } from '@/components/classroom/not-recording-banner';
import { RecordingIndicator } from '@/components/classroom/recording-indicator';

afterEach(() => {
  cleanup();
});

describe('RecordingIndicator', () => {
  it('shows_recording_as_text_and_status', () => {
    const { container } = render(<RecordingIndicator status="recording" />);

    expect(screen.getByText('Recording')).toBeInTheDocument();
    expect(container.querySelector('.bg-badge-danger-bg')).not.toBeNull();
  });

  it('shows_not_recording_with_the_banner', () => {
    render(
      <>
        <RecordingIndicator status="not_recording" />
        <NotRecordingBanner />
      </>,
    );

    expect(screen.getByText('Not recording')).toBeInTheDocument();
    expect(
      screen.getByText('This lesson is not being recorded. End and restart to try again.'),
    ).toBeInTheDocument();
  });

  it('the_banner_can_be_dismissed', async () => {
    render(
      <>
        <RecordingIndicator status="not_recording" />
        <NotRecordingBanner />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The badge is a separate component from the banner — dismissing one never touches the other.
    expect(screen.getByText('Not recording')).toBeInTheDocument();
  });

  it('shows_starting_without_claiming_to_record', () => {
    render(<RecordingIndicator status="starting" />);

    expect(screen.getByText('Starting recording…')).toBeInTheDocument();
    expect(screen.queryByText('Recording')).not.toBeInTheDocument();
  });

  it('composes_only_from_design_tokens', () => {
    const { container } = render(
      <>
        <RecordingIndicator status="recording" />
        <NotRecordingBanner />
      </>,
    );

    const markup = container.innerHTML;
    // No hex colour and no Tailwind arbitrary-value syntax anywhere in the rendered markup.
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(markup).not.toMatch(/-\[[^\]]+\]/);
  });
});
