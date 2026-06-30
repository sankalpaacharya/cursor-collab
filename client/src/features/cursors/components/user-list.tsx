import { HugeiconsIcon } from '@hugeicons/react';
import { UserMultiple02Icon } from '@hugeicons/core-free-icons';
import type { CursorUser } from '../types';
import { avatarUrl } from '../lib/avatar';

interface UserListProps {
  self: CursorUser | null;
  peers: CursorUser[];
}

export function UserList({ self, peers }: UserListProps) {
  const everyone = [self, ...peers].filter(Boolean) as CursorUser[];

  return (
    <div className="userlist">
      <h2>
        <HugeiconsIcon icon={UserMultiple02Icon} size={16} strokeWidth={2} />
        In this room
        <span className="count">{everyone.length}</span>
      </h2>
      <ul>
        {everyone.map((u) => {
          const isSelf = !!self && u.id === self.id;
          return (
            <li key={u.id} className={isSelf ? 'is-self' : undefined}>
              <img className="avatar" src={avatarUrl(u.id)} alt="" style={{ borderColor: u.color }} />
              <span className="uname">
                {u.name}
                {isSelf && <span className="you"> (you)</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
