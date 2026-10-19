import { Text, type TextProps } from '../../ui';

export interface PageMetaProps
  extends Pick<TextProps, 'children' | 'className' | 'id' | 'title' | 'data-testid'> {
  as?: 'div' | 'p';
}

/** Secondary information beneath a title, using the shared 14px/20px scale. */
export function PageMeta({ as = 'div', className = '', ...props }: PageMetaProps) {
  return (
    <Text
      as={as}
      variant="subtitle"
      tone="muted"
      className={`page-meta mt-3 md:mt-3.5 ${as === 'div' ? 'flex flex-wrap items-center gap-x-4 md:gap-x-6 gap-y-2' : 'max-w-2xl'} ${className}`}
      {...props}
    />
  );
}
