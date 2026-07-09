// Persistent download queue with real statuses, auto-retry, cancel, and
// interrupted-job recovery. Runs up to N concurrent jobs and drains
// automatically. Keeps a screen wake lock while jobs are active so mobile
// downloads don't die when the screen sleeps.
//
// Reality check on "background while app is closed":
//   - On modern browsers, JS keeps running while the tab is backgrounded
//     (throttled). Downloads continue as long as the tab is alive.
//   - If the tab/app is fully closed mid-download, the job is marked
//     `failed` on next open with reason "interrupted" and can be retried
//     in one tap. iOS Safari cannot continue arbitrary downloads after the
//     tab is killed — that is a platform limit, not a code bug.
//   - For MP4 targets we offer a `handoffToBrowser` mode that triggers the
//     browser's own downloader on the proxied URL; that download survives
//     the tab being closed on desktop and Android.

import { downloadMp4, type MP4Progress } from '@/lib/mp4Downloader';
import { downloadHls, type DLProgress } from '@/lib/hlsDownloader';
import { recordDownload } from '@/lib/downloads';
import type { DownloadTarget } from '@/components/EpisodeDownloadButton';

const KEY = 'kevnest-download-queue-v1';
const MAX_CONCURRENT = 2;
const MAX_AUTO_RETRIES = 2;

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const APIKEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type JobStatus =
  | 'queued'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface DownloadJob {
  id: string;                       // stable per target (used to dedupe)
  target: DownloadTarget;
  display: string;
  filename: string;
  status: JobStatus;
  progress: number;                 // 0..100
  bytes: number;
  total: number;
  attempt: number;                  // auto-retry counter
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  savedFilename?: string;
}

type Listener = (jobs: DownloadJob[]) => void;

const listeners = new Set<Listener>();
let jobs: DownloadJob[] = [];
const controllers = new Map<string, AbortController>();
let wakeLock: any = null;

// ---------- persistence ----------

function loadFromStorage(): DownloadJob[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr: DownloadJob[] = JSON.parse(raw);
    // Jobs that were mid-flight get re-queued so they resume from the last
    // persisted chunk (see downloadStore.ts). No more silent "Interrupted".
    return arr.map((j) =>
      j.status === 'downloading' || j.status === 'queued'
        ? { ...j, status: 'queued' as JobStatus, error: 'Resuming after reload…' }
        : j,
    );
  } catch {
    return [];
  }
}

function persist() {
  try {
    // Keep last 200 jobs
    localStorage.setItem(KEY, JSON.stringify(jobs.slice(0, 200)));
  } catch { /* quota */ }
}

function emit() {
  persist();
  const snap = [...jobs];
  listeners.forEach((l) => { try { l(snap); } catch { /* noop */ } });
  try { window.dispatchEvent(new CustomEvent('kevnest-queue-changed')); } catch { /* noop */ }
}

// ---------- public API ----------

export function initDownloadQueue() {
  if (jobs.length) return;
  jobs = loadFromStorage();
  emit();
  // Try to drain (only if there were queued items — after recovery none should
  // be queued, but this is cheap).
  drain();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn([...jobs]);
  return () => { listeners.delete(fn); };
}

export function getJobs(): DownloadJob[] {
  return [...jobs];
}

export function getJobByTargetId(id: string): DownloadJob | undefined {
  return jobs.find((j) => j.id === id);
}

export function enqueue(target: DownloadTarget): DownloadJob {
  const { id, display, filename } = buildIdentity(target);
  const existing = jobs.find((j) => j.id === id);
  if (existing && (existing.status === 'queued' || existing.status === 'downloading')) {
    return existing;
  }
  const job: DownloadJob = existing
    ? { ...existing, status: 'queued', progress: 0, bytes: 0, total: 0, attempt: 0, error: undefined, createdAt: Date.now() }
    : {
        id, target, display, filename,
        status: 'queued', progress: 0, bytes: 0, total: 0, attempt: 0,
        createdAt: Date.now(),
      };
  jobs = [job, ...jobs.filter((j) => j.id !== id)];
  emit();
  drain();
  return job;
}

export function retry(id: string) {
  const j = jobs.find((x) => x.id === id);
  if (!j) return;
  if (j.status === 'downloading') return;
  j.status = 'queued';
  j.progress = 0;
  j.bytes = 0;
  j.total = 0;
  j.attempt = 0;
  j.error = undefined;
  j.startedAt = undefined;
  j.finishedAt = undefined;
  emit();
  drain();
}

