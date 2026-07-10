import { useEffect, useRef, useState } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { getOfflineFile } from '@/lib/offlineLibrary';

interface Props {
  id: string;
  title: string;
  onClose: () => void;
}

const OfflinePlayer = ({ id, title, onClose }: Props) => {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let objUrl: string | null = null;
    let cancelled = false;
    (async () => {
      const f = await getOfflineFile(id);
      if (cancelled) return;
      if (!f) { setErr('Offline copy not found. It may have been removed.'); setLoading(false); return; }
      objUrl = URL.createObjectURL(f.blob);
      setUrl(objUrl);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [id]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <p className="text-sm font-semibold text-white truncate pr-4">{title}</p>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white shrink-0"
          aria-label="Close player"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center relative">
        {loading && (
          <div className="flex items-center gap-2 text-white/80 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading offline copy…
          </div>
        )}
        {err && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle size={16} /> {err}
          </div>
        )}
        {url && (
          <video
            ref={videoRef}
            src={url}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full w-full h-full object-contain"
            onError={() => setErr(
              'This format can\'t play natively in the browser. The file is saved to your device — open it with a video player like VLC.'
            )}
          />
        )}
      </div>
    </div>
  );
};

export default OfflinePlayer;
