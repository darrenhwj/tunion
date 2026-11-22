import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { DemoResource } from '../demo/data';
import { loadFile } from '../demo/files';
import Button from './Button';

type Preview = { kind: 'image' | 'pdf' | 'unsupported'; url?: string; size: number; type: string };

async function inspectFile(file: Blob, filename: string): Promise<Preview> {
  const type = file.type.split(';')[0];
  const info = { size: file.size, type: type || 'Unknown file type' };
  if (type === 'application/pdf' || /\.pdf$/i.test(filename)) {
    const header = await file.slice(0, 1024).text();
    if (!header.includes('%PDF-')) throw new Error('This file does not contain a valid PDF header.');
    return { ...info, kind: 'pdf', url: URL.createObjectURL(new Blob([file], { type: 'application/pdf' })) };
  }
  if (type.startsWith('image/')) return { ...info, kind: 'image', url: URL.createObjectURL(file) };
  return { ...info, kind: 'unsupported' };
}

export default function ResourcePreview({ resource, close, download }: { resource: DemoResource; close: () => void; download: ReactNode }) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const { url, filename } = resource;
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    const controller = new AbortController();

    async function prepare() {
      if (!url || !filename) throw new Error('This file is unavailable.');
      let file: Blob;
      if (url.startsWith('local-file:')) {
        file = await loadFile(url);
      } else if (url.startsWith('data:')) {
        file = await (await fetch(url, { signal: controller.signal })).blob();
      } else {
        return { kind: 'unsupported', type: 'Linked file', size: 0 } as const;
      }
      return inspectFile(file, filename);
    }

    prepare().then(
      (result) => {
        if (cancelled) {
          if ('url' in result && result.url) URL.revokeObjectURL(result.url);
          return;
        }
        objectUrl = 'url' in result ? result.url : undefined;
        setPreview(result);
      },
      (failure: unknown) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'The preview could not be loaded.');
      },
    );
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, filename]);

  return <dialog ref={dialog} onCancel={close} aria-labelledby={titleId}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-xl border border-line bg-surface p-4 text-ink-900 shadow-xl backdrop:bg-ink-900/50 sm:p-6">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 id={titleId} className="min-w-0 break-words text-lg font-bold">{resource.title}</h2>
      <Button variant="secondary" onClick={close}>Close preview</Button>
    </div>
    <p className="mb-3 break-words text-sm text-ink-500">{filename}{preview && ' · ' + preview.type + (preview.size ? ' · ' + new Intl.NumberFormat().format(preview.size) + ' bytes' : '')}</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p>
      : !preview ? <p role="status" className="text-sm">Preparing preview…</p>
      : preview.kind === 'image' ? <img src={preview.url} alt={resource.title} className="mx-auto max-h-[60dvh] max-w-full rounded object-contain" onError={() => setError('This image could not be displayed.')} />
      : preview.kind === 'pdf' ? <iframe title={resource.title + ' PDF preview'} src={preview.url} className="h-[60dvh] w-full rounded border border-line" onError={() => setError('This PDF could not be displayed.')} />
      : <p className="text-sm text-ink-700">Preview is unavailable for this file type. Download the file to open it.</p>}
    <div className="mt-4">{download}</div>
  </dialog>;
}
