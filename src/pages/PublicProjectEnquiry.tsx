import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  CircleAlert,
  Clock3,
  IndianRupee,
  Landmark,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Badge, ProgressBar } from '../components/ui';
import {
  projectIdFromQrPayload,
  PublicProjectService,
  type PublicProject,
} from '../services/publicProjectService';

interface PublicProjectEnquiryProps {
  initialProjectId?: string;
  onBack: () => void;
  onSignIn: () => void;
  onProjectChange?: (projectId: string | null) => void;
}

function formatCrore(value: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)} Cr`;
}

function formatDate(value: string | null): string {
  if (!value) return 'Not published';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not published' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function publicStatusVariant(status: PublicProject['status']): 'healthy' | 'info' | 'watch' | 'neutral' {
  if (status === 'Completed') return 'healthy';
  if (status === 'Active') return 'info';
  if (status === 'On Hold') return 'watch';
  return 'neutral';
}

export default function PublicProjectEnquiry({
  initialProjectId,
  onBack,
  onSignIn,
  onProjectChange,
}: PublicProjectEnquiryProps) {
  const [query, setQuery] = useState(initialProjectId ?? '');
  const [results, setResults] = useState<PublicProject[]>([]);
  const [selected, setSelected] = useState<PublicProject | null>(null);
  const [searching, setSearching] = useState(false);
  const [detailLoading, setDetailLoading] = useState(Boolean(initialProjectId));
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const openProject = useCallback(async (projectId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const project = await PublicProjectService.get(projectId);
      if (!project) {
        setSelected(null);
        setError(`No publicly available project was found for “${projectId}”.`);
        onProjectChange?.(null);
        return;
      }
      setSelected(project);
      setQuery(project.id);
      setResults([]);
      onProjectChange?.(project.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Public project information is temporarily unavailable.');
    } finally {
      setDetailLoading(false);
    }
  }, [onProjectChange]);

  useEffect(() => {
    if (!initialProjectId) return;
    const timer = window.setTimeout(() => void openProject(initialProjectId), 0);
    return () => window.clearTimeout(timer);
  }, [initialProjectId, openProject]);

  useEffect(() => {
    if (selected && query.trim().toLowerCase() === selected.id.toLowerCase()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError(null);
      void PublicProjectService.search(query, controller.signal)
        .then(response => setResults(response.items))
        .catch(searchError => {
          if (!controller.signal.aborted) setError(searchError instanceof Error ? searchError.message : 'Unable to search public projects.');
        })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  const closeScanner = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    if (videoRef.current?.srcObject instanceof MediaStream) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setScannerOpen(false);
  }, []);

  useEffect(() => () => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    if (videoRef.current?.srcObject instanceof MediaStream) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  }, []);

  useEffect(() => {
    if (!scannerOpen || !videoRef.current) return;
    let active = true;
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
    setCameraError(null);

    void reader.decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
      videoRef.current,
      (result, scanError, controls) => {
        scannerControlsRef.current = controls;
        if (!active || !result) return;
        const projectId = projectIdFromQrPayload(result.getText());
        if (!projectId) {
          setCameraError('This QR code is not a valid DRISHTI public-project code.');
          return;
        }
        controls.stop();
        setScannerOpen(false);
        void openProject(projectId);
      },
    ).then(controls => {
      if (active) scannerControlsRef.current = controls;
      else controls.stop();
    }).catch(cameraFailure => {
      if (!active) return;
      const message = cameraFailure instanceof DOMException && cameraFailure.name === 'NotAllowedError'
        ? 'Camera permission was not granted. Allow camera access or search by project name/ID.'
        : 'The camera could not be started. Check browser permissions or search by project ID.';
      setCameraError(message);
    });

    return () => {
      active = false;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [openProject, scannerOpen]);

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <button type="button" onClick={onBack} className="flex items-center gap-3 text-left" aria-label="Return to DRISHTI home">
            <span className="landing-brand-mark">D</span>
            <span><span className="block text-sm font-extrabold tracking-[0.12em] text-navy-900">DRISHTI</span><span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Public project enquiry</span></span>
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-[10px] font-semibold text-emerald-700 sm:inline-flex"><ShieldCheck className="h-3.5 w-3.5" /> Public information only</span>
            <button type="button" onClick={onSignIn} className="landing-signin-btn">Staff sign in <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-navy-950 px-4 py-12 text-white sm:px-6">
          <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full bg-teal-500/10 blur-3xl" />
          <div className="relative mx-auto max-w-5xl text-center">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-teal-200"><Landmark className="h-3.5 w-3.5" /> No sign-in required</p>
            <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">Find a public infrastructure project</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-300">Search by project name or ID, or scan the DRISHTI QR displayed at a project site. Only approved public facts and the published estimated timeline are shown.</p>

            <div className="mx-auto mt-7 flex max-w-3xl flex-col gap-2 rounded-2xl border border-white/15 bg-white/10 p-2 shadow-2xl backdrop-blur sm:flex-row">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
                <input value={query} onChange={event => { setQuery(event.target.value); setSelected(null); }} className="h-11 w-full rounded-xl border-0 bg-white pl-11 pr-10 text-sm text-slate-900 outline-none ring-teal-400 focus:ring-2" placeholder="Search project name, ID, sector or state" aria-label="Search public projects" />
                {searching && <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-teal-700" />}
              </label>
              <button type="button" onClick={() => setScannerOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-400 px-5 text-sm font-bold text-navy-950 transition hover:bg-teal-300"><Camera className="h-4 w-4" /> Scan site QR</button>
            </div>
            <p className="mt-3 text-[10px] text-slate-400">Camera permission is requested only after you select “Scan site QR”.</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {error && <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

          {detailLoading ? (
            <div className="card flex min-h-[300px] items-center justify-center"><div className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-teal-700" /><p className="mt-3 text-sm font-semibold text-slate-600">Loading public project record…</p></div></div>
          ) : selected ? (
            <div className="space-y-5">
              <button type="button" onClick={() => { setSelected(null); setQuery(''); onProjectChange?.(null); }} className="btn btn-secondary btn-sm"><ArrowLeft className="h-3.5 w-3.5" /> Back to search</button>
              <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-gradient-to-r from-white to-teal-50 px-5 py-5 sm:px-7">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div><p className="font-mono text-[10px] font-bold tracking-wide text-teal-700">{selected.id}</p><h2 className="mt-1 text-xl font-bold text-navy-900 sm:text-2xl">{selected.name}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{selected.description || 'A public project summary has not yet been published.'}</p></div>
                    <Badge variant={publicStatusVariant(selected.status)} className="shrink-0">{selected.status}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_0.8fr]">
                  <div className="space-y-5 p-5 sm:p-7">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {[
                        { label: 'Ministry', value: selected.ministry, icon: <Building2 className="h-3.5 w-3.5" /> },
                        { label: 'State / Region', value: selected.state, icon: <MapPin className="h-3.5 w-3.5" /> },
                        { label: 'Sector', value: selected.sector, icon: <Landmark className="h-3.5 w-3.5" /> },
                        { label: 'Implementing agency', value: selected.implementingAgency || 'Not published', icon: <Building2 className="h-3.5 w-3.5" /> },
                      ].map(item => (
                        <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.icon}{item.label}</div><p className="mt-1.5 text-xs font-semibold text-slate-800">{item.value}</p></div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-navy-900">Published physical progress</p><p className="mt-0.5 text-[10px] text-slate-500">As last reported {formatDate(selected.lastReportedAt)}</p></div><span className="text-xl font-bold text-teal-800">{selected.physicalProgress.toFixed(0)}%</span></div>
                      <div className="mt-3"><ProgressBar value={selected.physicalProgress} /></div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 bg-[#f8faf8] p-5 sm:p-7 lg:border-l lg:border-t-0">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Public cost and target dates</h3>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-white p-4"><IndianRupee className="h-4 w-4 text-teal-700" /><p className="mt-3 text-[10px] text-slate-500">Approved cost</p><p className="mt-1 text-base font-bold text-navy-900">{formatCrore(selected.approvedCost)}</p></div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4"><IndianRupee className="h-4 w-4 text-amber-600" /><p className="mt-3 text-[10px] text-slate-500">Latest revised cost</p><p className="mt-1 text-base font-bold text-navy-900">{formatCrore(selected.revisedCost)}</p></div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4"><CalendarDays className="h-4 w-4 text-teal-700" /><p className="mt-3 text-[10px] text-slate-500">Original target</p><p className="mt-1 text-xs font-bold text-navy-900">{formatDate(selected.originalCompletionDate)}</p></div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4"><Clock3 className="h-4 w-4 text-blue-700" /><p className="mt-3 text-[10px] text-slate-500">Current published target</p><p className="mt-1 text-xs font-bold text-navy-900">{formatDate(selected.revisedCompletionDate)}</p></div>
                    </div>
                    <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-[10px] leading-4 text-blue-800">These are published project facts, not a DRISHTI risk assessment or model prediction. Target dates may change through formal project revisions.</p>
                  </div>
                </div>
              </article>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-bold text-navy-900">Published estimated timeline</h2><p className="mt-1 text-xs text-slate-500">Planned project milestones available in the public record. This is not a predictive schedule.</p></div><Badge variant="neutral">{selected.milestones.length} milestones</Badge></div>
                {selected.milestones.length ? (
                  <div className="mt-6 overflow-x-auto pb-2"><div className="flex min-w-max items-start">
                    {selected.milestones.map((milestone, index) => <div key={`${milestone.name}-${milestone.plannedDate}`} className="relative w-52 pr-5 last:pr-0"><div className="relative z-10 h-4 w-4 rounded-full border-4 border-teal-600 bg-white" />{index < selected.milestones.length - 1 && <div className="absolute left-4 right-0 top-[7px] h-px bg-slate-300" />}<p className="mt-3 max-w-[180px] text-xs font-semibold text-slate-800">{milestone.name}</p><p className="mt-1 text-[10px] font-medium text-teal-700">Estimated target {formatDate(milestone.plannedDate)}</p></div>)}
                  </div></div>
                ) : <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-7 text-center text-xs text-slate-500">No public milestone timeline has been published for this project.</div>}
              </section>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {results.map(project => (
                <button key={project.id} type="button" onClick={() => void openProject(project.id)} className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3"><span className="font-mono text-[10px] font-bold text-teal-700">{project.id}</span><Badge variant={publicStatusVariant(project.status)}>{project.status}</Badge></div>
                  <h2 className="mt-2 text-sm font-bold text-navy-900 group-hover:text-teal-800">{project.name}</h2>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{project.state}</span><span>{project.sector}</span></div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs font-semibold text-slate-700">{formatCrore(project.approvedCost)}</span><span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700">View public details <ArrowRight className="h-3 w-3" /></span></div>
                </button>
              ))}
              {!searching && results.length === 0 && !error && <div className="card col-span-full p-10 text-center"><Search className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No public projects match this search</p><p className="mt-1 text-xs text-slate-500">Try the project ID printed on the site QR board.</p></div>}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-[10px] text-slate-500">DRISHTI public project information · Government infrastructure monitoring · For official enquiries, contact the implementing ministry or agency.</footer>

      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Scan a DRISHTI project QR code">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-4"><div><h2 className="text-sm font-bold text-navy-900">Scan project-site QR</h2><p className="mt-1 text-[10px] text-slate-500">Point the camera at an official DRISHTI project QR code.</p></div><button type="button" onClick={closeScanner} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close QR scanner"><X className="h-4 w-4" /></button></div>
            <div className="relative aspect-square overflow-hidden bg-slate-950"><video ref={videoRef} className="h-full w-full object-cover" muted playsInline /><div className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-teal-300 shadow-[0_0_0_999px_rgba(2,6,23,.42)]"><span className="absolute -left-0.5 -top-0.5 h-7 w-7 border-l-4 border-t-4 border-white" /><span className="absolute -right-0.5 -top-0.5 h-7 w-7 border-r-4 border-t-4 border-white" /><span className="absolute -bottom-0.5 -left-0.5 h-7 w-7 border-b-4 border-l-4 border-white" /><span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 border-b-4 border-r-4 border-white" /></div></div>
            <div className="p-4">{cameraError ? <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{cameraError}</div> : <div className="flex items-center gap-2 text-xs text-slate-600"><Camera className="h-4 w-4 text-teal-700" />Waiting for a project QR code…</div>}<p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" />Video is processed in your browser and is not uploaded.</p></div>
          </div>
        </div>
      )}
    </div>
  );
}
