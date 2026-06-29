import { useEffect, useRef, useState, useCallback } from 'react';
import { Cursor } from './cursor';
import type { CursorUser } from '../types';

interface WorkspaceProps {
  peers: CursorUser[];
  onMove: (x: number, y: number) => void;
}

/**
 * The shared canvas. Tracks the local pointer, converts it to normalised
 * coordinates relative to its own bounds, and reports it via `onMove`. Renders
 * every peer cursor on top.
 *
 * Coordinates are normalised (0..1) so that participants with different window
 * sizes still see each other's cursors at the same *relative* location.
 */
export function Workspace({ peers, onMove }: WorkspaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Track the element size so we can scale normalised peer coordinates to px.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (): void => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = ref.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      onMove(x, y);
    },
    [onMove],
  );

  return (
    <div ref={ref} className="workspace" onPointerMove={handlePointerMove}>
      <div className="workspace-hint">
        Move your mouse — everyone in this room sees your cursor in real time.
      </div>
      {peers.map((p) => (
        <Cursor key={p.id} user={p} width={size.width} height={size.height} />
      ))}
    </div>
  );
}
