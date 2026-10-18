import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModalRegionWidget } from '../ModalRegionWidget';
import type { ViewWidgetProps } from '../types';

const viewProps = {
  view: {
    id: 'view-1',
    track_id: 'track-1',
    config: {
      trigger_label: 'Open chart',
      title: 'Chart details',
      regions: [],
    },
  },
  entries: [],
  isLoading: false,
} as unknown as ViewWidgetProps;

describe('ModalRegionWidget', () => {
  it('uses the shared padded Modal.Body for chart and other modal regions', () => {
    render(<ModalRegionWidget {...viewProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open chart' }));

    const dialog = screen.getByRole('dialog', { name: 'Chart details' });
    const body = dialog.querySelector('div.px-5');
    expect(body).toHaveClass('px-5', 'sm:px-6', 'py-5', 'space-y-4');
  });
});