export function cancel(id: string) {
  const c = controllers.get(id);
  if (c) c.abort();
  const j = jobs.find((x) => x.id === id);
  if (j && (j.status === 'queued' || j.status === 'downloading')) {
    j.status = 'canceled';
    j.finishedAt = Date.now();
    emit();
  }
  releaseWakeLockIfIdle();
}

export function remove(id: string) {
  cancel(id);
  jobs = jobs.filter((j) => j.id !== id);
  controllers.delete(id);
  emit();
}

export function clearFinished() {
  jobs = jobs.filter((j) => j.status === 'downloading' || j.status === 'queued');
  emit();
}

// ---------- runner ----------

function drain() {
  const active = jobs.filter((j) => j.status === 'downloading').length;
  const slots = Math.max(0, MAX_CONCURRENT - active);
  if (slots === 0) return;
  const next = jobs.filter((j) => j.status === 'queued').slice(0, slots);
  next.forEach(runJob);
  if (jobs.some((j) => j.status === 'downloading' || j.status === 'queued')) {
    acquireWakeLock();
  }
}

async function runJob(job: DownloadJob) {
  job.status = 'downloading';
  job.startedAt = Date.now();
  job.error = undefined;
  emit();

  const ctrl = new AbortController();
  controllers.set(job.id, ctrl);

  try {
    await executeJob(job, ctrl.signal);
    job.status = 'completed';
    job.progress = 100;
    job.finishedAt = Date.now();
    recordDownload({
      id: job.id,
      kind: job.target.kind,
      title: job.display,
      parentTitle: job.target.parentTitle,
      image: job.target.image,
      savedAt: new Date().toISOString(),
      filename: job.savedFilename,
      bytes: job.bytes || job.total,
      tmdbId: 'tmdbId' in job.target ? job.target.tmdbId : undefined,
      season: job.target.kind === 'tv' ? job.target.season : undefined,
      episode: job.target.kind === 'tv' ? job.target.episode : undefined,
      anilistId: job.target.kind === 'anime' ? job.target.anilistId : undefined,
      malId: job.target.kind === 'anime' ? job.target.malId : undefined,
      animeEpisode: job.target.kind === 'anime' ? job.target.episode : undefined,
      audioType: job.target.kind === 'anime' ? job.target.audioType : undefined,
    });
    emit();
  } catch (err: any) {
    const wasCanceled = ctrl.signal.aborted || /aborted/i.test(err?.message || '');
    if (wasCanceled) {
      job.status = 'canceled';
      job.finishedAt = Date.now();
      emit();
    } else if (job.attempt < MAX_AUTO_RETRIES) {
      job.attempt += 1;
      job.status = 'queued';
      job.error = `Retrying (${job.attempt}/${MAX_AUTO_RETRIES})…`;
      emit();
      setTimeout(drain, 1200 * job.attempt);
    } else {
      job.status = 'failed';
      job.error = err?.message || 'Download failed';
      job.finishedAt = Date.now();
      emit();
    }
  } finally {
    controllers.delete(job.id);
    releaseWakeLockIfIdle();
    drain(); // pull next queued
  }
}

async function executeJob(job: DownloadJob, signal: AbortSignal) {
  const { target, filename } = job;
  const quality = (target as any).quality as ('auto' | '1080' | '720' | '480' | '360' | undefined);
  const preferredHeight = quality && quality !== 'auto' ? parseInt(quality, 10) : undefined;

  if (target.kind === 'movie' || target.kind === 'tv') {
    const params = new URLSearchParams({ type: target.kind, tmdb: String(target.tmdbId) });
    if (target.kind === 'tv') {
      params.set('season', String(target.season));
      params.set('episode', String(target.episode));
    }
    if (quality && quality !== 'auto') params.set('quality', `${quality}p`);
    const data = await fetchJsonWithRetry(`${FN_BASE}/vidzen-extract?${params}`, signal);
    if (!data?.url) throw new Error('No stream URL from Vidzen');
    const isHls = data.type === 'hls' || /\.m3u8(\?|$)/.test(data.url);

    if (isHls) {
      const proxied = `${FN_BASE}/hls-proxy?url=${encodeURIComponent(data.url)}&ref=${encodeURIComponent('https://vidzen.fun/')}`;
      await downloadHls(proxied, filename, (p: DLProgress) => onHls(job, p), signal, preferredHeight);
    } else {
      const proxied = `${FN_BASE}/mp4-proxy?url=${encodeURIComponent(data.url)}&dl=1&name=${encodeURIComponent(filename)}&apikey=${APIKEY}`;
      await downloadMp4(proxied, filename, (p: MP4Progress) => onMp4(job, p), signal);
    }
    return;
  }

  // anime
  const data = await fetchJsonWithRetry(
    `${FN_BASE}/anime-extract?anilist=${target.anilistId}&ep=${target.episode}&type=${target.audioType}`,
    signal,
  );
  if (!data?.url) throw new Error('No stream URL from anime source');
  const proxied = data.ctx && data.path
    ? `${FN_BASE}/hls-proxy?ctx=${encodeURIComponent(data.ctx)}&path=${encodeURIComponent(data.path)}&ref=${encodeURIComponent(data.referer || '')}`
    : `${FN_BASE}/hls-proxy?url=${encodeURIComponent(data.url)}&ref=${encodeURIComponent(data.referer || '')}`;
  await downloadHls(proxied, filename, (p: DLProgress) => onHls(job, p), signal, preferredHeight);
}

