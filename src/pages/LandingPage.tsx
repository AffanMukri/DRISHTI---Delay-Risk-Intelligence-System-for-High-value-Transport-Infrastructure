import { useEffect, useState } from 'react';
import {
  ArrowRight, BarChart3, BellRing, Building2, Check, ChevronLeft, ChevronRight,
  CircleGauge, Database, FileCheck2, GitBranch, Landmark, LockKeyhole, Menu,
  Network, QrCode, Route, ScanLine, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import TextReveal from '../components/ui/TextReveal';

interface LandingPageProps {
  onSignIn: () => void;
  onPublicEnquiry: () => void;
}

const SIGNAL_SLIDES = [
  {
    eyebrow: 'Early schedule signal',
    title: 'Progress variance detected',
    metric: '−17.4 pp',
    metricLabel: 'behind planned progress',
    tone: 'coral',
    rows: [
      ['Planned progress', '72.0%'],
      ['Actual progress', '54.6%'],
      ['Milestones overdue', '3'],
    ],
    note: 'Threshold crossed · evidence ready for review',
  },
  {
    eyebrow: 'Cost intelligence',
    title: 'Exposure is moving upward',
    metric: '+12.8%',
    metricLabel: 'revised vs. approved cost',
    tone: 'amber',
    rows: [
      ['Approved cost', '₹8,240 Cr'],
      ['Latest revision', '₹9,295 Cr'],
      ['Expenditure', '61.3%'],
    ],
    note: 'Historical trend and source records linked',
  },
  {
    eyebrow: 'Action workflow',
    title: 'Warning converted to action',
    metric: '48 hrs',
    metricLabel: 'to responsible-officer deadline',
    tone: 'teal',
    rows: [
      ['Priority', 'High'],
      ['Workflow', 'Assigned'],
      ['Evidence items', '6 linked'],
    ],
    note: 'Every transition preserved in the audit trail',
  },
] as const;

const CAPABILITIES = [
  {
    number: '01',
    icon: CircleGauge,
    title: 'Portfolio command',
    description: 'See national project health, capital exposure and intervention priorities in one decision surface.',
  },
  {
    number: '02',
    icon: BellRing,
    title: 'Warnings with evidence',
    description: 'Move from stored monthly data to deterministic signals, model context and traceable next actions.',
  },
  {
    number: '03',
    icon: GitBranch,
    title: 'Intervention control',
    description: 'Assign responsibility, enforce deadlines, escalate overdue action and preserve the complete history.',
  },
  {
    number: '04',
    icon: Route,
    title: 'Spatial intelligence',
    description: 'Understand geographic concentrations, state-level exposure and projects without reliable coordinates.',
  },
];

const SECTORS = [
  'Rail & Metro', 'Road Corridors', 'Ports & Logistics', 'Airports',
  'Power & Energy', 'Water Systems', 'Urban Infrastructure', 'Social Infrastructure',
];

export default function LandingPage({ onSignIn, onPublicEnquiry }: LandingPageProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(
      () => setActiveSlide(current => (current + 1) % SIGNAL_SLIDES.length),
      5200,
    );
    return () => window.clearInterval(timer);
  }, []);

  const slide = SIGNAL_SLIDES[activeSlide];
  const moveSlide = (direction: number) => {
    setActiveSlide(current => (current + direction + SIGNAL_SLIDES.length) % SIGNAL_SLIDES.length);
  };
  const scrollToCapabilities = () => {
    document.getElementById('capabilities')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="landing-page min-h-screen text-slate-900">
      <header className="landing-header" aria-label="Public website header">
        <div className="landing-container flex h-[76px] items-center justify-between gap-6">
          <a href="#top" className="flex items-center gap-3" aria-label="DHRISTI home">
            <span className="landing-brand-mark">D</span>
            <span>
              <span className="block text-[15px] leading-none font-extrabold tracking-[0.12em] text-navy-900">DHRISTI</span>
              <span className="hidden sm:block text-[9px] leading-none mt-1.5 font-semibold tracking-[0.12em] uppercase text-slate-500">Infrastructure intelligence system</span>
            </span>
          </a>

          <nav className="hidden lg:flex items-center gap-7 text-xs font-semibold text-slate-600" aria-label="Public navigation">
            <button type="button" onClick={onPublicEnquiry} className="landing-nav-link inline-flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5" /> Project enquiry</button>
            <a href="#capabilities" className="landing-nav-link">Capabilities</a>
            <a href="#workflow" className="landing-nav-link">How it works</a>
            <a href="#coverage" className="landing-nav-link">Coverage</a>
            <a href="#assurance" className="landing-nav-link">Governance</a>
          </nav>

          <div className="hidden sm:flex items-center gap-3">
            <span className="hidden xl:inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Secure role-based access
            </span>
            <button type="button" onClick={onSignIn} className="landing-signin-btn">
              Sign in <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            className="sm:hidden p-2 rounded-lg border border-slate-200 text-navy-800"
            onClick={() => setMobileMenuOpen(value => !value)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-slate-200 bg-white px-5 py-4 shadow-lg">
            <nav className="grid gap-1 text-sm font-semibold text-slate-700">
              {['capabilities', 'workflow', 'coverage', 'assurance'].map(item => (
                <a key={item} href={`#${item}`} onClick={() => setMobileMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-navy-50 capitalize">{item === 'workflow' ? 'How it works' : item}</a>
              ))}
              <button type="button" onClick={onPublicEnquiry} className="rounded-lg px-3 py-2.5 text-left hover:bg-navy-50">Public project enquiry</button>
              <button type="button" onClick={onSignIn} className="landing-signin-btn mt-2">Sign in <ArrowRight className="w-4 h-4" /></button>
            </nav>
          </div>
        )}
      </header>

      <main id="top">
        <section className="landing-hero">
          <div className="landing-hero-orb landing-hero-orb--one" />
          <div className="landing-hero-orb landing-hero-orb--two" />
          <div className="landing-container relative z-10 grid lg:grid-cols-[1.04fr_.96fr] items-center gap-12 py-16 lg:py-24">
            <div>
              <div className="landing-kicker"><Landmark className="w-3.5 h-3.5" /> Government infrastructure intelligence</div>
              <h1 className="landing-hero-title mt-6">
                <TextReveal text="See risk earlier." className="block" />
                <TextReveal text="Move projects forward." className="landing-hero-accent block" delay={100} />
              </h1>
              <p className="mt-6 text-base sm:text-lg leading-relaxed text-slate-600 max-w-2xl">
                DHRISTI turns monthly project records into explainable risk intelligence,
                early warnings and accountable intervention workflows for high-value infrastructure.
              </p>
              <p className="mt-4 text-[11px] uppercase tracking-[0.12em] font-bold text-navy-600 max-w-xl leading-relaxed">
                Delay &amp; Risk Intelligence System for High-value Transport &amp; Infrastructure
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mt-8">
                <button type="button" onClick={onSignIn} className="landing-primary-btn">
                  Enter secure workspace <ArrowRight className="w-4 h-4" />
                </button>
                <button type="button" onClick={onPublicEnquiry} className="landing-secondary-btn">
                  <ScanLine className="h-4 w-4" /> Explore a public project
                </button>
              </div>
              <button type="button" onClick={scrollToCapabilities} className="mt-4 text-xs font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4 hover:text-navy-900">Explore platform capabilities</button>
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-8 text-xs text-slate-500">
                {['Evidence-linked', 'Role-secured', 'Audit-ready'].map(item => (
                  <span key={item} className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-teal-600" />{item}</span>
                ))}
              </div>
            </div>

            <div className="landing-signal-shell" aria-live="polite">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-teal-300 shadow-[0_0_12px_rgba(94,234,212,.7)]" />
                  <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-indigo-100">Illustrative intelligence preview</span>
                </div>
                <span className="text-[10px] text-indigo-200/65">0{activeSlide + 1} / 0{SIGNAL_SLIDES.length}</span>
              </div>
              <div key={activeSlide} className="landing-signal-slide p-5 sm:p-6">
                <div className={`landing-signal-tone landing-signal-tone--${slide.tone}`}>
                  <p className="text-[10px] uppercase tracking-[0.14em] font-bold">{slide.eyebrow}</p>
                </div>
                <h2 className="text-xl font-bold text-white mt-4">{slide.title}</h2>
                <div className="flex items-end gap-3 mt-5">
                  <p className="text-4xl sm:text-5xl font-bold tracking-tight text-white tabular-nums">{slide.metric}</p>
                  <p className="text-xs text-indigo-100/65 pb-1.5 max-w-[9rem]">{slide.metricLabel}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-7">
                  {slide.rows.map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/[0.055] p-3">
                      <p className="text-[9px] leading-tight text-indigo-100/55">{label}</p>
                      <p className="text-sm font-semibold text-white mt-1.5 tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-white/10 bg-black/10 px-3.5 py-3 flex items-center gap-2.5 text-[11px] text-indigo-50/80">
                  <FileCheck2 className="w-4 h-4 text-teal-300 shrink-0" /> {slide.note}
                </div>
              </div>
              <div className="flex items-center justify-between px-5 pb-5">
                <div className="flex gap-1.5">
                  {SIGNAL_SLIDES.map((item, index) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setActiveSlide(index)}
                      className={`h-1.5 rounded-full transition-all ${activeSlide === index ? 'w-8 bg-teal-300' : 'w-3 bg-white/25 hover:bg-white/45'}`}
                      aria-label={`Show preview ${index + 1}: ${item.title}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => moveSlide(-1)} className="landing-slider-btn" aria-label="Previous preview"><ChevronLeft className="w-4 h-4" /></button>
                  <button type="button" onClick={() => moveSlide(1)} className="landing-slider-btn" aria-label="Next preview"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-marquee" aria-label="Infrastructure sectors supported">
          <div className="landing-marquee-track">
            {[...SECTORS, ...SECTORS].map((sector, index) => (
              <span key={`${sector}-${index}`}><span className="landing-marquee-dot" />{sector}</span>
            ))}
          </div>
        </section>

        <section id="capabilities" className="landing-section">
          <div className="landing-container">
            <div className="landing-section-heading">
              <div><p className="landing-kicker"><Sparkles className="w-3.5 h-3.5" /> Decision capability</p><h2>One connected view from data to action.</h2></div>
              <p>DHRISTI keeps facts, calculations, predictions and human decisions visibly separate—then connects them through evidence.</p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mt-10">
              {CAPABILITIES.map(item => {
                const Icon = item.icon;
                return (
                  <article key={item.number} className="landing-capability-card">
                    <div className="flex items-center justify-between">
                      <span className="landing-capability-icon"><Icon className="w-5 h-5" /></span>
                      <span className="text-[10px] font-bold tracking-[0.12em] text-slate-400">{item.number} / 04</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="workflow" className="landing-section landing-section--tinted">
          <div className="landing-container grid lg:grid-cols-[.88fr_1.12fr] gap-12 items-center">
            <div>
              <p className="landing-kicker"><Network className="w-3.5 h-3.5" /> Intelligence workflow</p>
              <h2 className="landing-display-heading mt-4">Every conclusion should be traceable.</h2>
              <p className="text-sm text-slate-600 leading-relaxed mt-5 max-w-lg">DHRISTI is designed for scrutiny. Numerical facts originate in stored records, analytics remain deterministic, model signals carry versions, and interventions retain ownership.</p>
              <button type="button" onClick={onSignIn} className="landing-text-link mt-6">Open the Command Center <ArrowRight className="w-4 h-4" /></button>
            </div>
            <div className="landing-workflow" role="img" aria-label="Source data flows to derived signals, predictions, warnings and accountable interventions">
              {[
                { icon: Database, title: 'Source data', copy: 'Monthly CUF and project records' },
                { icon: BarChart3, title: 'Derived signal', copy: 'Cost, schedule and progress variance' },
                { icon: BellRing, title: 'Warning', copy: 'Threshold, evidence and severity' },
                { icon: ShieldCheck, title: 'Intervention', copy: 'Owner, deadline and audit history' },
              ].map(({ icon: StepIcon, title, copy }, index) => {
                return <div key={title} className="landing-workflow-step"><span><StepIcon className="w-4 h-4" /></span><div><p>{title}</p><small>{copy}</small></div>{index < 3 && <ArrowRight className="landing-workflow-arrow" />}</div>;
              })}
            </div>
          </div>
        </section>

        <section id="coverage" className="landing-section">
          <div className="landing-container">
            <div className="landing-section-heading">
              <div><p className="landing-kicker"><Building2 className="w-3.5 h-3.5" /> Portfolio coverage</p><h2>Built for varied public infrastructure portfolios.</h2></div>
              <p>Common monitoring language across sectors, with project-specific history, milestones, geography and implementation context.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-9">
              {SECTORS.map((sector, index) => <div key={sector} className="landing-sector-card"><span>0{index + 1}</span><p>{sector}</p><ArrowRight className="w-4 h-4" /></div>)}
            </div>
          </div>
        </section>

        <section id="assurance" className="landing-section pt-0">
          <div className="landing-container">
            <div className="landing-assurance">
              <div>
                <p className="landing-kicker landing-kicker--light"><LockKeyhole className="w-3.5 h-3.5" /> Governance by design</p>
                <h2>Trusted access. Transparent intelligence.</h2>
                <p>Role-based permissions, database-enforced authorization, append-oriented audit records and explicit data-confidence reporting support responsible decisions.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {['Supabase authentication', 'Row Level Security', 'Evidence-linked outputs', 'Auditable interventions'].map(item => <div key={item}><ShieldCheck className="w-4 h-4" /><span>{item}</span></div>)}
              </div>
            </div>
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-container text-center relative z-10">
            <p className="landing-kicker justify-center"><CircleGauge className="w-3.5 h-3.5" /> Decision intelligence for delivery</p>
            <h2>Turn the next reporting cycle into action.</h2>
            <p>Enter the secure DHRISTI workspace to review portfolios, investigate risk and manage interventions.</p>
            <button type="button" onClick={onSignIn} className="landing-primary-btn mt-7">Sign in to DHRISTI <ArrowRight className="w-4 h-4" /></button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container grid md:grid-cols-[1.4fr_.6fr_.6fr] gap-10 py-12">
          <div>
            <div className="flex items-center gap-3"><span className="landing-brand-mark landing-brand-mark--dark">D</span><span className="font-extrabold tracking-[0.12em]">DHRISTI</span></div>
            <p className="text-xs text-slate-400 leading-relaxed mt-4 max-w-md">Delay &amp; Risk Intelligence System for High-value Transport &amp; Infrastructure. Built for evidence-led monitoring and accountable public-project delivery.</p>
          </div>
          <div><h3>Platform</h3><a href="#capabilities">Capabilities</a><a href="#workflow">Evidence workflow</a><a href="#coverage">Coverage</a></div>
          <div><h3>Access</h3><button type="button" onClick={onPublicEnquiry}>Public project enquiry</button><button type="button" onClick={onSignIn}>Secure sign in</button><a href="#assurance">Governance</a><a href="#top">Back to top</a></div>
        </div>
        <div className="border-t border-white/10"><div className="landing-container flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-4 text-[10px] text-slate-500"><span>© 2026 DHRISTI · Infrastructure &amp; Project Monitoring Division</span><span>Government monitoring workspace · Authorized access only</span></div></div>
      </footer>
    </div>
  );
}
