import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CursorMagicSelection02Icon,
  UserCircleIcon,
} from '@hugeicons/core-free-icons';
import {
  useCursors,
  Workspace,
  UserList,
  getStoredName,
  storeName,
  type ConnectionStatus,
} from './features/cursors';

function initialRoom(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('room');
  return (fromUrl ?? 'lobby').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'lobby';
}

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Error',
};

export default function App() {
  const [room] = useState(initialRoom);
  const [name, setName] = useState(getStoredName);

  const { self, peers, status, sendMove } = useCursors(room, name);

  useEffect(() => storeName(name), [name]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', room);
    window.history.replaceState({}, '', url);
  }, [room]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <HugeiconsIcon
            className="brand-icon"
            icon={CursorMagicSelection02Icon}
            size={22}
            strokeWidth={2}
          />
          Cursor Collab
        </div>

        <div className="controls">
          <div className="field">
            <HugeiconsIcon icon={UserCircleIcon} size={16} strokeWidth={2} />
            <input
              value={name}
              placeholder="Your name"
              aria-label="Your name"
              maxLength={32}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <span className={`status status-${status}`}>
            <span className="status-dot" />
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>
      </header>

      <main className="main">
        <Workspace peers={peers} onMove={sendMove} />
        <UserList self={self} peers={peers} />
      </main>
    </div>
  );
}
