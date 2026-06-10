import { useEffect, useState } from 'react';
import { BriefcaseBusiness, Download, ExternalLink, FileText, FolderOpen, HeartPulse, LoaderCircle, Trash2, Upload, X } from 'lucide-react';
import type { Employee, EmployeeDocument } from '../types';
import { deleteEmployeeDocument, employeeDocumentUrl, fetchEmployeeDocuments, uploadEmployeeDocuments } from '../utils/data';
import { useLanguage } from '../contexts/LanguageContext';

type UploadCategory = 'contract' | 'other';

export function EmployeeDocumentsModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { t, formatDate } = useLanguage();
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [category, setCategory] = useState<UploadCategory>('contract');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const [error, setError] = useState('');

  const loadDocuments = async () => {
    setLoading(true);
    setError('');
    try {
      setDocuments(await fetchEmployeeDocuments(employee.id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('documentsLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [employee.id]);

  const handleUpload = async () => {
    if (!selectedFiles.length) return;
    setUploading(true);
    setError('');
    try {
      await uploadEmployeeDocuments(employee.id, category, selectedFiles);
      setSelectedFiles([]);
      setInputKey((current) => current + 1);
      await loadDocuments();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t('documentsUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (document: EmployeeDocument) => {
    setDeletingId(document.id);
    setError('');
    try {
      await deleteEmployeeDocument(employee.id, document);
      setConfirmDeleteId('');
      await loadDocuments();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('documentDeleteFailed'));
    } finally {
      setDeletingId('');
    }
  };

  const sections: Array<{
    category: EmployeeDocument['category'];
    title: string;
    description: string;
    icon: typeof FileText;
    accent: string;
  }> = [
    {
      category: 'contract',
      title: t('contractDocuments'),
      description: t('contractDocumentsHelp'),
      icon: BriefcaseBusiness,
      accent: 'from-emerald-300 to-teal-700 shadow-emerald-500/35',
    },
    {
      category: 'medical',
      title: t('medicalDocumentHistory'),
      description: t('medicalDocumentHistoryHelp'),
      icon: HeartPulse,
      accent: 'from-rose-300 to-red-700 shadow-rose-500/35',
    },
    {
      category: 'other',
      title: t('otherDocuments'),
      description: t('otherDocumentsHelp'),
      icon: FolderOpen,
      accent: 'from-cyan-300 to-blue-700 shadow-cyan-500/35',
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-cyan-950/40 px-4 py-8 backdrop-blur-sm" onMouseDown={onClose}>
      <section
        className="aero-glass max-h-[calc(100vh-4rem)] w-full max-w-6xl overflow-y-auto rounded-3xl border-2 border-white/65 p-6 shadow-2xl shadow-cyan-950/35"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-cyan-950 dark:text-cyan-100">{t('employeeDocumentArchive')}</h2>
            <p className="mt-1 font-bold text-cyan-700 dark:text-cyan-300">{employee.name}</p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-xl border border-white/70 bg-white/60 p-2 text-cyan-800 shadow-lg transition hover:scale-105 dark:bg-cyan-950/55 dark:text-cyan-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="mt-5 rounded-2xl border-2 border-white/70 bg-gradient-to-br from-white/70 to-cyan-100/55 p-4 shadow-xl shadow-cyan-500/15 dark:border-cyan-400/25 dark:from-cyan-950/70 dark:to-blue-950/45">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-cyan-700 dark:text-cyan-200" />
            <h3 className="font-black text-cyan-950 dark:text-cyan-100">{t('uploadEmployeeDocuments')}</h3>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[14rem_1fr_auto] lg:items-center">
            <select value={category} onChange={(event) => setCategory(event.target.value as UploadCategory)} className="aero-input cursor-pointer">
              <option value="contract">{t('contractDocuments')}</option>
              <option value="other">{t('otherDocuments')}</option>
            </select>
            <label className="cursor-pointer rounded-xl border-2 border-dashed border-cyan-300/70 bg-white/50 px-4 py-3 text-sm font-bold text-cyan-800 transition hover:bg-cyan-50/80 dark:border-cyan-500/40 dark:bg-cyan-950/35 dark:text-cyan-100 dark:hover:bg-cyan-900/45">
              <input key={inputKey} type="file" multiple className="hidden" onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))} />
              {selectedFiles.length ? t('filesSelected', { count: selectedFiles.length }) : t('chooseDocuments')}
            </label>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFiles.length || uploading}
              className="cursor-pointer rounded-xl border-2 border-white/65 bg-gradient-to-b from-emerald-300 to-emerald-700 px-5 py-3 font-black text-white shadow-lg shadow-emerald-500/30 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {uploading ? t('uploading') : t('upload')}
            </button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl border border-red-300/60 bg-red-50/85 px-4 py-3 text-sm font-black text-red-700 dark:border-red-500/30 dark:bg-red-950/35 dark:text-red-200">{error}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-cyan-700 dark:text-cyan-200">
            <LoaderCircle className="h-7 w-7 animate-spin" />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {sections.map((section) => (
              <DocumentSection
                key={section.category}
                title={section.title}
                description={section.description}
                icon={section.icon}
                accent={section.accent}
                documents={documents.filter((document) => document.category === section.category)}
                deletingId={deletingId}
                confirmDeleteId={confirmDeleteId}
                setConfirmDeleteId={setConfirmDeleteId}
                handleDelete={handleDelete}
                formatDate={formatDate}
                t={t}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DocumentSection({
  title,
  description,
  icon: Icon,
  accent,
  documents,
  deletingId,
  confirmDeleteId,
  setConfirmDeleteId,
  handleDelete,
  formatDate,
  t,
}: {
  title: string;
  description: string;
  icon: typeof FileText;
  accent: string;
  documents: EmployeeDocument[];
  deletingId: string;
  confirmDeleteId: string;
  setConfirmDeleteId: (id: string) => void;
  handleDelete: (document: EmployeeDocument) => void;
  formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-200/70 bg-white/45 shadow-lg shadow-cyan-500/10 dark:border-cyan-600/25 dark:bg-cyan-950/25">
      <div className="flex items-center gap-3 border-b border-cyan-200/60 bg-white/45 px-4 py-3 dark:border-cyan-700/35 dark:bg-cyan-900/25">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl border border-white/70 bg-gradient-to-b text-white shadow-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-black text-cyan-950 dark:text-cyan-100">{title}</h3>
          <p className="text-xs font-bold text-cyan-700 dark:text-cyan-300">{description}</p>
        </div>
      </div>
      <div className="space-y-2 p-3">
        {documents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-cyan-300/60 bg-white/35 px-4 py-3 text-sm font-bold text-cyan-700 dark:border-cyan-600/35 dark:bg-cyan-950/20 dark:text-cyan-300">{t('noDocumentsInSection')}</p>
        ) : documents.map((document) => {
          const url = employeeDocumentUrl(document);
          const isDeleting = deletingId === document.id;
          const asksForConfirmation = confirmDeleteId === document.id;
          return (
            <div key={`${document.source}-${document.id}`} className="rounded-xl border border-cyan-200/70 bg-white/65 px-3 py-3 shadow-sm dark:border-cyan-700/35 dark:bg-cyan-950/35">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-black text-cyan-950 dark:text-cyan-100">{document.title}</p>
                  <p className="truncate text-xs font-bold text-cyan-700 dark:text-cyan-300">{document.fileName} · {formatDate(new Date(document.createdAt))}</p>
                </div>
                {asksForConfirmation ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-red-700 dark:text-red-200">{t('deleteDocumentConfirm')}</span>
                    <button type="button" disabled={isDeleting} onClick={() => handleDelete(document)} className="cursor-pointer rounded-lg bg-gradient-to-b from-red-400 to-red-700 px-3 py-2 text-xs font-black text-white shadow-md disabled:opacity-50">{t('delete')}</button>
                    <button type="button" onClick={() => setConfirmDeleteId('')} className="cursor-pointer rounded-lg border border-cyan-300/70 bg-white/70 px-3 py-2 text-xs font-black text-cyan-800 shadow-md dark:bg-cyan-950/55 dark:text-cyan-100">{t('cancel')}</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <a href={url} target="_blank" rel="noreferrer" className="cursor-pointer rounded-lg border border-white/70 bg-gradient-to-b from-cyan-300 to-blue-700 px-3 py-2 text-xs font-black text-white shadow-md transition hover:scale-105">
                      <ExternalLink className="mr-1 inline h-3.5 w-3.5" />{t('viewInBrowser')}
                    </a>
                    <a href={url} download={document.fileName} className="cursor-pointer rounded-lg border border-white/70 bg-gradient-to-b from-emerald-300 to-emerald-700 px-3 py-2 text-xs font-black text-white shadow-md transition hover:scale-105">
                      <Download className="mr-1 inline h-3.5 w-3.5" />{t('download')}
                    </a>
                    <button type="button" onClick={() => setConfirmDeleteId(document.id)} className="cursor-pointer rounded-lg border border-white/70 bg-gradient-to-b from-rose-300 to-red-700 px-3 py-2 text-xs font-black text-white shadow-md transition hover:scale-105">
                      <Trash2 className="mr-1 inline h-3.5 w-3.5" />{t('delete')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
