import { Input, Surface, Text } from '../../ui';
import { Button } from '../ui';
import { Filter, Search, X } from 'lucide-react';
import { DatePicker } from '../ui/DatePicker';
import { LINE_ICON_STROKE } from '../ui/IconWell';

export interface CalendarFilterStripProps {
  search: string;
  setSearch: (query: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
}

export function CalendarFilterStrip({
  search,
  setSearch,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: CalendarFilterStripProps) {
  const dateFilterActive = Boolean(dateFrom || dateTo);
  const anyActive = Boolean(search.trim() || dateFilterActive);

  const clearAll = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <Surface tone="panel" border="none" radius="none" className="flex flex-col gap-2 border-b border-[var(--panel-border)] px-3 md:px-4 py-2 md:py-2.5">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <div className="relative flex-1 min-w-[10rem]">
          <Search
            size={14}
            strokeWidth={LINE_ICON_STROKE}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-60"
            aria-hidden
          />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search entries…"
            aria-label="Search calendar entries"
            className="pl-9"
          />
        </div>

        <Text variant="meta" tone="muted" className="flex items-center gap-1.5 shrink-0">
          <Filter size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
          <span className="hidden sm:inline">Date range</span>
        </Text>

        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <DatePicker
            mode="date"
            value={dateFrom}
            onChange={setDateFrom}
            placeholder="From"
            aria-label="Filter from date"
            variant="field"
            className="min-w-[8.5rem] max-w-[10rem]"
          />
          <span className="text-xs opacity-60" aria-hidden>
            –
          </span>
          <DatePicker
            mode="date"
            value={dateTo}
            onChange={setDateTo}
            placeholder="To"
            aria-label="Filter to date"
            variant="field"
            className="min-w-[8.5rem] max-w-[10rem]"
          />
        </div>

        {anyActive ? (
          <Button variant="ghost" size="sm"
            type="button"
            onClick={clearAll}
            aria-label="Clear calendar filters"
            className="
              inline-flex items-center gap-1 text-sm shrink-0
              opacity-60
              hover:opacity-100
              transition-colors duration-fast
            "
          >
            <X size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>
    </Surface>
  );
}
