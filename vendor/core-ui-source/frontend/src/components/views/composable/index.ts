/**
 * Eager imports for composable meta-widgets so they self-register at app
 * boot (matches the pattern used by ``views/index.ts`` for built-in
 * widgets).
 */

import './ComposableList';
import './ComposableBoard';
import './ComposableGrid';
import './ComposableTimeline';

export { ComposableList } from './ComposableList';
export { ComposableBoard } from './ComposableBoard';
export { ComposableGrid } from './ComposableGrid';
export { ComposableTimeline } from './ComposableTimeline';
