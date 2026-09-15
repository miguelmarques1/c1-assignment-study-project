import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState, type LoadingVariant } from '@/components/ui/loading-state';

afterEach(() => {
  cleanup();
});

const EXPECTED_BLOCK_COUNT: Record<LoadingVariant, number> = {
  'card-grid': 3,
  list: 4,
  'text-block': 3,
  meter: 1,
};

describe('LoadingState', () => {
  it('loading_renders_a_skeleton_shaped_like_the_content', () => {
    for (const variant of Object.keys(EXPECTED_BLOCK_COUNT) as LoadingVariant[]) {
      cleanup();
      const { container } = render(<LoadingState variant={variant} label={`Loading ${variant}`} />);

      expect(container.querySelectorAll('.animate-pulse').length).toBe(EXPECTED_BLOCK_COUNT[variant]);
      expect(container.querySelector('[role="progressbar"]')).toBeNull();
      expect(container.textContent).not.toMatch(/spinner/i);
    }
  });

  it('loading_announces_politely', () => {
    render(<LoadingState variant="list" label="Loading your lessons" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Loading your lessons')).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('empty_states_the_missing_thing_and_one_action', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No lessons yet"
        description="Start your first live classroom session."
        action={{ label: 'Start a lesson', onClick }}
      />,
    );

    expect(screen.getByText('No lessons yet')).toBeInTheDocument();
    expect(screen.getByText('Start your first live classroom session.')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);

    await userEvent.click(buttons[0]!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('empty_state_renders_without_an_action', () => {
    render(<EmptyState title="No results" description="Try a different search." />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('error_renders_plain_language_and_a_retry', async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState title="Couldn't load your lessons" description="Check your connection and try again." onRetry={onRetry} />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/[A-Z]{2,}\d{3,}/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error_state_cannot_be_constructed_without_a_retry', () => {
    function Fixture() {
      // @ts-expect-error onRetry is required — an error state cannot be silent
      return <ErrorState title="Failed" description="Something went wrong." />;
    }
    expect(Fixture).toBeDefined();
  });
});
