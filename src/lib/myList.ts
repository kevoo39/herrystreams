const STORAGE_KEY = 'vidnest-my-list';

export interface ListItem {
  id: string;
  title: string;
  image: string;
  type: 'movie' | 'tv' | 'anime';
  addedAt: string;
}

export function getMyList(): ListItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addToMyList(item: ListItem): void {
  const list = getMyList();
  if (!list.some(i => i.id === item.id)) {
    list.unshift(item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}

export function removeFromMyList(id: string): void {
  const list = getMyList().filter(i => i.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function isInMyList(id: string): boolean {
  return getMyList().some(i => i.id === id);
}
