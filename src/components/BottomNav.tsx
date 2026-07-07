import { NavLink, useLocation } from 'react-router-dom';
import { Home, Film, Tv, Sparkles, Bookmark, Search, Download, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/tv-shows', label: 'TV', icon: Tv },
  { to: '/anime', label: 'Anime', icon: Sparkles },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/my-list', label: 'List', icon: Bookmark },
  { to: '/downloads', label: 'Saved', icon: Download },
  { to: '/settings', label: 'More', icon: SettingsIcon },
];

const BottomNav = () => {
  const location = useLocation();
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 w-[min(96vw,640px)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-between gap-1 rounded-full border border-primary/25 bg-background/70 backdrop-blur-xl px-2 py-2 shadow-[0_8px_40px_hsl(0_0%_0%/0.6)]">
        {items.map(({ to, label, icon: Icon, end }) => {
          const active = end ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={cn(
                'group relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 px-1 transition-all',
                active
                  ? 'bg-gold-gradient text-primary-foreground shadow-[var(--shadow-gold)]'
                  : 'text-muted-foreground hover:text-primary'
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              <span className={cn(
                'text-[10px] font-semibold tracking-wider uppercase',
                active ? 'opacity-100' : 'opacity-70'
              )}>
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
