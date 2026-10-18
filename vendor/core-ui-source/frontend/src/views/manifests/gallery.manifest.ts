import { lazy } from 'react';
const GalleryWidget = lazy(() =>
  import('../../components/views/GalleryWidget').then((module) => ({ default: module.GalleryWidget })),
);
import { LayoutGrid } from 'lucide-react';

import type { WidgetRegistration } from '../types';

const manifest: WidgetRegistration = {
  type: 'gallery',
  component: GalleryWidget,
  meta: {
    label: 'Gallery',
    icon: LayoutGrid,
    description: 'Visual content browsing with image grid and lightbox',
  },
};

export default manifest;

