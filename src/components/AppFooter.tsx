import { Link } from 'react-router-dom';
import logo from '@/assets/logo.png';

const AppFooter = () => {
  return (
    <footer className="bg-secondary/20 border-t border-border/30 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1 space-y-4">
            <Link to="/" className="inline-flex items-center gap-2">
              <img src={logo} alt="VidNest" className="h-7 w-7 object-contain" width={28} height={28} loading="lazy" />
              <span className="text-xl font-bold tracking-tight font-display text-primary">VidNest</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your ultimate destination for movies, TV shows, and anime streaming.
            </p>
          </div>

          <div>
            <h4 className="font-semibold font-display text-sm mb-4">Navigate</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/" className="hover:text-primary transition-colors">Home</Link></li>
              <li><Link to="/movies" className="hover:text-primary transition-colors">Movies</Link></li>
              <li><Link to="/tv-shows" className="hover:text-primary transition-colors">TV Shows</Link></li>
              <li><Link to="/anime" className="hover:text-primary transition-colors">Anime</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold font-display text-sm mb-4">Account</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/my-list" className="hover:text-primary transition-colors">My List</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold font-display text-sm mb-4">Legal</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-border/30 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} VidNest. All rights reserved.</p>
          <p>Powered by TMDB & Jikan API.</p>
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;
