import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DifficultyRating } from '@/components/activity/difficulty-rating';

afterEach(() => {
  cleanup();
});

describe('DifficultyRating', () => {
  it('rates_and_keeps_the_existing_not_useful_flag', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn().mockResolvedValue(undefined);
    render(<DifficultyRating value={{ rating: null, notUseful: true }} onRate={onRate} />);

    await user.click(screen.getByRole('button', { name: 'Just right' }));

    expect(onRate).toHaveBeenCalledWith({ rating: 'just_right', notUseful: true });
  });

  it('marks_not_useful_while_keeping_the_existing_rating', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn().mockResolvedValue(undefined);
    render(<DifficultyRating value={{ rating: 'too_hard', notUseful: false }} onRate={onRate} />);

    await user.click(screen.getByRole('button', { name: 'Not useful' }));

    expect(onRate).toHaveBeenCalledWith({ rating: 'too_hard', notUseful: true });
  });

  it('dismisses_without_calling_onRate', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    render(<DifficultyRating value={null} onRate={onRate} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss rating' }));

    expect(screen.queryByRole('group', { name: "Rate this activity's difficulty" })).not.toBeInTheDocument();
    expect(onRate).not.toHaveBeenCalled();
  });
});
