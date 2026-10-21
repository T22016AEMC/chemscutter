import { useEffect, useRef, useState } from 'react';
import type { DepictionRequest, DepictionResponse } from '../../worker/depiction';
export function useDepictions() {
  const [images, setImages] = useState<Record<string, { image: string; error?: string }>>({});
  const worker = useRef<Worker | null>(null);
  const requests = useRef(new Map<number, string>());
  const requested = useRef(new Set<string>());
  const sequence = useRef(0);
  useEffect(() => () => { worker.current?.terminate(); }, []);
  function request(smiles: string) {
    if (!smiles || requested.current.has(smiles)) return;
    requested.current.add(smiles);
    try {
      if (!worker.current) {
        worker.current = new Worker(new URL('../../worker/depiction.worker.ts', import.meta.url), { type: 'module' });
        worker.current.onmessage = (event: MessageEvent<DepictionResponse>) => {
          const key = requests.current.get(event.data.id);
          if (!key || event.data.type !== 'depiction') return;
          requests.current.delete(event.data.id);
          setImages((current) => ({ ...current, [key]: event.data }));
        };
        const failed = () => {
          setImages((current) => ({ ...current, ...Object.fromEntries([...requests.current.values()].map((key) => [key, { image: '', error: '結構繪圖中斷，請重新整理後再試。' }])) }));
          requests.current.clear();
          worker.current?.terminate();
          worker.current = null;
        };
        worker.current.onerror = failed;
        worker.current.onmessageerror = failed;
      }
      const id = ++sequence.current;
      requests.current.set(id, smiles);
      worker.current.postMessage({ type: 'depict', id, smiles } satisfies DepictionRequest);
    } catch { setImages((current) => ({ ...current, [smiles]: { image: '', error: '結構繪圖無法啟動。' } })); }
  }
  return { images, request };
}
export type Depictions = ReturnType<typeof useDepictions>;
export default function Depiction({ smiles, depictions, large = false }: { smiles: string; depictions: Depictions; large?: boolean }) {
  const target = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!target.current) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } });
    observer.observe(target.current);
    return () => observer.disconnect();
  }, []);
  const { request } = depictions;
  useEffect(() => { if (visible) request(smiles); }, [visible, smiles, request]);
  const value = depictions.images[smiles];
  return <div ref={target} className={large ? 'depiction large' : 'depiction'}>
    {!smiles ? <small>未提供結構</small> : value?.image ? <img src={value.image} alt="引擎提供之候選結構" loading="lazy" />
      : <small>{value?.error || (visible ? '結構載入中…' : '捲動至此列後載入結構')}</small>}
  </div>;
}
