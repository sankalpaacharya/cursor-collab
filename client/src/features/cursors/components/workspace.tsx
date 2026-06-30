import { useEffect, useRef, useState, useCallback } from 'react';
import { Cursor } from './cursor';
import type { CursorUser } from '../types';

interface WorkspaceProps {
  peers: CursorUser[];
  onMove: (x: number, y: number) => void;
}

export function Workspace({ peers, onMove }: WorkspaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

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
