import { useEffect, useState, type ReactNode } from 'react';
import { authHeaders } from '../authSession';

function isProtectedFile(url: string) {
  const resolved = new URL(url, window.location.href);
  return resolved.origin === window.location.origin && resolved.pathname.startsWith('/api/');
}

export function useAuthenticatedFileUrl(url?: string | null) {
  const [resolved, setResolved] = useState<{ source: string; url: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setResolved(null);
    setError('');
    if (!url || !isProtectedFile(url)) return;
    const controller = new AbortController();
    let blobUrl: string | undefined;
    fetch(url, { headers: authHeaders(), signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('文件不存在或当前账号无权访问');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      blobUrl = URL.createObjectURL(blob);
      setResolved({ source: url, url: blobUrl });
    }).catch((reason: Error) => {
      if (!controller.signal.aborted) setError(reason.message);
    });
    return () => {
      controller.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url]);
  return { url: url && !isProtectedFile(url) ? url : resolved?.source === url ? resolved?.url : undefined, error };
}

export function AuthenticatedFileLink({ href, children, title }: { href: string; children: ReactNode; title?: string }) {
  const file = useAuthenticatedFileUrl(href);
  return <a href={file.url} target="_blank" rel="noreferrer" aria-disabled={!file.url} title={file.error || title}>{children}{file.error ? `（${file.error}）` : ''}</a>;
}