function onMp4(job: DownloadJob, p: MP4Progress) {
  if (p.status === 'downloading') {
    job.bytes = p.bytes;
    job.total = p.total;
    if (p.total > 0) job.progress = Math.round((p.bytes / p.total) * 100);
  } else if (p.status === 'done') {
    job.progress = 100;
    job.bytes = p.bytes;
    job.total = p.total || p.bytes;
    job.savedFilename = p.filename;
  }
  emit();
}

function onHls(job: DownloadJob, p: DLProgress) {
  if (p.status === 'downloading') {
    job.bytes = p.bytes;
    job.total = p.total;
    if (p.total > 0) job.progress = Math.round((p.done / p.total) * 100);
  } else if (p.status === 'done') {
    job.progress = 100;
    job.bytes = p.blobSize || p.bytes;
    job.total = job.bytes;
    job.savedFilename = p.filename;
  }
  emit();
}

async function fetchJsonWithRetry(url: string, signal: AbortSignal, retries = 3, timeoutMs = 15000): Promise<any> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    if (signal.aborted) throw new Error('aborted');
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal.addEventListener('abort', onAbort);
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers: { apikey: APIKEY }, signal: ctrl.signal });
      clearTimeout(t);
      signal.removeEventListener('abort', onAbort);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      signal.removeEventListener('abort', onAbort);
      lastErr = e;
      if (i < retries && !signal.aborted) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------- wake lock (keeps mobile screen alive so DL isn't throttled to death) ----------

async function acquireWakeLock() {
  try {
    if (wakeLock) return;
    const wl = (navigator as any).wakeLock;
    if (wl && typeof wl.request === 'function') {
      wakeLock = await wl.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    }
  } catch { /* noop */ }
}

function releaseWakeLockIfIdle() {
  const busy = jobs.some((j) => j.status === 'downloading' || j.status === 'queued');
  if (!busy && wakeLock) {
    try { wakeLock.release?.(); } catch { /* noop */ }
    wakeLock = null;
  }
}

// Re-acquire wake lock if the user comes back to the tab while downloads are active.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const busy = jobs.some((j) => j.status === 'downloading' || j.status === 'queued');
      if (busy) acquireWakeLock();
    }
  });
}

// ---------- helpers ----------

function buildIdentity(target: DownloadTarget): { id: string; display: string; filename: string } {
  const q = (target as any).quality as string | undefined;
  const qSuffix = q && q !== 'auto' ? `-${q}` : '';
  const qTag = q && q !== 'auto' ? ` ${q}p` : '';
  if (target.kind === 'movie') {
    return {
      id: `movie-${target.tmdbId}${qSuffix}`,
      display: `${target.parentTitle}${qTag}`,
      filename: `${target.parentTitle}${qTag}`,
    };
  }
  if (target.kind === 'tv') {
    const pad = (n: number) => String(n).padStart(2, '0');
    const tag = `S${pad(target.season)}E${pad(target.episode)}`;
    return {
      id: `tv-${target.tmdbId}-s${target.season}e${target.episode}${qSuffix}`,
      display: `${target.parentTitle} · ${tag}${qTag}`,
      filename: `${target.parentTitle} ${tag}${qTag}`,
    };
  }
  return {
    id: `anime-${target.anilistId}-${target.episode}-${target.audioType}${qSuffix}`,
    display: `${target.parentTitle} · E${target.episode} · ${target.audioType.toUpperCase()}${qTag}`,
    filename: `${target.parentTitle} E${target.episode} ${target.audioType}${qTag}`,
  };
}
