import {createRef} from 'react';
import {render, screen} from '@testing-library/react';
import {expect, it} from 'vitest';
import {Button} from './Button';
it('exposes the native button for SDK focus management while preserving disabled state', () => {
  const ref = createRef<HTMLButtonElement>();
  const view = render(<Button ref={ref}>Continue</Button>);
  ref.current!.focus();
  expect(screen.getByRole('button', {name: 'Continue'})).toHaveFocus();
  view.rerender(<Button ref={ref} loading>Continue</Button>);
  expect(ref.current).toBeDisabled();
});
