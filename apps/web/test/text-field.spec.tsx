import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TextField } from '@/components/ui';

describe('TextField', () => {
  it('renders_the_leading_icon_without_announcing_it', () => {
    const { container } = render(
      <TextField label="Email" leadingIcon={<svg data-testid="leading-icon" aria-hidden="true" />} />,
    );

    const icon = container.querySelector('[data-testid="leading-icon"]');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('label_aside_renders_in_the_label_row', () => {
    render(<TextField label="Email" labelAside={<span>e.g. learner@quest.io</span>} />);

    expect(screen.getByText('e.g. learner@quest.io')).toBeInTheDocument();
  });

  it('reveal_toggles_the_control_type_and_its_pressed_state', async () => {
    render(<TextField label="Password" type="password" revealable />);

    const input = screen.getByLabelText('Password') as HTMLInputElement;
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(input.type).toBe('password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);

    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('reveal_is_absent_unless_requested', () => {
    render(<TextField label="Region" />);

    expect(screen.queryByRole('button', { name: /show|hide/i })).toBeNull();
  });

  it('read_only_presentation_is_not_editable', () => {
    render(<TextField label="Key" defaultValue="••••f4Qa" readOnlyPresentation revealable />);

    const input = screen.getByLabelText('Key') as HTMLInputElement;
    expect(input).toHaveAttribute('readonly');
    // revealable is ignored when readOnlyPresentation is set.
    expect(screen.queryByRole('button', { name: /show|hide/i })).toBeNull();
  });

  it('error_and_hint_wiring_survives_the_composition', () => {
    render(<TextField label="Email" hint="We never share this." error="Required." />);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('We never share this.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Required.');
    expect(input.getAttribute('aria-describedby')).toContain(
      screen.getByText('We never share this.').id,
    );
  });
});
