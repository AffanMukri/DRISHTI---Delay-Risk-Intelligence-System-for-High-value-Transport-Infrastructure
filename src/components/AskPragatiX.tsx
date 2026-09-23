import { useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileText,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { AssistantApi, type AssistantAnswer, type AssistantDocument } from '../services/assistantService';
import { ApiError } from '../lib/apiClient';
import { Badge } from './ui';

interface AskPragatiXProps {
  projectId: string;
  projectName: string;
  backendEnabled: boolean;
  canUploadDocuments: boolean;
}

const SAMPLE_QUESTIONS = [
  'Why is this project considered high risk?',
  'Compare this project with similar projects.',
  'Which projects need attention this month?',
];

function readable(value: unknown): string {
  if (value === null || value === undefined) return 'Not available';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  if (typeof value === 'string') return value.replaceAll('_', ' ');
  if (Array.isArray(value)) return `${value.length} records`;
  return 'Structured evidence';
}

function messageFrom(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Ask DHRISTI could not complete the request.';
}

export function AskPragatiX({ projectId, projectName, backendEnabled, canUploadDocuments }: AskPragatiXProps) {
  const [expanded, setExpanded] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [documents, setDocuments] = useState<AssistantDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [documentType, setDocumentType] = useState('project_report');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadDocuments = async () => {
    if (!backendEnabled) return;
    setDocumentsLoading(true);
    setUploadError(null);
    try {
      setDocuments(await AssistantApi.listDocuments(projectId));
    } catch (loadError) {
      setUploadError(messageFrom(loadError));
    } finally {
      setDocumentsLoading(false);
    }
  };

  const toggleDocuments = () => {
    const next = !showDocuments;
    setShowDocuments(next);
    if (next && documents.length === 0) void loadDocuments();
  };

  const submitQuestion = async (value = question) => {
    const trimmed = value.trim();
    if (!trimmed || !backendEnabled) return;
    setQuestion(trimmed);
    setLoading(true);
    setError(null);
    setAnswer(null);
    setShowEvidence(false);
    try {
      setAnswer(await AssistantApi.ask(trimmed, projectId));
    } catch (askError) {
      setError(messageFrom(askError));
    } finally {
      setLoading(false);
    }
  };

  const uploadDocument = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadTitle.trim()) {
      setUploadError('Choose a PDF and provide a document title.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await AssistantApi.uploadDocument(projectId, uploadTitle.trim(), documentType, file);
      setDocuments(current => [uploaded, ...current.filter(item => item.id !== uploaded.id)]);
      setUploadTitle('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (uploadFailure) {
      setUploadError(messageFrom(uploadFailure));
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-navy-800 text-white"><Sparkles className="h-4 w-4" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-navy-900">Ask DHRISTI</h2>
              <Badge variant="info">Evidence-grounded</Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">Structured analytics and indexed project documents for {projectName}</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 p-5">
          {!backendEnabled && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Ask DHRISTI requires the authenticated FastAPI data source. It does not generate answers from mock project data.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {SAMPLE_QUESTIONS.map(sample => (
              <button key={sample} type="button" className="btn btn-secondary btn-sm text-2xs" onClick={() => void submitQuestion(sample)} disabled={!backendEnabled || loading}>
                {sample}
              </button>
            ))}
          </div>

          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={event => { event.preventDefault(); void submitQuestion(); }}>
            <input
              value={question}
              onChange={event => setQuestion(event.target.value)}
              className="input min-w-0 flex-1 text-xs"
              placeholder="Ask a supported project, risk, intervention, comparison, attention, or document question…"
              maxLength={1200}
              disabled={!backendEnabled || loading}
              aria-label="Ask DHRISTI question"
            />
            <button type="submit" className="btn btn-primary flex items-center justify-center gap-1.5 text-xs" disabled={!backendEnabled || loading || question.trim().length < 3}>
              <Send className="h-3.5 w-3.5" />{loading ? 'Retrieving evidence…' : 'Ask'}
            </button>
          </form>

          {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

          {answer && (
            <div className="space-y-3 rounded border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`h-4 w-4 ${answer.grounded ? 'text-green-600' : 'text-amber-600'}`} />
                  <span className="text-xs font-semibold text-slate-700">{answer.grounded ? 'Grounded answer' : 'Insufficient evidence'}</span>
                  <Badge variant="neutral">{answer.route}</Badge>
                </div>
                <span className="text-2xs text-slate-500">{answer.synthesisStatus === 'ollama' ? `Ollama · ${answer.modelUsed}` : 'Deterministic evidence summary'}</span>
              </div>
              <div className="whitespace-pre-line text-sm leading-6 text-slate-800">{answer.answer}</div>
              {answer.limitations.map(limitation => <p key={limitation} className="text-xs text-amber-700">Limitation: {limitation}</p>)}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                <p className="text-2xs text-slate-500">{answer.disclaimer}</p>
                <button type="button" className="btn btn-secondary btn-sm text-2xs" onClick={() => setShowEvidence(value => !value)} disabled={answer.evidence.length === 0}>
                  <BookOpen className="h-3.5 w-3.5" /> {showEvidence ? 'Hide evidence' : `View evidence (${answer.evidence.length})`}
                </button>
              </div>
              {showEvidence && (
                <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 lg:grid-cols-2">
                  {answer.evidence.map(item => (
                    <article key={item.id} className="rounded border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div><span className="font-mono text-2xs font-bold text-blue-700">[{item.id}]</span><h3 className="mt-0.5 text-xs font-semibold text-slate-800">{item.title}</h3></div>
                        <Badge variant={item.sourceType === 'project_document' ? 'info' : 'neutral'}>{item.sourceType.replaceAll('_', ' ')}</Badge>
                      </div>
                      {item.pageNumber && <p className="mt-1 text-2xs text-slate-500">PDF page {item.pageNumber}{item.relevanceScore != null ? ` · retrieval ${(item.relevanceScore * 100).toFixed(0)}%` : ''}</p>}
                      {item.excerpt && <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600">{item.excerpt}</p>}
                      <dl className="mt-2 space-y-1">
                        {Object.entries(item.facts).slice(0, 6).map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-3 text-2xs"><dt className="text-slate-500">{key.replaceAll('_', ' ')}</dt><dd className="max-w-[60%] text-right font-medium text-slate-700">{readable(value)}</dd></div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <button type="button" className="flex items-center gap-2 text-xs font-semibold text-navy-700" onClick={toggleDocuments} disabled={!backendEnabled}>
              <FileText className="h-4 w-4" />Indexed project documents {showDocuments ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showDocuments && (
              <div className="mt-3 space-y-3">
                {canUploadDocuments && (
                  <div className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
                    <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="input text-xs" aria-label="Project PDF" />
                    <input value={uploadTitle} onChange={event => setUploadTitle(event.target.value)} className="input text-xs" placeholder="Document title" aria-label="Document title" />
                    <select value={documentType} onChange={event => setDocumentType(event.target.value)} className="select text-xs" aria-label="Document type">
                      <option value="project_report">Project report</option>
                      <option value="dpr">Detailed project report</option>
                      <option value="contract">Contract</option>
                      <option value="clearance">Clearance</option>
                      <option value="meeting_minutes">Meeting minutes</option>
                    </select>
                    <button type="button" onClick={() => void uploadDocument()} disabled={uploading} className="btn btn-secondary flex items-center justify-center gap-1.5 text-xs"><Upload className="h-3.5 w-3.5" />{uploading ? 'Extracting & indexing…' : 'Upload PDF'}</button>
                  </div>
                )}
                {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
                {documentsLoading ? <p className="text-xs text-slate-500">Loading indexed documents…</p> : documents.length === 0 ? (
                  <p className="text-xs text-slate-500">No PDF documents have been indexed for this project.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {documents.map(document => (
                      <div key={document.id} className="rounded border border-slate-200 p-3 text-xs">
                        <p className="font-semibold text-slate-800">{document.title}</p>
                        <p className="mt-1 text-2xs text-slate-500">{document.originalFileName} · {document.pageCount} pages · {document.chunkCount} evidence chunks</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
