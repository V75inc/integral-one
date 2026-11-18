/** Tabs — a short strip that switches the section below it, drawn like Core's view tabs. Layer: Primitive. */
import type { ReactNode } from 'react';
import { ViewTabs } from '../components/ui/ViewTabs';

export interface TabsProps {
  options: { value: string; label: ReactNode; count?: number | null }[];
  value: string;
  onChange: (value: string) => void;
  /** Names the strip for assistive technology. */
  ariaLabel?: string;
}

export function Tabs({ options, value, onChange, ariaLabel }: TabsProps) {
  return <ViewTabs options={options} value={value} onChange={onChange} ariaLabel={ariaLabel} />;
}
