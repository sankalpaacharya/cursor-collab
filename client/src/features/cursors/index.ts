// Public surface of the cursors feature. App-level code imports from here
// rather than reaching into individual files.
export { useCursors } from './use-cursors';
export { Workspace } from './components/workspace';
export { UserList } from './components/user-list';
export { getStoredName, storeName } from './identity';
export type { CursorUser, ConnectionStatus } from './types';
