import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LessonHeader } from '@/components/lessons/lesson-header';
import { ResultArea } from '@/components/lessons/result/result-area';
import { ScenarioArea } from '@/components/lessons/scenario-area';
import { StatusArea } from '@/components/lessons/status/status-area';
import { TranscriptView } from '@/components/lessons/transcript/transcript-view';

import {
  assessedPronunciation,
  detail,
  LESSON_ID,
  ok,
  pipelineView,
  readyAnalysis,
  recordingView,
  scenarioView,
  transcriptView,
} from './fixtures/lessons';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => `/lessons/${LESSON_ID}`,
}));

afterEach(() => {
  cleanup();
});

describe('lesson detail', () => {
  it('no_tab_renders_an_audio_control', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <LessonHeader lesson={detail()} />
        <ResultArea lesson={detail()} analysis={ok(readyAnalysis())} pronunciation={ok(assessedPronunciation())} pipeline={ok(pipelineView())} />
        <ScenarioArea view={scenarioView()} />
        <TranscriptView view={transcriptView()} />
        <StatusArea lesson={detail()} pipeline={ok(pipelineView())} recording={ok(recordingView())} />
      </div>,
    );
    // Expand every excerpt badge too, so its detail is checked as well.
    for (const badge of screen.getAllByRole('button', { name: /Pronunciation score/ })) {
      await user.click(badge);
    }

    expect(container.querySelector('audio, video')).toBeNull();
    for (const role of ['button', 'link'] as const) {
      for (const control of screen.queryAllByRole(role)) {
        expect(control.textContent ?? '').not.toMatch(/\b(play|listen|audio|replay|download)\b/i);
      }
    }
    expect(container.textContent).not.toMatch(/\.ogg|play recording|listen to/i);
  });
});
