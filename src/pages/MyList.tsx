import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import AppFooter from '@/components/AppFooter';
import { getMyList, removeFromMyList, ListItem } from '@/lib/myList';
import { Play, Trash2, Bookmark } from 'lucide-react';
import { motion } from 'framer-motion';

const MyList = () => {
  const navigate = useNavigate();
  const [list, setList] = useState<ListItem[]>(getMyList());

  const handleRemove = (id: string) => {
    removeFromMyList(id);
    setList(getMyList());
  };

  const handleClick = (item: ListItem) => {
    if (item.type === 'movie') navigate(`/movie/${item.id.replace('movie-', '')}`);
    else if (item.type === 'tv') navigate(`/tv/${item.id.replace('tv-', '')}`);
    else if (item.type === 'anime') navigate(`/anime/${item.id.replace('anime-', '')}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-20 max-w-7xl mx-auto px-4 md:px-6">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold font-display mb-2">My List</h1>
          <p className="text-sm text-muted-foreground">Your saved movies, shows, and anime.</p>
        </div>

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
              <Bookmark size={28} className="text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold font-display mb-2">Your list is empty</h2>
            <p className="text-sm text-muted-foreground">Add movies and shows to your list to watch later.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {list.map(item => (
              <motion.div key={item.id} whileHover={{ y: -4 }} className="group relative">
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-secondary cursor-pointer" onClick={() => handleClick(item)}>
                  <img src={item.image} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors flex items-center justify-center">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all">
                      <Play className="text-primary-foreground fill-current ml-0.5" size={18} />
                    </div>
                  </div>
                  <div className="absolute bottom-2 left-2">
                    <span className="px-1.5 py-0.5 bg-primary/80 text-primary-foreground text-[9px] font-bold rounded uppercase">{item.type}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <h3 className="text-xs font-semibold line-clamp-1 flex-1 group-hover:text-primary transition-colors">{item.title}</h3>
                  <button onClick={() => handleRemove(item.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  );
};

export default MyList;
