import Calendly from '@thesvg/react/calendly';
import Gmail from '@thesvg/react/gmail';
import Github from '@thesvg/react/github';
import GoogleDrive from '@thesvg/react/google-drive';
import GoogleSheets from '@thesvg/react/google-sheets';
import Notion from '@thesvg/react/notion';
import Quickbooks from '@thesvg/react/quickbooks';

import mcpIcon from '../../../assets/connectors/mcp.svg';
import { Text } from '../../../ui';

function BrandMark({ icon }: { icon: string }) {
  const className = 'h-8 w-8';
  switch (icon) {
    case 'gmail':
    case 'google_gmail':
      return <Gmail className={className} />;
    case 'google_drive':
      return <GoogleDrive className={className} />;
    case 'google_sheets':
      return <GoogleSheets className={className} />;
    case 'quickbooks':
    case 'quickbooks_mcp':
      return <Quickbooks className={className} />;
    case 'github':
    case 'github_issues':
      return <Github className={className} variant="mono" />;
    case 'calendly':
      return (
        <Text as="span" tone="default" className="inline-flex">
          <Calendly
            className={`${className} [.theme-dark_&]:text-white`}
            viewBox="185 62 480 480"
          />
        </Text>
      );
    case 'notion':
      return <Notion className={className} fill="#000" />;
    default:
      return (
        <img src={mcpIcon} alt="" width={32} height={32} className="h-8 w-8 object-contain" />
      );
  }
}

export function ConnectorBrandIcon({
  icon,
  label,
}: {
  icon: string;
  label: string;
}) {
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-input)] [&_title]:hidden"
      aria-hidden
      title={label}
    >
      <BrandMark icon={icon} />
    </span>
  );
}
