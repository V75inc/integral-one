import { Link } from 'react-router-dom';
import { Surface, Text } from '../../ui';

/** A restricted read is not an empty workspace or an exhaustive negative search. */
export function RecordReadBoundaryNotice({
  appId,
  searching = false,
}: {
  appId?: string;
  searching?: boolean;
}) {
  return (
    <Surface padding="md" className="my-4" role="status" aria-label="App record coverage">
      <Text as="h2" variant="heading-sm">Find App records in their App</Text>
      <Text as="p" variant="body-sm" tone="muted" className="mt-2">
        {searching
          ? 'This search does not include records managed inside Apps. Open an App, or ask Integral to find them.'
          : 'Records managed inside Apps are not included here. Open an App, or ask Integral to find them.'}
      </Text>
      <Link
        to={appId ? `/apps/${encodeURIComponent(appId)}` : '/apps'}
        className="mt-3 inline-flex underline underline-offset-4"
      >
        <Text as="span" variant="label" tone="brand">{appId ? 'Open App' : 'Open Apps'}</Text>
      </Link>
    </Surface>
  );
}
