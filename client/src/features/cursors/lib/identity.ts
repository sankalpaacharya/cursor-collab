
const USER_ID_KEY = 'cursor:userId';
const NAME_KEY = 'cursor:name';

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return Math.random().toString(36).slice(2, 18);
}

export function getUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = `u-${randomId()}`;
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function getStoredName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}

export function storeName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}
