const STORAGE_KEY = 'kevnest-my-list';

export interface ListItem {
  id: string;
  title: string;
  image: string;
  type: 'movie' | 'tv' | 'anime';
  addedAt: string;
}

export function getMyList(): ListItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      // Migrate old key
      const old = localStorage.getItem('vidnest-my-list');
      if (old) {
        localStorage.setItem(STORAGE_KEY, old);
        localStorage.removeItem('vidnest-my-list');
        return JSON.parse(old);
      }
    }
    return data ? JSON.parse(data) : [];
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