import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { BACKLINKS_OPEN_LIMIT, BacklinkList } from '../BacklinkList';

const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    title: `Payslip ${i}`,
    track_id: 't1',
    track_title: 'Payslips',
  }));

afterEach(cleanup);

describe('BacklinkList', () => {
  it('shows a short list open', () => {
    render(
      <MemoryRouter>
        <BacklinkList refs={refs(BACKLINKS_OPEN_LIMIT)} label="Referenced by" />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('backlinks-collapsed')).toBeNull();
    expect(screen.getByText('Payslip 0')).toBeVisible();
    expect(screen.getByText(`Referenced by (${BACKLINKS_OPEN_LIMIT})`)).toBeVisible();
  });

  it('keeps a long list closed behind its heading', () => {
    render(
      <MemoryRouter>
        <BacklinkList refs={refs(22)} label="Referenced by" />
      </MemoryRouter>
    );
    const box = screen.getByTestId('backlinks-collapsed') as HTMLDetailsElement;
    expect(box.open).toBe(false);
    expect(screen.getByText('Referenced by (22)')).toBeInTheDocument();
  });

  it('says how many are shown when the server list is capped', () => {
    render(
      <MemoryRouter>
        <BacklinkList refs={refs(3)} label="Referenced by" total={40} />
      </MemoryRouter>
    );
    expect(screen.getByText('Referenced by (40; showing 3)')).toBeVisible();
  });
});
