import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Menu, X, User, Bookmark, Film, Tv, Play } from 'lucide-react';
import logo from '@/assets/logo.png';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      setIsMenuOpen(false);
      setSearchQuery('');
    }
  };

  const navItems = [
    { to: '/', label: 'Home', icon: Play },
    { to: '/movies', label: 'Movies', icon: Film },
    { to: '/tv-shows', label: 'TV Shows', icon: Tv },
    { to: '/anime', label: 'Anime', icon: Film },
    { to: '/my-list', label: 'My List', icon: Bookmark },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 bg-background/90 backdrop-blur-xl border-b border-border/30">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2 group">
            <img src={logo} alt="VidNest" className="h-8 w-8 object-contain" width={32} height={32} />
            <span className="text-2xl font-bold tracking-tight font-display text-primary">
              VidNest
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {navItems.map(item => (
              <Link key={item.to} to={item.to} className="text-sm font-medium text-foreground/70 hover:text-primary transition-colors">
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <form onSubmit={handleSearch} className="hidden md:relative md:block">
            <input
              type="text"
              placeholder="Search movies, shows, anime..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-secondary border border-border/50 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-64 transition-all placeholder:text-muted-foreground"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          </form>

          <div className="hidden md:flex items-center gap-2">
            <Link to="/my-list" className="p-2 hover:bg-secondary rounded-lg transition-colors text-foreground/70 hover:text-primary">
              <Bookmark size={18} />
            </Link>
          </div>

          <button
            className="md:hidden p-2 text-foreground/70"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden bg-background border-b border-border p-4 space-y-4">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg py-2.5 pl-9 pr-4 text-sm placeholder:text-muted-foreground"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          </form>
          <div className="flex flex-col gap-1">
            {navItems.map(item => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsMenuOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-secondary transition-colors flex items-center gap-3"
              >
                <item.icon size={16} className="text-primary" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
