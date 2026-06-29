/**
 * Deterministic visual identity for a user.
 *
 * Colour and label are derived from the (stable) userId so that the same user
 * is rendered consistently across every client and across reconnections — even
 * if they reconnect to a different replica that never saw their original join.
 */

// A pleasant, high-contrast palette. 16 distinct hues is plenty for a workspace.
const PALETTE = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#84CC16', '#22C55E', '#10B981', '#14B8A6',
  '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
  '#A855F7', '#D946EF', '#EC4899', '#F43F5E',
];

const ADJECTIVES = [
  'Swift', 'Calm', 'Bright', 'Bold', 'Keen', 'Brave', 'Lucky', 'Clever',
  'Mellow', 'Nimble', 'Quiet', 'Sunny', 'Witty', 'Zesty', 'Cosmic', 'Royal',
];

const ANIMALS = [
  'Otter', 'Falcon', 'Panda', 'Tiger', 'Heron', 'Fox', 'Lynx', 'Koala',
  'Wolf', 'Raven', 'Bison', 'Hawk', 'Moose', 'Seal', 'Crane', 'Orca',
];

/** Small, fast, stable string hash (FNV-1a). */
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function colorFor(userId: string): string {
  return PALETTE[hash(userId) % PALETTE.length];
}

export function labelFor(userId: string): string {
  const h = hash(userId);
  const adjective = ADJECTIVES[h % ADJECTIVES.length];
  const animal = ANIMALS[(h >>> 4) % ANIMALS.length];
  return `${adjective} ${animal}`;
}
