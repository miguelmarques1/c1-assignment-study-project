import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioPlayer } from '@/components/ui';

function audioElement(): HTMLAudioElement {
  return screen.getByLabelText('Sample audio') as HTMLAudioElement;
}

function loadMetadata(audio: HTMLAudioElement, duration = 125): void {
  Object.defineProperty(audio, 'duration', { value: duration, configurable: true });
  fireEvent(audio, new Event('loadedmetadata'));
}

beforeEach(() => {
  // jsdom does not implement playback; a minimal fake keeps `paused` and the media events honest.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function pause(this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    this.dispatchEvent(new Event('pause'));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AudioPlayer', () => {
  it('play_is_disabled_until_metadata_loads', () => {
    render(<AudioPlayer src="http://api/media" label="Sample audio" />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeDisabled();
    loadMetadata(audioElement());
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByText('0:00 / 2:05')).toBeInTheDocument();
  });

  it('play_and_pause_toggle_with_an_accessible_name', async () => {
    const user = userEvent.setup();
    render(<AudioPlayer src="http://api/media" label="Sample audio" />);
    loadMetadata(audioElement());

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('seek_moves_the_position', () => {
    render(<AudioPlayer src="http://api/media" label="Sample audio" />);
    const audio = audioElement();
    loadMetadata(audio);

    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '65' } });
    expect(audio.currentTime).toBe(65);
    expect(screen.getByText('1:05 / 2:05')).toBeInTheDocument();
  });

  it('the_first_play_fires_once', async () => {
    const user = userEvent.setup();
    const onFirstPlay = vi.fn();
    render(<AudioPlayer src="http://api/media" label="Sample audio" onFirstPlay={onFirstPlay} />);
    loadMetadata(audioElement());

    await user.click(screen.getByRole('button', { name: 'Play' }));
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(onFirstPlay).toHaveBeenCalledTimes(1);
  });

  it('an_error_shows_the_message_with_retry', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const onRetry = vi.fn();
    render(<AudioPlayer src="http://api/media" label="Sample audio" onError={onError} onRetry={onRetry} />);

    fireEvent(audioElement(), new Event('error'));
    expect(screen.getByRole('alert')).toHaveTextContent('This audio could not be loaded.');
    expect(onError).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });
});
