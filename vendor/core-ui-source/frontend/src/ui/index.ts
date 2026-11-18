/**
 * Barrel export for the UI primitive layer (Layer 1 in the FE Layering ADR).
 *
 * Patterns / templates / pages import primitives from here:
 *
 *   import { Text } from '@/ui';
 *   import { Text, type TextVariant } from '@/ui';
 *
 * NEVER import from `frontend/src/components/ui/` for new code — those
 * primitives are migrating into this directory phase by phase.
 *
 * See `.planning/ui-templating/adr-frontend-layering.md` for layer rules.
 */

export { DataTable } from './DataTable';
export type { DataTableProps, DataTableColumn, DataTableSort } from './DataTable';
export { Tabs } from './Tabs';
export type { TabsProps } from './Tabs';
export { LineChart } from './LineChart';
export type { LineChartProps, LineChartSeries } from './LineChart';
export { BridgeChart } from './BridgeChart';
export type { BridgeChartProps, BridgeStep } from './BridgeChart';
export { Progress } from './Progress';
export type { ProgressProps } from './Progress';
export { Stat } from './Stat';
export type { StatProps } from './Stat';
export { StatusBadge } from './StatusBadge';
export type { StatusBadgeTone } from './StatusBadge';

export { Text } from './Text';
export type { TextProps, TextVariant, TextTone, TextWeight } from './Text';

export { Surface } from './Surface';
export type {
  SurfaceProps,
  SurfaceTone,
  SurfaceBorder,
  SurfaceRadius,
  SurfaceElevation,
  SurfacePadding,
  SurfaceBackgroundOpacity,
} from './Surface';

export { Stack } from './Stack';
export type { StackProps, StackGap, StackAlign } from './Stack';

export { Inline } from './Inline';
export type {
  InlineProps,
  InlineGap,
  InlineAlign,
  InlineJustify,
} from './Inline';

export { IconButton } from './IconButton';
export type {
  IconButtonProps,
  IconButtonShape,
  IconButtonSize,
  IconButtonTone,
} from './IconButton';

export { LevelMeter } from './LevelMeter';
export type { LevelMeterProps } from './LevelMeter';

export { Input } from './Input';
export type { InputProps, InputSize } from './Input';

export { Textarea } from './Textarea';
export type { TextareaProps, TextareaSize } from './Textarea';

export { Select } from './Select';
export type { SelectProps, SelectSize } from './Select';
export { AppIcon, APP_ICONS } from './AppIcon';

export { TagChip } from './TagChip';
