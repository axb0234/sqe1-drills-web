'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import QuestionCard, { Item } from '../../../components/QuestionCard';
import { SAMPLE } from '../../../lib/sampleQuestions';

export default function Drill() {
  const params = useParams<{ sid: string }>();
  const sp = useSearchParams();
  const r = useRouter();
  const n = Number(sp.get('n') || '10');

  const items: Item[] = useMemo(() => {
    const arr: Item[] = [];
    while (arr.length < n) arr.push(...SAMPLE.map(x => ({...x, id: x.id + '-' + arr.length})));
    return arr.slice(0, n);
  }, [n]);

  const [idx, setIdx] = useState(0);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [idx]);

  const done = idx >= items.length;

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex justify-content-between align-items-center">
        <span className="badge text-bg-secondary">Q {Math.min(idx+1, items.length)} of {items.length}</span>
        <button className="btn btn-outline-secondary btn-sm" onClick={()=>r.push('/start')}>End drill</button>
      </div>
      {!done ? (
        <QuestionCard item={items[idx]} onNext={()=>setIdx(idx+1)} />
      ) : (
        <div className="card">
          <div className="card-body">
            <h5 className="card-title">Summary</h5>
            <p>Your answers have been recorded (placeholder).</p>
          </div>
        </div>
      )}
    </div>
  );
}