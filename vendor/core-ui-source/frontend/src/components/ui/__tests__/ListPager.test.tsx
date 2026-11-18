import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ListPager, pageWindow } from '../ListPager';

it('shows the range and total, and pages by number', () => {
  const onPageChange = vi.fn();
  render(<ListPager page={2} pageSize={25} total={986} onPageChange={onPageChange} onPageSizeChange={vi.fn()} />);
  expect(screen.getByText('26–50 of 986 records')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Next page'));
  expect(onPageChange).toHaveBeenCalledWith(3);
  fireEvent.click(screen.getByLabelText('Last page'));
  expect(onPageChange).toHaveBeenCalledWith(40);
  fireEvent.click(screen.getByLabelText('Previous page'));
  expect(onPageChange).toHaveBeenCalledWith(1);
});

it('disables first and previous on the first page, and changes the page size', () => {
  const onPageSizeChange = vi.fn();
  render(<ListPager page={1} pageSize={25} total={60} onPageChange={vi.fn()} onPageSizeChange={onPageSizeChange} />);
  expect((screen.getByLabelText('Previous page') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByLabelText('Page 1').getAttribute('aria-current')).toBe('page');
  fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '50' } });
  expect(onPageSizeChange).toHaveBeenCalledWith(50);
});

it('shows no page buttons for a single page and says when there is nothing', () => {
  const { rerender } = render(<ListPager page={1} pageSize={25} total={0} onPageChange={vi.fn()} />);
  expect(screen.getByText('No records')).toBeTruthy();
  rerender(<ListPager page={1} pageSize={25} total={10} onPageChange={vi.fn()} />);
  expect(screen.queryByLabelText('Next page')).toBeNull();
});

it('keeps a window of page numbers with gaps', () => {
  expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  expect(pageWindow(20, 40)).toEqual([1, null, 19, 20, 21, null, 40]);
  expect(pageWindow(1, 40)).toEqual([1, 2, 3, 4, null, 40]);
});
