import type { CursorUser } from '../types';

interface UserListProps {
  self: CursorUser | null;
  peers: CursorUser[];
}

export function UserList({ self, peers }: UserListProps) {
  const everyone = [self, ...peers].filter(Boolean) as CursorUser[];

  return (
    <div className="userlist">
      <h2>
        In this room <span className="count">{everyone.length}</span>
      </h2>
      <ul>
        {everyone.map((u) => (
          <li key={u.id}>
            <span className="swatch" style={{ background: u.color }} />
            <span className="uname">
              {u.name}
              {self && u.id === self.id ? ' (you)' : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
