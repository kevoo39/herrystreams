import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import AppFooter from '@/components/AppFooter';
import VideoPlayer from '@/components/VideoPlayer';
import { Play, Plus, Star, Calendar, Clock, ChevronLeft, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AnimeDetails = () => {
  const { id } = useParams();
  const [anime, setAnime] = useState<any>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [relatedSeasons, setRelatedSeasons] = useState<any[]>([]);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const [animeRes, episodesRes] = await Promise.all([
          fetch(`https://api.jikan.moe/v4/anime/${id}`),
          fetch(`https://api.jikan.moe/v4/anime/${id}/episodes`)
        ]);
        const animeData = await animeRes.json();
        const episodesData = await episodesRes.json();
        setAnime(animeData.data);
        setEpisodes(episodesData.data || []);

        try {
          await new Promise(r => setTimeout(r, 400));
          const relRes = await fetch(`https://api.jikan.moe/v4/anime/${id}/relations`);
          const relData = await relRes.json();
          const seasons = (relData.data || [])
            .filter((r: any) => ['Sequel', 'Prequel'].includes(r.relation))
            .flatMap((r: any) => r.entry.filter((e: any) => e.type === 'anime').map((e: any) => ({ ...e, relation: r.relation })));
          setRelatedSeasons(seasons);
        } catch {}
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchDetails();
    window.scrollTo(0, 0);
  }, [id]);

  const handleNextEpisode = useCallback(() => {
    if (selectedEpisode && episodes.length > 0) {
      const idx = episodes.findIndex(e => e.mal_id === selectedEpisode);
      if (idx < episodes.length - 1) {
        setSelectedEpisode(episodes[idx + 1].mal_id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [selectedEpisode, episodes]);

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!anime) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <span className="text-muted-foreground">Anime not found</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="relative pt-16">
        <div className="absolute inset-0 h-[400px] overflow-hidden pointer-events-none">
          <img src={anime.images.webp.large_image_url} alt="" className="w-full h-full object-cover blur-[80px] opacity-15 scale-150" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
        </div>

        <main className="relative max-w-7xl mx-auto px-4 md:px-6 py-8">
          <AnimatePresence mode="wait">
            {selectedEpisode ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-8 space-y-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedEpisode(null)} className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
                    <ChevronLeft size={18} />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold font-display truncate">Now Playing</h2>
                    <p className="text-xs text-muted-foreground truncate">
                      Episode {selectedEpisode}: {episodes.find(e => e.mal_id === selectedEpisode)?.title || 'Untitled'}
                    </p>
                  </div>
                </div>
                <VideoPlayer
                  malId={id!}
                  animeEpisode={selectedEpisode}
                  title={anime.title}
                  type="anime"
                  totalEpisodes={episodes.length}
                  onNextEpisode={handleNextEpisode}
                />
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8 mb-8">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden lg:block">
                  <div className="aspect-[2/3] rounded-xl overflow-hidden border border-border/30 shadow-xl">
                    <img src={anime.images.webp.large_image_url} alt={anime.title} className="w-full h-full object-cover" />
                  </div>
                </motion.div>
                <div className="space-y-5 min-w-0">
                  <div className="flex flex-wrap gap-2">
                    {anime.genres?.map((g: any) => (
                      <span key={g.mal_id} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-bold border border-primary/20">{g.name}</span>
                    ))}
                  </div>
                  <h1 className="text-2xl md:text-4xl font-bold font-display tracking-tight leading-tight break-words">{anime.title}</h1>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
                    {anime.score && <div className="flex items-center gap-1 text-primary"><Star size={14} fill="currentColor" /><span className="font-bold">{anime.score}</span></div>}
                    {anime.aired?.prop?.from?.year && <div className="flex items-center gap-1"><Calendar size={12} /><span>{anime.aired.prop.from.year}</span></div>}
                    {anime.duration && <div className="flex items-center gap-1"><Clock size={12} /><span>{anime.duration}</span></div>}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4 break-words">{anime.synopsis}</p>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => setSelectedEpisode(1)} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                      <Play size={16} fill="currentColor" />Watch Now
                    </button>
                    <button className="flex items-center gap-2 bg-secondary border border-border/30 px-6 py-3 rounded-lg font-semibold text-sm hover:bg-muted transition-colors">
                      <Plus size={16} />Watchlist
                    </button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>

          {relatedSeasons.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-bold font-display mb-3">Seasons</h2>
              <div className="flex flex-wrap gap-2">
                {relatedSeasons.map((entry: any, idx: number) => (
                  <Link key={entry.mal_id} to={`/anime/${entry.mal_id}`} className="flex items-center gap-2 px-3 py-2 bg-secondary/30 border border-border/30 rounded-lg hover:bg-secondary/60 hover:border-primary/20 transition-colors min-w-0">
                    <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">{idx + 1}</div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate max-w-[200px]">{entry.name}</p>
                      <p className="text-[10px] text-muted-foreground">{entry.relation}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <List size={16} className="text-primary" />
                <h2 className="text-lg font-bold font-display">Episodes</h2>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 bg-secondary rounded border border-border/30">{episodes.length} Total</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {episodes.length > 0 ? episodes.map((ep: any) => (
                <button
                  key={ep.mal_id}
                  onClick={() => { setSelectedEpisode(ep.mal_id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                    selectedEpisode === ep.mal_id ? 'border-primary bg-primary/5' : 'border-border/30 hover:border-primary/30 hover:bg-secondary/30'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    selectedEpisode === ep.mal_id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}>
                    {ep.mal_id}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{ep.title || `Episode ${ep.mal_id}`}</p>
                    {ep.aired && <p className="text-[10px] text-muted-foreground">{new Date(ep.aired).toLocaleDateString()}</p>}
                  </div>
                  <Play size={14} className="text-muted-foreground shrink-0" />
                </button>
              )) : (
                <p className="text-sm text-muted-foreground col-span-2 text-center py-8">No episode data available. Click "Watch Now" to start from Episode 1.</p>
              )}
            </div>
          </section>
        </main>
      </div>
      <AppFooter />
    </div>
  );
};

export default AnimeDetails;
