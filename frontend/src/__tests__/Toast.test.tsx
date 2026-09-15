/**
 * Regression tests for the Toaster component's positioning and stacking
 * behavior — see CHANGELOG for the bugs these guard against:
 * - On viewports narrower than ~375px, `right-4` + `w-full` with no `left`
 *   offset overflowed the toast box off the left edge of the screen.
 * - A burst of distinct toasts (e.g. several WebSocket-pushed alerts firing
 *   back to back) stacked without limit, blanketing most of the screen.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Toaster, toast } from '../components/Toast';

describe('Toaster', () => {
  it('uses equal left/right margins on mobile and a right-anchored capped width from sm: up', () => {
    const { container } = render(<Toaster />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('left-4');
    expect(wrapper.className).toContain('right-4');
    expect(wrapper.className).toContain('sm:left-auto');
    expect(wrapper.className).toContain('max-w-sm');
  });

  it('caps the number of simultaneously visible toasts, keeping the most recent', () => {
    render(<Toaster />);
    act(() => {
      toast.success('one');
      toast.error('two');
      toast.warning('three');
      toast.info('four');
      toast.success('five');
      toast.error('six');
    });

    const messages = screen
      .getAllByText(/^(one|two|three|four|five|six)$/)
      .map(el => el.textContent);
    expect(messages).toEqual(['three', 'four', 'five', 'six']);
  });
});
