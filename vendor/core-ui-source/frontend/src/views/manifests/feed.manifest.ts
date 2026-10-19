import { lazy } from 'react';
const FeedWidget = lazy(() =>
  import('../../components/views/FeedWidget').then((module) => ({ default: module.FeedWidget })),
);
import { LayoutList } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'feed',
  component: FeedWidget,
  meta: {
    label: 'Feed',
    icon: LayoutList,
    description: 'Reverse-chronological activity stream',
  },
};

export default manifest;

