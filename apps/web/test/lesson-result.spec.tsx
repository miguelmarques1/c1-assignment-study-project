import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResultArea } from '@/components/lessons/result/result-area';

import {
  assessedPronunciation,
  detail,
  failed,
  LESSON_ID,
  ok,
  pipelineView,
  readyAnalysis,
  U1,
  U3,
} from './fixtures/lessons';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => `/lessons/${LESSON_ID}`,
}));

afterEach(() => {
  cleanup();
});

function renderReady() {
  return render(
    <ResultArea
      lesson={detail()}
      analysis={ok(readyAnalysis())}
      pronunciation={ok(assessedPronunciation())}
      pipeline={ok(pipelineView())}
    />,
  );
}

describe('result area', () => {
  it('renders_six_meters_with_deltas_and_a_dash_on_the_first_lesson', () => {
    renderReady();
    const scores = screen.getByRole('region', { name: 'Your scores' });

    for (const label of ['Grammar', 'Vocabulary', 'Fluency', 'Interaction', 'Comprehension', 'Pronunciation']) {
      expect(within(scores).getByRole('meter', { name: label })).toBeInTheDocument();
    }
    expect(within(scores).getAllByRole('meter')).toHaveLength(6);
    expect(scores).toHaveTextContent('▲ +4');
    expect(scores).toHaveTextContent('▼ −2');
    // Interaction has no previous result.
    expect(within(scores).getByText('—')).toBeInTheDocument();
    expect(within(scores).getByRole('meter', { name: 'Pronunciation' })).toHaveAttribute('aria-valuenow', '78');
    expect(within(scores).getByText('Mostly accurate tenses.')).toBeInTheDocument();
  });

  it('groups_errors_by_severity_with_quote_correction_explanation_and_tag', () => {
    renderReady();
    const errors = screen.getByRole('region', { name: 'Errors to work on' });

    const headings = within(errors).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['Major (1)', 'Moderate (1)', 'Minor (1)']);

    const major = within(errors).getByRole('list', { name: 'Major errors' });
    expect(major).toHaveTextContent('“if I would have known, I would have booked earlier”');
    const emphasized = within(major).getByText('had');
    expect(emphasized.tagName).toBe('STRONG');
    expect(within(major).getByText('The third conditional takes the past perfect after "if".')).toBeInTheDocument();
    expect(within(major).getByText('Third conditional')).toBeInTheDocument();
    // Unchanged spans are not emphasized.
    expect(within(major).getByText('if I').tagName).not.toBe('STRONG');
  });

  it('a_recurring_tag_shows_its_count_badge', () => {
    renderReady();
    const major = screen.getByRole('list', { name: 'Major errors' });
    expect(within(major).getByText('4th time')).toBeInTheDocument();
    const minor = screen.getByRole('list', { name: 'Minor errors' });
    expect(within(minor).queryByText(/time$/)).toBeNull();
  });

  it('a_tag_chip_opens_its_ledger_record', () => {
    renderReady();
    const major = screen.getByRole('list', { name: 'Major errors' });
    // F12's `/profile?tag=` resolves the tag and opens its record (A14).
    expect(within(major).getByRole('link', { name: 'Third conditional: open in your error ledger' })).toHaveAttribute(
      'href',
      '/profile?tag=grammar%3Aconditional-3',
    );
  });

  it('scenario_fit_lists_used_and_not_used_expressions', () => {
    renderReady();
    const fit = screen.getByRole('region', { name: 'Scenario fit' });
    expect(within(within(fit).getByRole('list', { name: 'Used' })).getAllByRole('listitem')).toHaveLength(1);
    expect(within(within(fit).getByRole('list', { name: 'Not used' })).getAllByRole('listitem')).toHaveLength(2);
    expect(fit).toHaveTextContent('Expected: Neutral register');
    expect(within(fit).getByText('Register matched')).toBeInTheDocument();
    expect(fit).toHaveTextContent('You played The Traveler.');
  });

  it('recurring_tags_and_topics_render_with_labels', () => {
    renderReady();
    const recurring = screen.getByRole('region', { name: 'Recurring' });
    expect(within(recurring).getByText('Third conditional')).toBeInTheDocument();
    // No error explains this tag, so its id is shown rather than an invented label.
    expect(within(recurring).getByText('discourse:hedging')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Topics to practice' })).getAllByRole('listitem')).toHaveLength(3);
    expect(within(screen.getByRole('region', { name: 'Strengths' })).getAllByRole('listitem')).toHaveLength(3);
  });

  it('pronunciation_and_transcript_render_while_analysis_is_blocked', () => {
    render(
      <ResultArea
        lesson={detail({
          status: 'blocked',
          activeStage: 'lesson_analysis',
          statusReason: 'Blocked — add your Gemini key to analyze this lesson.',
          headline: null,
        })}
        analysis={ok({ lessonId: LESSON_ID, status: 'pending', analysis: null })}
        pronunciation={ok(assessedPronunciation())}
        pipeline={ok(pipelineView())}
      />,
    );
    const panel = screen.getByRole('region', { name: 'Result status' });
    expect(panel).toHaveTextContent('Blocked — add your Gemini key to analyze this lesson.');
    expect(within(panel).getByRole('link', { name: 'Open settings' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('region', { name: 'Your scores' })).toBeNull();
    const pronunciation = screen.getByRole('region', { name: 'Pronunciation' });
    expect(within(pronunciation).getAllByRole('meter').length).toBeGreaterThan(0);
    expect(within(pronunciation).getByText('Not measured')).toBeInTheDocument();
  });

  it('the_status_panel_covers_pending_failed_and_unavailable', () => {
    render(
      <ResultArea
        lesson={detail({ status: 'processing', activeStage: 'pronunciation_assessment', headline: null })}
        analysis={ok({ lessonId: LESSON_ID, status: 'pending', analysis: null })}
        pronunciation={ok({ lessonId: LESSON_ID, status: 'pending', result: null, excerpts: [] })}
        pipeline={ok(pipelineView())}
      />,
    );
    let panel = screen.getByRole('region', { name: 'Result status' });
    expect(panel).toHaveTextContent('Now: Assessing pronunciation');
    expect(within(panel).getByRole('link', { name: 'See processing status' })).toHaveAttribute('href', `/lessons/${LESSON_ID}/status`);
    cleanup();

    render(
      <ResultArea
        lesson={detail({ status: 'failed', activeStage: 'lesson_analysis', statusReason: 'The analysis came back malformed twice.', headline: null })}
        analysis={ok({ lessonId: LESSON_ID, status: 'failed', analysis: null })}
        pronunciation={ok(assessedPronunciation())}
        pipeline={ok(pipelineView())}
      />,
    );
    panel = screen.getByRole('region', { name: 'Result status' });
    expect(panel).toHaveTextContent('The analysis came back malformed twice.');
    expect(within(panel).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    cleanup();

    render(
      <ResultArea
        lesson={detail({ status: 'too_short', statusReason: 'Too short to analyze (minimum 3 minutes)', headline: null })}
        analysis={ok({ lessonId: LESSON_ID, status: 'unavailable', analysis: null })}
        pronunciation={ok({ lessonId: LESSON_ID, status: 'unavailable', result: null, excerpts: [] })}
        pipeline={ok({ lessonId: LESSON_ID, serverTime: '2026-09-24T15:10:00.000Z', branch: null })}
      />,
    );
    panel = screen.getByRole('region', { name: 'Result status' });
    expect(panel).toHaveTextContent('Too short to analyze (minimum 3 minutes)');
    expect(within(panel).queryByRole('button')).toBeNull();
  });

  it('worst_words_and_errors_link_to_the_transcript', () => {
    renderReady();
    expect(screen.getAllByRole('link', { name: 'See in transcript' }).map((link) => link.getAttribute('href'))).toEqual([
      `/lessons/${LESSON_ID}/transcript#u-${U1}`,
      `/lessons/${LESSON_ID}/transcript#u-${U3}`,
    ]);
    expect(screen.getByRole('link', { name: /postponed/ })).toHaveAttribute('href', `/lessons/${LESSON_ID}/transcript#u-${U3}`);
  });

  it('one_area_failing_leaves_the_rest_usable', () => {
    render(
      <ResultArea lesson={detail()} analysis={failed} pronunciation={ok(assessedPronunciation())} pipeline={ok(pipelineView())} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('We could not load your result.');
    expect(screen.getByRole('region', { name: 'Pronunciation' })).toBeInTheDocument();
  });
});
