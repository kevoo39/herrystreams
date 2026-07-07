import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import VideoPlayer from '@/components/VideoPlayer';
import { tmdbService, TMDBTVShowDetails, TMDBEpisode } from '@/lib/tmdb';
import { Play, Plus, Star, Calendar, ChevronLeft, ChevronDown, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { addToMyList, removeFromMyList, isInMyList } from '@/lib/myList';
import EpisodeDownloadButton from '@/components/EpisodeDownloadButton';

const TVShowDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [show, setShow] = useState<TMDBTVShowDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [playingEpisode, setPlayingEpisode] = useState<{ season: number; episode: number } | null>(null);
  const [inList, setInList] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        setLoading(true);
        const s = await tmdbService.getTVShowDetails(parseInt(id));
        setShow(s);
        setInList(isInMyList(`tv-${id}`));
        const qsS = parseInt(searchParams.get('s') || '');
        const qsE = parseInt(searchParams.get('e') || '');
        if (Number.isFinite(qsS) && qsS > 0) {
          setSelectedSeason(qsS);
          if (Number.isFinite(qsE) && qsE > 0) {
            setPlayingEpisode({ season: qsS, episode: qsE });
          }
        } else if (s.seasons?.length > 0) {
          const firstReal = s.seasons.find(s => s.season_number > 0);
          if (firstReal) setSelectedSeason(firstReal.season_number);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    if (!show || !id) return;
    const loadEpisodes = async () => {
      setEpisodesLoading(true);
      try {
        const data = await tmdbService.getSeasonDetails(parseInt(id), selectedSeason);
        setEpisodes(data.episodes || []);
      } catch (e) { console.error(e); }
      finally { setEpisodesLoading(false); }
    };
    loadEpisodes();
  }, [show, id, selectedSeason]);

  const toggleList = () => {
    if (!show || !id) return;
    if (inList) {
      removeFromMyList(`tv-${id}`);
      setInList(false);
    } else {
      addToMyList({
        id: `tv-${id}`,
        title: show.name,
        image: tmdbService.getImageUrl(show.poster_path),
        type: 'tv',
        addedAt: new Date().toISOString(),
      });
      setInList(true);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!show) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <span className="text-muted-foreground">Show not found</span>
    </div>
  );

  if (playingEpisode) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 pb-20 max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setPlayingEpisode(null)} className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
              <ChevronLeft size={18} />
            </button>
            <div>
              <h2 className="text-lg font-bold font-display truncate">{show.name}</h2>
              <p className="text-xs text-muted-foreground">S{playingEpisode.season} E{playingEpisode.episode}</p>
            </div>
          </div>
          <VideoPlayer
            tmdbId={show.id}
            season={playingEpisode.season}
            episode={playingEpisode.episode}
            title={`${show.name} S${playingEpisode.season}E${playingEpisode.episode}`}
            type="tv"
            totalEpisodes={episodes.length}
            onNextEpisode={() => {
              const nextEp = playingEpisode.episode + 1;
              if (nextEp <= episodes.length) {
                setPlayingEpisode({ ...playingEpisode, episode: nextEp });
              }
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="relative pt-16">
        <div className="absolute inset-0 h-[400px] overflow-hidden pointer-events-none">
          <img src={tmdbService.getBackdropUrl(show.backdrop_path)} alt="" className="w-full h-full object-cover blur-[80px] opacity-15 scale-150" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
        </div>

        <main className="relative max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8 mb-8">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden lg:block">
              <div className="aspect-[2/3] rounded-xl overflow-hidden border border-border/30 shadow-xl">
                <img src={tmdbService.getPosterUrl(show.poster_path)} alt={show.name} className="w-full h-full object-cover" />
              </div>
            </motion.div>
            <div className="space-y-5 min-w-0">
              <div className="flex flex-wrap gap-2">
                {show.genres?.map(g => (
                  <span key={g.id} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-bold border border-primary/20">{g.name}</span>
                ))}
              </div>
              <h1 className="text-2xl md:text-4xl font-bold font-display tracking-tight leading-tight">{show.name}</h1>
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
                {show.vote_average > 0 && <div className="flex items-center gap-1 text-primary"><Star size={14} fill="currentColor" /><span className="font-bold">{show.vote_average.toFixed(1)}</span></div>}
                <div className="flex items-center gap-1"><Calendar size={12} /><span>{show.first_air_date?.slice(0, 4)}</span></div>
                <span>{show.number_of_seasons} Season{show.number_of_seasons > 1 ? 's' : ''}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{show.overview}</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setPlayingEpisode({ season: selectedSeason, episode: 1 })} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                  <Play size={16} fill="currentColor" />Watch Now
                </button>
                <button onClick={toggleList} className="flex items-center gap-2 bg-secondary border border-border/30 px-6 py-3 rounded-lg font-semibold text-sm hover:bg-muted transition-colors">
                  {inList ? <Check size={16} className="text-primary" /> : <Plus size={16} />}
                  {inList ? 'In List' : 'My List'}
                </button>
              </div>
            </div>
          </div>

          {/* Season selector */}
          <div className="mb-6">
            <div className="flex items-center gap-3 flex-wrap">
              {show.seasons?.filter(s => s.season_number > 0).map(s => (
                <button
                  key={s.season_number}
                  onClick={() => setSelectedSeason(s.season_number)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    selectedSeason === s.season_number ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-muted text-foreground'
                  }`}
                >
                  Season {s.season_number}
                </button>
              ))}
            </div>
          </div>

          {/* Episodes */}
          <section>
            <h2 className="text-lg font-bold font-display mb-4">Episodes</h2>
            {episodesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-secondary animate-pulse rounded-lg" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {episodes.map(ep => (
                  <button
                    key={ep.id}
                    onClick={() => setPlayingEpisode({ season: selectedSeason, episode: ep.episode_number })}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/30 hover:border-primary/30 hover:bg-secondary/30 transition-all text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                      {ep.episode_number}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{ep.name}</p>
                      {ep.runtime && <p className="text-[10px] text-muted-foreground">{ep.runtime} min</p>}
                    </div>
                    <Play size={14} className="text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

export default TVShowDetails;
