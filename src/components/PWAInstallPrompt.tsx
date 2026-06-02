import { useEffect, useState } from 'react';
import { Download, Share, Plus, X } from 'lucide-react';
import logo from '@/assets/logo.png';

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'kn:pwa-install-dismissed';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS
  (window.navigator as any).standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !(window as any).MSStream;

const PWAInstallPrompt = () => {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    // Re-show after 7 days
    const suppressed = dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
    if (suppressed) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    };

    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);

    // iOS has no beforeinstallprompt — show manual instructions
    if (isIOS()) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBIP);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    setShowIOS(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') {
        setVisible(false);
      } else {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setVisible(false);
      }
      setDeferred(null);
    } else if (isIOS()) {
      setShowIOS(true);
    }
  };

  if (installed || !visible) return null;

  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-1.5rem)] max-w-md
                   bg-card/95 backdrop-blur-xl border border-primary/30 rounded-2xl shadow-elegant
                   p-3 flex items-center gap-3 animate-in slide-in-from-bottom-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
        role="dialog"
        aria-label="Install KevNest"
      >
        <img src={logo} alt="KevNest" className="h-11 w-11 rounded-xl object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-display text-base leading-tight text-foreground">Install KevNest</p>
          <p className="text-xs text-muted-foreground truncate">
            Add to your home screen for the full-screen app experience.
          </p>
        </div>
        <button
          onClick={install}
          className="shrink-0 px-3 py-2 rounded-xl bg-gradient-to-r from-primary to-accent
                     text-primary-foreground text-sm font-semibold flex items-center gap-1.5
                     shadow-md hover:opacity-90 transition"
          aria-label="Install app"
        >
          <Download size={14} /> Install
        </button>
        <button
          onClick={dismiss}
          className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      {showIOS && (
        <div
          className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={dismiss}
        >
          <div
            className="bg-card border border-primary/30 rounded-3xl p-6 max-w-sm w-full shadow-elegant"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <img src={logo} alt="KevNest" className="h-12 w-12 rounded-xl" />
              <div>
                <h2 className="font-display text-xl text-gold-gradient">Install KevNest</h2>
                <p className="text-xs text-muted-foreground">On your iPhone or iPad</p>
              </div>
            </div>
            <ol className="space-y-3 text-sm text-foreground">
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</span>
                <span className="flex-1">
                  Tap the <Share size={14} className="inline mx-1 text-primary" />
                  <strong>Share</strong> button in Safari's toolbar.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</span>
                <span className="flex-1">
                  Scroll and choose <Plus size={14} className="inline mx-1 text-primary" />
                  <strong>Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">3</span>
                <span className="flex-1">Tap <strong>Add</strong> — KevNest will appear on your home screen.</span>
              </li>
            </ol>
            <button
              onClick={dismiss}
              className="mt-5 w-full py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent
                         text-primary-foreground font-semibold"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAInstallPrompt;
