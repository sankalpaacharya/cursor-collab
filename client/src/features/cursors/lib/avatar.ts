const STYLE = 'notionists';

export function avatarUrl(seed: string): string {
  const params = new URLSearchParams({ seed, radius: '50' });
  return `https://api.dicebear.com/9.x/${STYLE}/svg?${params.toString()}`;
}
