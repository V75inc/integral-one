import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExperienceMode } from '../ExperienceMode';
import { SeamlessField } from '../SeamlessField';

afterEach(cleanup);
it('reveals optional details without clearing edits or hiding required and populated fields', () => {
  function Form() {
    const [value, setValue] = useState('');
    return (
      <ExperienceMode>
        <SeamlessField
          field={{
            key: 'extra',
            name: 'Extra detail',
            type: 'text',
            validation: { advanced: true },
          }}
          value={value}
          onChange={(next) => setValue(String(next))}
        />
        <SeamlessField
          field={{
            key: 'required',
            name: 'Required detail',
            type: 'text',
            required: true,
            validation: { advanced: true },
          }}
          value=""
          onChange={() => {}}
        />
      </ExperienceMode>
    );
  }
  render(<Form />);
  expect(screen.queryByLabelText('Extra detail')).toBeNull();
  expect(screen.getByLabelText('Required detail (required)')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
  fireEvent.change(screen.getByLabelText('Extra detail'), {
    target: { value: 'Keep this value' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Simple' }));
  expect(screen.getByLabelText('Extra detail')).toHaveValue('Keep this value');
});
