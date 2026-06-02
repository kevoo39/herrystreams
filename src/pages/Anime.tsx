import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import AnimeRow from '@/components/AnimeRow';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Play, Plus } from 'lucide-react';

const AnimeHero = ({ anime }: { anime: any }) => {
  if (!anime) return <div className="h-[70vh] bg-secondary animate-pulse" />;

  return (
    <section className="relative h-[75vh] w-full overflow-hidden">
      <div className="absolute inset-0">
        <img src={anime.images?.webp?.large_image_url} alt={anime.title} className="w-full h-full object-cover object-top scale-105 opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
      </div>
      <div className="relative h-full max-w-7xl mx-auto px-4 md:px-6 flex flex-col justify-end pb-24">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-xl space-y-5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-primary text-primary-foreground text-[10px] font-bold rounded uppercase tracking-wider">Trending</span>
            <span className="text-xs font-medium text-muted-foreground">{anime.type}</span>
            {anime.episodes && <span className="text-xs font-medium text-muted-foreground">• {anime.episodes} Episodes</span>}
          </div>
          <h1 className="text-4xl md:text-6xl font-bold font-display leading-[1.1] tracking-tight">{anime.title}</h1>
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed max-w-lg">{anime.synopsis}</p>
          <div className="flex items-center gap-3 pt-2">
            <Link to={`/anime/${anime.mal_id}`} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/25">
              <Play size={16} fill="currentColor" />Watch Now
            </Link>
            <button className="flex items-center gap-2 bg-secondary border border-border/50 px-6 py-3 rounded-lg font-semibold text-sm hover:bg-muted transition-colors">
              <Plus size={16} />My List
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const Anime = () => {
  const [trending, setTrending] = useState<any[]>([]);
  const [popular, setPopular] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [tRes, pRes, trRes] = await Promise.all([
          fetch('https://api.jikan.moe/v4/top/anime?filter=airing&limit=15'),
          fetch('https://api.jikan.moe/v4/top/anime?filter=bypopularity&limit=15'),
          fetch('https://api.jikan.moe/v4/top/anime?filter=favorite&limit=15'),
        ]);
        const tData = await tRes.json();
        const pData = await pRes.json();
        const trData = await trRes.json();
        setTrending(tData.data || []);
        setPopular(pData.data || []);
        setTopRated(trData.data || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <AnimeHero anime={trending[0]} />
        <div className="max-w-7xl mx-auto px-4 md:px-6 -mt-16 relative z-10 pb-20 space-y-10">
          <AnimeRow title="🔥 Trending Now" animeList={trending} loading={loading} />
          <AnimeRow title="⭐ Most Popular" animeList={popular} loading={loading} />
          <AnimeRow title="🏆 Top Rated Classics" animeList={topRated} loading={loading} />
        </div>
      </main>
    </div>
  );
};

export default Anime;
