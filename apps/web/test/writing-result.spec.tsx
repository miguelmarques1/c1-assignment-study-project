import type { WritingCorrectionView } from '@english-quest/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { WritingResult } from '@/components/writing/writing-result';

function correction(overrides: Partial<WritingCorrectionView> = {}): WritingCorrectionView {
  return {
    correctedAt: '2026-10-02T09:00:00.000Z',
    overallComment: 'A clear letter with good structure; watch your conditionals.',
    scores: [
      { dimension: 'grammar', label: 'Grammar', score: 70 },
      { dimension: 'vocabulary', label: 'Vocabulary', score: 80 },
      { dimension: 'coherence', label: 'Coherence', score: 90 },
      { dimension: 'task_achievement', label: 'Task achievement', score: 60 },
    ],
    text: [
      { text: 'I ', errorIndexes: [] },
      { text: 'goed', errorIndexes: [0] },
      { text: ' to the park yesterday.', errorIndexes: [] },
    ],
    revision: [
      { text: 'I ', changed: false },
      { text: 'went', changed: true },
      { text: ' to the park yesterday.', changed: false },
    ],
    errors: [
      {
        index: 0,
        quote: 'goed',
        tag: 'grammar:past-simple',
        tagLabel: 'Past simple',
        correction: 'went',
        correctionSegments: [{ text: 'went', changed: true }],
        explanation: 'The past tense of "go" is irregular.',
      },
    ],
    errorGroups: [
      {
        tag: 'grammar:past-simple',
        tagLabel: 'Past simple',
        errorIndexes: [0],
        recurrence: { count: 3, label: '3rd time' },
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('WritingResult', () => {
  it('renders_inline_highlights_on_the_original', () => {
    render(<WritingResult correction={correction()} />);

    const highlight = screen.getByRole('button', { name: /goed — Past simple/ });
    expect(highlight.closest('.whitespace-pre-line')).toHaveTextContent('I goed to the park yesterday.');
  });

  it('a_highlight_reveals_tag_correction_and_explanation_on_click_and_hover', async () => {
    const user = userEvent.setup();
    render(<WritingResult correction={correction()} />);

    const highlight = screen.getByRole('button', { name: /goed — Past simple/ });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(highlight);
    const popover = screen.getByRole('dialog', { name: 'Past simple' });
    expect(within(popover).getByText('went')).toBeInTheDocument();
    expect(within(popover).getByText('The past tense of "go" is irregular.')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // The pointer is still over `highlight` from the click above; move away and back so hovering fires fresh events.
    await user.unhover(highlight);
    await user.hover(highlight);
    expect(screen.getByRole('dialog', { name: 'Past simple' })).toBeInTheDocument();
  });

  it('a_highlight_popover_closes_on_escape', async () => {
    const user = userEvent.setup();
    render(<WritingResult correction={correction()} />);

    await user.click(screen.getByRole('button', { name: /goed — Past simple/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('the_toggle_switches_to_the_revised_version_with_changes_emphasized', async () => {
    const user = userEvent.setup();
    const { container } = render(<WritingResult correction={correction()} />);

    const originalToggle = screen.getByRole('button', { name: 'Your text' });
    const revisedToggle = screen.getByRole('button', { name: 'Revised version' });
    expect(originalToggle).toHaveAttribute('aria-pressed', 'true');
    expect(revisedToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /goed — Past simple/ })).toBeInTheDocument();

    await user.click(revisedToggle);

    expect(revisedToggle).toHaveAttribute('aria-pressed', 'true');
    expect(originalToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /goed — Past simple/ })).not.toBeInTheDocument();
    const revisedParagraph = container.querySelector('p.whitespace-pre-line')!;
    expect(revisedParagraph).toHaveTextContent('I went to the park yesterday.');
    expect(within(revisedParagraph as HTMLElement).getByText('went')).toHaveClass('font-bold');
  });

  it('shows_four_score_meters_in_order', () => {
    render(<WritingResult correction={correction()} />);

    const labels = ['Grammar', 'Vocabulary', 'Coherence', 'Task achievement'];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('groups_errors_by_tag_with_recurrence_badges', () => {
    render(<WritingResult correction={correction()} />);

    expect(screen.getByText('Past simple')).toBeInTheDocument();
    expect(screen.getByText('3rd time')).toBeInTheDocument();
    expect(screen.getByText('1 error')).toBeInTheDocument();
    expect(screen.getByText('“goed”')).toBeInTheDocument();
  });

  it('a_tag_chip_links_to_the_ledger', () => {
    render(<WritingResult correction={correction()} />);

    expect(screen.getAllByRole('link').find((link) => link.textContent === 'Past simple')).toHaveAttribute(
      'href',
      `/profile?tag=${encodeURIComponent('grammar:past-simple')}`,
    );
  });

  it('shows_an_empty_state_when_there_are_no_errors', () => {
    const noErrorsText = [{ text: 'I went to the park yesterday.', errorIndexes: [] }];
    render(<WritingResult correction={correction({ errorGroups: [], errors: [], text: noErrorsText })} />);

    expect(screen.getByText('No errors found in this text.')).toBeInTheDocument();
    expect(screen.queryByText('Past simple')).not.toBeInTheDocument();
  });
});
