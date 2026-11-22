import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ResourceSummary } from '@tunion/shared';
import { apiResponse } from '../lib/api';
import { errorMessage } from '../lib/useApiQuery';
import Button from './Button';

type Preview = { kind: 'image' | 'pdf'; url: string } | { kind: 'text'; text: string };

export default function ResourcePreview({ resource, close, download }: { resource: ResourceSummary; close: () => void; download: ReactNode }) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const { previewUrl, file } = resource;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (!previewUrl) return;
    let objectUrl: string | undefined;
    const controller = new AbortController();
    async function prepare(url: string) {
      try {
        const response = await apiResponse(url, { signal: controller.signal });
        const blob = await response.blob();
        const type = blob.type.split(';')[0];
        if (type === 'text/plain') {
          const text = await blob.text();
          if (!controller.signal.aborted) setPreview({ kind: 'text', text });
        } else if (!controller.signal.aborted) {
          if (type !== 'application/pdf' && !type.startsWith('image/')) throw new Error('This file type cannot be previewed.');
          objectUrl = URL.createObjectURL(blob);
          setPreview({ kind: type === 'application/pdf' ? 'pdf' : 'image', url: objectUrl });
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      }
    }
    void prepare(previewUrl);
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewUrl]);

  return <dialog ref={dialog} onCancel={close} aria-labelledby={titleId}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-xl border border-line bg-surface p-4 text-ink-900 shadow-xl backdrop:bg-ink-900/50 sm:p-6">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 id={titleId} className="min-w-0 break-words text-lg font-bold">{resource.title}</h2>
      <Button variant="secondary" onClick={close}>Close preview</Button>
    </div>
    {file && <p className="mb-3 break-words text-sm text-ink-500">{file.filename} · {file.mimeType} · {new Intl.NumberFormat().format(file.sizeBytes)} bytes</p>}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p>
      : !previewUrl ? <p className="text-sm text-ink-700">Preview is unavailable for this file type. Download the file to open it.</p>
      : !preview ? <p role="status" className="text-sm">Preparing preview…</p>
      : preview.kind === 'image' ? <img src={preview.url} alt={resource.title} className="mx-auto max-h-[60dvh] max-w-full rounded object-contain" onError={() => setError('This image could not be displayed.')} />
      : preview.kind === 'text' ? <pre className="max-h-[60dvh] overflow-y-auto whitespace-pre-wrap break-words rounded bg-canvas p-3 text-sm">{preview.text}</pre>
      : <iframe title={resource.title + ' PDF preview'} src={preview.url} className="h-[60dvh] w-full rounded border border-line" onError={() => setError('This PDF could not be displayed.')} />}
    <div className="mt-4">{download}</div>
  </dialog>;
}
