import { memo } from 'react';
import type { CursorUser } from '../types';

interface CursorProps {
  user: CursorUser;
  width: number;
  height: number;
}

/**
 * A single remote cursor: an arrow rendered in the user's colour with a name
 * pill. Positioned absolutely from normalised coordinates (0..1) scaled to the
 * workspace size. A CSS transition smooths motion between discrete updates.
 */
function CursorComponent({ user, width, height }: CursorProps) {
  const left = user.x * width;
  const top = user.y * height;

  return (
    <div className="cursor" style={{ transform: `translate(${left}px, ${top}px)` }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 3l14 7-6 2-2 6-6-15z"
          fill={user.color}
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className="cursor-label" style={{ background: user.color }}>
        {user.name}
      </span>
    </div>
  );
}

export const Cursor = memo(CursorComponent);
