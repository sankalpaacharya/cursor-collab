import { useEffect, useState } from 'react';
import {
  useCursors,
  Workspace,
  UserList,
  getStoredName,
  storeName,
  type ConnectionStatus,
} from './features/cursors';

// Read the initial room from the URL (?room=...) so sharing a link drops people
// into the same workspace; default to "lobby".
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

  // Persist the name and keep the URL shareable for the current room.
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
          <span className="dot" />
          Live Cursors
        </div>

        <div className="controls">
          <label className="field">
            Room
            <input value={room} readOnly title="Set ?room=NAME in the URL to change rooms" />
          </label>
          <label className="field">
            Name
            <input
              value={name}
              placeholder="auto"
              maxLength={32}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
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
