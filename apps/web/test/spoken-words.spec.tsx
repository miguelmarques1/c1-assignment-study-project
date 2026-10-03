import type { SpeakingWord } from '@english-quest/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpokenWords } from '@/components/speaking/spoken-words';

afterEach(() => {
  cleanup();
});

const WORDS: SpeakingWord[] = [
  { text: 'Nothing', band: 'good', accuracy: 92, errorTypes: [], startMs: 0, durationMs: 400 },
  { text: 'thorough', band: 'poor', accuracy: 40, errorTypes: ['Mispronunciation'], startMs: 500, durationMs: 300 },
  { text: 'the', band: 'poor', accuracy: 0, errorTypes: ['Omission'], startMs: null, durationMs: null },
  { text: 'extra', band: null, accuracy: null, errorTypes: [], startMs: null, durationMs: null },
];

describe('SpokenWords', () => {
  it('plays_a_poor_words_range_when_its_offsets_are_known', async () => {
    const user = userEvent.setup();
    const onPlayRange = vi.fn();
    render(<SpokenWords words={WORDS} onPlayRange={onPlayRange} />);

    await user.click(screen.getByRole('button', { name: /thorough/ }));

    expect(onPlayRange).toHaveBeenCalledWith(500, 300);
  });

  it('renders_an_omitted_word_as_poor_text_with_no_play_control', () => {
    render(<SpokenWords words={WORDS} onPlayRange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /^the:/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('the: 0 out of 100, needs work, Omission')).toBeInTheDocument();
  });

  it('renders_an_unassessed_token_in_the_variant_colour', () => {
    render(<SpokenWords words={WORDS} />);

    const extra = screen.getByLabelText('extra: not assessed');
    expect(extra).toHaveClass('text-on-surface-variant');
  });

  it('shows_the_band_legend', () => {
    render(<SpokenWords words={WORDS} />);

    expect(screen.getByText('Good (80+)')).toBeInTheDocument();
    expect(screen.getByText('Fair (60–79)')).toBeInTheDocument();
    expect(screen.getByText('Needs work (below 60)')).toBeInTheDocument();
  });
});
