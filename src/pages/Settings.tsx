import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  User,
  Bell,
  Download,
  Play,
  Shield,
  HelpCircle,
  Info,
  Trash2,
  LogOut,
  Smartphone,
  Globe,
  Eye,
  Zap,
  Star,
  Share2,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { getPlayerSettings, savePlayerSettings } from '@/lib/resume';
import logo from '@/assets/kevnest-logo.png';

const VERSION = '1.0.0';

type Row = {
  icon: React.ElementType;
  label: string;
  hint?: string;
  to?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="px-1 mb-3 text-xs font-bold tracking-[0.2em] uppercase text-primary">{title}</h2>
    <div className="rounded-2xl overflow-hidden border border-border bg-card/60 backdrop-blur-sm divide-y divide-border">
      {children}
    </div>
  </section>
);

const Item = ({ icon: Icon, label, hint, to, onClick, trailing, danger }: Row) => {
  const content = (
    <div className="flex items-center gap-4 px-4 py-3.5 active:bg-secondary/60 transition-colors">
      <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${danger ? 'bg-destructive/15 text-destructive' : 'bg-secondary text-primary'}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${danger ? 'text-destructive' : 'text-foreground'}`}>{label}</div>
        {hint && <div className="text-xs text-muted-foreground truncate">{hint}</div>}
      </div>
      {trailing ?? (to || onClick ? <ChevronRight size={18} className="text-muted-foreground" /> : null)}
    </div>
  );
  if (to) return <Link to={to}>{content}</Link>;
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      {content}
    </button>
  );
};

const Settings = () => {
  const [settings, setSettings] = useState(getPlayerSettings());
  const [notif, setNotif] = useState(() => localStorage.getItem('kn:notif') !== '0');
  const [autoplay, setAutoplay] = useState(() => localStorage.getItem('kn:autoplay') !== '0');
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem('kn:datasaver') === '1');
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
  }, []);

  const update = (patch: Partial<ReturnType<typeof getPlayerSettings>>) => {
    setSettings(savePlayerSettings(patch));
  };

  const persistBool = (key: string, val: boolean, setter: (v: boolean) => void) => {
    localStorage.setItem(key, val ? '1' : '0');
    setter(val);
  };

  const clearWatchHistory = () => {
    localStorage.removeItem('kevnest-resume-v1');
    toast.success('Watch history cleared');
  };

  const clearMyList = () => {
    localStorage.removeItem('kevnest-my-list');
    toast.success('My List cleared');
  };

  const clearCache = () => {
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
    toast.success('Cache cleared');
  };

  const share = async () => {
    const url = window.location.origin;
    if (navigator.share) {
      try { await navigator.share({ title: 'KevNest', text: 'Watch movies, TV & anime on KevNest', url }); } catch {}
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="relative px-5 pt-10 pb-6 bg-gradient-to-b from-primary/10 via-background to-background">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gold-gradient p-[2px] shadow-[var(--shadow-gold)]">
              <div className="w-full h-full rounded-[14px] bg-background flex items-center justify-center overflow-hidden">
                <img src={logo} alt="KevNest" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-wide leading-none mb-1">SETTINGS</h1>
            <p className="text-xs text-muted-foreground">KevNest · v{VERSION}</p>
          </div>
        </div>
      </header>

      <main className="px-4">
        {/* Profile */}
        <Section title="Profile">
          <Item icon={User} label="Guest" hint="Tap to manage profile" onClick={() => toast.info('Profiles coming soon')} />
          <Item icon={Star} label="Plan" hint="Free · Unlimited streaming" trailing={<span className="text-xs font-bold text-primary tracking-wider">FREE</span>} />
        </Section>

        {/* Playback */}
        <Section title="Playback">
          <Item
            icon={Play}
            label="Autoplay next episode"
            hint="Plays the next episode automatically"
            trailing={<Switch checked={autoplay} onCheckedChange={(v) => persistBool('kn:autoplay', v, setAutoplay)} />}
          />
          <Item
            icon={Zap}
            label="Prefer ad-free HLS"
            hint="Use native player when available"
            trailing={<Switch checked={settings.preferNative} onCheckedChange={(v) => update({ preferNative: v })} />}
          />
          <Item
            icon={Globe}
            label="Preferred audio"
            hint="For anime content"
            trailing={
              <div className="flex rounded-full bg-secondary p-0.5">
                {(['sub', 'dub'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => update({ preferredAudio: a })}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all ${
                      settings.preferredAudio === a ? 'bg-gold-gradient text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            }
          />
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-secondary text-primary">
                <Play size={18} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">Default playback speed</div>
                <div className="text-xs text-muted-foreground">{settings.playbackRate.toFixed(2)}x</div>
              </div>
            </div>
            <Slider
              value={[settings.playbackRate * 100]}
              min={50}
              max={200}
              step={25}
              onValueChange={(v) => update({ playbackRate: v[0] / 100 })}
            />
          </div>
        </Section>

        {/* Data & Downloads */}
        <Section title="Data & Downloads">
          <Item
            icon={Download}
            label="Data Saver"
            hint="Lower quality on mobile networks"
            trailing={<Switch checked={dataSaver} onCheckedChange={(v) => persistBool('kn:datasaver', v, setDataSaver)} />}
          />
          <Item icon={Trash2} label="Clear cache" hint="Free up storage" onClick={clearCache} />
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <Item
            icon={Bell}
            label="Push notifications"
            hint="New releases & recommendations"
            trailing={<Switch checked={notif} onCheckedChange={(v) => persistBool('kn:notif', v, setNotif)} />}
          />
        </Section>

        {/* App */}
        <Section title="App">
          <Item
            icon={Smartphone}
            label="Install app"
            hint={installed ? 'Already installed' : 'Add to home screen'}
            trailing={installed ? <span className="text-xs font-bold text-primary">✓</span> : <ChevronRight size={18} className="text-muted-foreground" />}
            onClick={() => !installed && toast.info('Use the install banner or your browser menu')}
          />
          <Item icon={Share2} label="Share KevNest" onClick={share} />
          <Item icon={Eye} label="Appearance" hint="Noir & Gold · Dark" />
        </Section>

        {/* Privacy */}
        <Section title="Privacy & Data">
          <Item icon={Trash2} label="Clear watch history" onClick={clearWatchHistory} danger />
          <Item icon={Trash2} label="Clear My List" onClick={clearMyList} danger />
        </Section>

        {/* Help */}
        <Section title="Help & About">
          <Item icon={HelpCircle} label="Help Center" hint="FAQs & support" onClick={() => toast.info('Reach out via the publish page')} />
          <Item icon={Shield} label="Privacy Policy" onClick={() => toast.info('Coming soon')} />
          <Item icon={Info} label="About KevNest" hint={`Version ${VERSION}`} />
        </Section>

        {/* Sign out (placeholder) */}
        <div className="px-1">
          <Button
            variant="outline"
            className="w-full h-12 rounded-2xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold tracking-wider uppercase"
            onClick={() => toast.info('No account session active')}
          >
            <LogOut className="mr-2" size={18} />
            Sign Out
          </Button>
        </div>

        <p className="text-center text-[10px] text-muted-foreground mt-8 tracking-widest uppercase">
          Made with <span className="text-primary">★</span> · KevNest © {new Date().getFullYear()}
        </p>
      </main>
    </div>
  );
};

export default Settings;
