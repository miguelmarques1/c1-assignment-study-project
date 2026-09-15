import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Badge } from '@/components/ui/badge';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Grid } from '@/components/ui/grid';
import { Meter } from '@/components/ui/meter';
import { Stack } from '@/components/ui/stack';

afterEach(() => {
  cleanup();
});

describe('Button', () => {
  const VARIANTS: NonNullable<ButtonProps['variant']>[] = ['primary', 'secondary', 'neutral', 'destructive'];
  const SIZES: NonNullable<ButtonProps['size']>[] = ['sm', 'md', 'lg'];

  it('button_renders_each_variant_and_size', () => {
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        cleanup();
        render(
          <Button variant={variant} size={size}>
            {variant}-{size}
          </Button>,
        );
        expect(screen.getByRole('button', { name: `${variant}-${size}` })).toBeInTheDocument();
      }
    }
  });

  it('button_is_disabled_and_announces_while_loading', () => {
    render(
      <Button loading loadingLabel="Saving…">
        Save
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('an_icon_only_button_without_a_label_fails_typecheck', () => {
    function Fixture() {
      // @ts-expect-error Button requires either children or an aria-label
      return <Button variant="neutral" />;
    }
    expect(Fixture).toBeDefined();
  });

  it('every_interactive_primitive_is_reachable_by_keyboard', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continue</Button>);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('every_interactive_primitive_shows_a_token_focus_ring', () => {
    render(<Button>Continue</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toMatch(/focus-visible:outline-2/);
    expect(button.className).toMatch(/outline-outline-strong/);
  });
});

describe('Badge', () => {
  it('badge_always_renders_text_alongside_its_colour', () => {
    for (const status of ['success', 'warning', 'info', 'danger', 'neutral'] as const) {
      cleanup();
      render(<Badge status={status}>{status}</Badge>);
      expect(screen.getByText(status)).toBeInTheDocument();
    }
  });
});

describe('Meter', () => {
  it('meter_exposes_its_value_to_assistive_technology', () => {
    render(<Meter label="Grammar" value={72} />);
    const meter = screen.getByRole('meter', { name: 'Grammar' });
    expect(meter).toHaveAttribute('aria-valuenow', '72');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
  });

  it('meter_in_warming_up_renders_copy_instead_of_a_number', () => {
    render(<Meter label="Fluency" value={null} state="warming-up" />);
    expect(screen.getAllByText('Warming up').length).toBeGreaterThan(0);
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('meter_delta_states_its_direction_in_text', () => {
    const { container: up } = render(<Meter label="Vocabulary" value={58} delta={4} />);
    expect(up.textContent).toContain('+4');

    cleanup();
    const { container: down } = render(<Meter label="Pronunciation" value={41} delta={-3} />);
    expect(down.textContent).toContain('-3');
  });
});

describe('Field', () => {
  it('field_wires_label_hint_and_error_to_the_control', () => {
    render(
      <Field label="Email" hint="We never share it" error="Required">
        {(props) => <input {...props} type="email" />}
      </Field>,
    );

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    for (const id of describedBy!.split(' ')) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(screen.getByText('We never share it')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });
});

describe('Chip', () => {
  it('chip_removal_control_has_an_accessible_name_including_the_label', () => {
    render(
      <Chip tone="accent" onRemove={() => undefined}>
        Past tense
      </Chip>,
    );
    expect(screen.getByRole('button', { name: 'Remove Past tense' })).toBeInTheDocument();
  });
});

describe('Stack and Grid', () => {
  it('stack_and_grid_only_accept_token_spacing', () => {
    function Fixture() {
      return (
        <>
          {/* @ts-expect-error gap must be a SpacingToken, not an arbitrary number */}
          <Stack gap={13}>content</Stack>
          {/* @ts-expect-error gap must be a SpacingToken, not an arbitrary number */}
          <Grid gap={13}>content</Grid>
        </>
      );
    }
    expect(Fixture).toBeDefined();
  });

  it('grid_renders_its_children_within_a_grid_container', () => {
    render(
      <Grid columns={4}>
        <div>one</div>
        <div>two</div>
      </Grid>,
    );
    expect(screen.getByText('one').parentElement?.className).toMatch(/grid/);
  });
});
