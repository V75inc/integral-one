import { lazy } from 'react';
const TreeRegionWidget = lazy(() =>
  import('../../components/views/TreeRegionWidget').then((module) => ({ default: module.TreeRegionWidget })),
);
import { GitBranch } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'tree_region',
  component: TreeRegionWidget,
  meta: {
    label: 'Tree',
    icon: GitBranch,
    description: 'Hierarchical tree over a track’s entries via a self-relational parent field',
  },
  source: 'plugin',
  // Used both as a standalone track view (e.g. an HR org chart) and
  // referenced from related_views[] — see the backend ViewTypeSpec's own
  // scope="both" comment (region_system/__init__.py).
  scope: 'both',
};

export default manifest;
