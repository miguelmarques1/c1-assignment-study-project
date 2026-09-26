import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PronunciationSection } from '@/components/lessons/result/pronunciation-section';
import { TranscriptView } from '@/components/lessons/transcript/transcript-view';

import { assessedPronunciation, LESSON_ID, transcriptView, U1, U2, U3, U4 } from './fixtures/lessons';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function rows() {
  return within(screen.getByRole('list', { name: 'Transcript' })).getAllByRole('listitem').filter((item) => item.id.startsWith('u-'));
}

describe('transcript area', () => {
  it('transcript_merges_speakers_in_order_with_timestamps_and_labels', () => {
    render(<TranscriptView view={transcriptView()} />);

    expect(rows().map((row) => row.id)).toEqual([`u-${U1}`, `u-${U2}`, `u-${U3}`, `u-${U4}`]);
    const [first, second, third, fourth] = rows();
    expect(first).toHaveTextContent('00:05');
    expect(within(first!).getByText('You')).toBeInTheDocument();
    expect(within(second!).getByText('Ana')).toBeInTheDocument();
    expect(third).toHaveTextContent('04:07');
    expect(fourth).toHaveTextContent('1:02:03');
  });

  it('an_assessed_utterance_expands_to_word_colouring_and_reason', async () => {
    const user = userEvent.setup();
    render(<TranscriptView view={transcriptView()} />);
    const badge = within(rows()[0]!).getByRole('button', { name: /Pronunciation score 71/ });
    expect(badge).toHaveAttribute('aria-expanded', 'false');

    await user.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'true');

    const words = screen.getByRole('list', { name: 'Word-level pronunciation' });
    const known = within(words).getByText('known');
    expect(known).toHaveAttribute('aria-label', 'known: 54 out of 100, needs work, Mispronunciation');
    expect(known).toHaveClass('underline', 'decoration-solid', 'text-error');
    expect(within(words).getByText('booked')).toHaveClass('underline', 'decoration-dotted');
    expect(within(words).getByText('earlier')).not.toHaveClass('underline');
    expect(screen.getByText('Selected: recognition confidence 0.62, 10 words')).toBeInTheDocument();
    expect(screen.getByText('Accuracy').nextSibling).toHaveTextContent('75');
    expect(screen.getByText('Prosody').nextSibling).toHaveTextContent('67');

    // Another participant's lines carry no badge.
    expect(within(rows()[1]!).queryByRole('button')).toBeNull();
  });

  it('transcript_badges_match_the_pronunciation_section', () => {
    render(<TranscriptView view={transcriptView()} />);
    const badgeByUtterance = new Map(
      rows()
        .map((row) => [row.id.slice(2), row.querySelector('[data-score]')?.textContent ?? null] as const)
        .filter(([, score]) => score !== null),
    );
    cleanup();

    render(<PronunciationSection view={assessedPronunciation()} lessonId={LESSON_ID} />);
    const excerpts = within(screen.getByRole('list', { name: 'Assessed excerpts' })).getAllByRole('listitem');
    expect(excerpts).toHaveLength(badgeByUtterance.size);
    for (const excerpt of excerpts) {
      const href = within(excerpt).getByRole('link').getAttribute('href')!;
      const utteranceId = href.split('#u-')[1]!;
      expect(excerpt.firstElementChild).toHaveTextContent(badgeByUtterance.get(utteranceId)!);
    }
  });

  it('the_anchor_highlights_its_utterance', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.location.hash = `#u-${U3}`;
    render(<TranscriptView view={transcriptView()} />);

    expect(rows()[2]).toHaveAttribute('data-highlighted', 'true');
    expect(rows()[0]).not.toHaveAttribute('data-highlighted');
    expect(scrollIntoView).toHaveBeenCalled();

    act(() => {
      window.location.hash = `#u-${U1}`;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(rows()[0]).toHaveAttribute('data-highlighted', 'true');
  });

  it('speakers_without_a_transcript_are_named_coarsely', () => {
    const view = transcriptView();
    view.speakers[2] = { ...view.speakers[2]!, status: 'pending' };
    view.speakers.push({ userId: '55555555-5555-4555-8555-555555555555', displayName: 'Carla', isMe: false, status: 'unavailable' });
    render(<TranscriptView view={view} />);

    const speakers = screen.getByRole('list', { name: 'Speakers' });
    expect(speakers).toHaveTextContent('Bruno· Transcript pending');
    expect(speakers).toHaveTextContent('Carla· No transcript');
    expect(speakers).not.toHaveTextContent(/key|failed|blocked/i);
  });
});
