import type { ProgressDashboardView } from '@english-quest/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { CompetencyChartCard } from '@/components/progress/competency-chart-card';
import { chartDomain, plotRect, seriesInRange, xOf } from '@/lib/progress-chart';
import fixture from './fixtures/progress-view.json';

const view = fixture.data as unknown as ProgressDashboardView;

afterEach(() => {
  cleanup();
});

function plotGroup(): HTMLElement {
  return screen.getByRole('group', { name: /^Line chart of your competency scores/ });
}

describe('CompetencyChart', () => {
  it('plots_one_line_per_visible_non_warming_series', () => {
    const { container } = render(<CompetencyChartCard view={view} />);

    const lined = Array.from(container.querySelectorAll('[data-series]'))
      .filter((series) => series.querySelector('path'))
      .map((series) => [series.getAttribute('data-series'), series.querySelector('path')!.getAttribute('class')]);

    expect(lined).toEqual([
      ['grammar', 'stroke-chart-1'],
      ['vocabulary', 'stroke-chart-2'],
      ['fluency', 'stroke-chart-3'],
      ['comprehension', 'stroke-chart-5'],
    ]);
  });

  it('warming_up_series_have_markers_but_no_line', () => {
    const { container } = render(<CompetencyChartCard view={view} />);

    for (const competency of ['interaction', 'pronunciation']) {
      const series = container.querySelector(`[data-series="${competency}"]`)!;
      expect(series.querySelectorAll('[data-marker]').length).toBe(2);
      expect(series.querySelector('path')).toBeNull();
    }
  });

  it('lesson_and_activity_points_use_different_markers', () => {
    const { container } = render(<CompetencyChartCard view={view} />);

    // 21 points: the one activity point is a diamond, every lesson point a circle.
    expect(container.querySelectorAll('[data-marker="circle"]')).toHaveLength(20);
    expect(container.querySelectorAll('[data-marker="diamond"]')).toHaveLength(1);
    const key = screen.getByRole('list', { name: 'Source key' });
    expect(within(key).getByText('Lesson')).toBeInTheDocument();
    expect(within(key).getByText('Activity')).toBeInTheDocument();
  });

  it('hover_shows_the_moment_with_source_date_and_values', () => {
    render(<CompetencyChartCard view={view} />);
    const inRange = seriesInRange(view.competencyHistory.series, null);
    const domain = chartDomain(inRange, null, view.serverTime)!;
    const x = xOf(Date.parse('2026-09-10T12:00:00.000Z'), domain, plotRect(640, 288));

    fireEvent.mouseMove(plotGroup(), { clientX: x });

    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveTextContent('Lesson · 10 Sep');
    expect(tooltip).toHaveTextContent('66Grammar');
    expect(tooltip.querySelectorAll('li')).toHaveLength(6);
    fireEvent.mouseLeave(plotGroup());
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  it('arrow_keys_step_through_moments_and_announce_them', async () => {
    const user = userEvent.setup();
    render(<CompetencyChartCard view={view} />);
    const live = () => plotGroup().querySelector('[aria-live="polite"]')!;

    await user.tab();
    // The segmented control is the first stop; the plot is the next.
    await user.tab();
    expect(plotGroup()).toHaveFocus();
    expect(live()).toHaveTextContent('');

    await user.keyboard('{ArrowRight}');
    expect(live()).toHaveTextContent('Lesson · 14 Jul. Grammar 60, Vocabulary 70, Fluency 66, Comprehension 76.');
    await user.keyboard('{ArrowRight}');
    expect(live()).toHaveTextContent('Lesson · 20 Aug');
    await user.keyboard('{ArrowLeft}');
    expect(live()).toHaveTextContent('Lesson · 14 Jul');
    expect(screen.getByTestId('chart-crosshair')).toBeInTheDocument();

    await user.keyboard('{End}');
    expect(live()).toHaveTextContent('Activity · 25 Sep. Grammar 68.');
    await user.keyboard('{Home}');
    expect(live()).toHaveTextContent('Lesson · 14 Jul');
    await user.keyboard('{Escape}');
    expect(live()).toHaveTextContent('');
    expect(screen.queryByTestId('chart-crosshair')).toBeNull();
  });

  it('the_table_lists_every_moment_with_its_source', async () => {
    const user = userEvent.setup();
    render(<CompetencyChartCard view={view} />);

    const toggle = screen.getByRole('button', { name: 'Show as table' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Hide table' })).toHaveAttribute('aria-expanded', 'true');
    const table = screen.getByRole('table', { name: 'Competency scores by measurement' });
    const rows = within(table).getAllByRole('row');
    // A header row, then the 4 lessons and the 1 activity in the fixture.
    expect(rows).toHaveLength(6);
    expect(within(rows[0]!).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Date',
      'Source',
      'Grammar',
      'Vocabulary',
      'Fluency',
      'Interaction',
      'Comprehension',
      'Pronunciation',
    ]);
    // The 14 Jul lesson measured neither Interaction nor Pronunciation.
    expect(within(rows[1]!).getAllByText('—')).toHaveLength(2);
    expect(within(rows[1]!).getByRole('link', { name: '14 Jul' })).toHaveAttribute(
      'href',
      '/lessons/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    );
    expect(within(rows[5]!).getByText('Activity')).toBeInTheDocument();
    expect(within(rows[5]!).queryByRole('link')).toBeNull();
  });

  it('renders_tokens_only', async () => {
    const user = userEvent.setup();
    const { container } = render(<CompetencyChartCard view={view} />);
    fireEvent.mouseMove(plotGroup(), { clientX: 300 });
    await user.click(screen.getByRole('button', { name: 'Show as table' }));

    for (const element of container.querySelectorAll('[style]')) {
      // The tooltip positions itself in percentages; nothing carries a colour or a pixel length.
      expect(element.getAttribute('style')).not.toMatch(/#[0-9a-f]{3,8}|\d(px|rem)\b|rgb/i);
    }
  });
});
