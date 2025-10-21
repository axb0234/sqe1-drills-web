'use client';
import { useEffect, useState } from 'react';
import Timer from '../../../components/Timer'; // relative path from /app/drill/[sid]
import { useParams } from 'next/navigation';

type Option = { label: string; text: string; rationale?: string };
type QuestionPayload = { id: number; stem: string; topic?: string; options: Option[]; correctIndex: number; explanation?: string; source?: any; };
type NextResp = { done: boolean; progress?: { index: number; total: number }; question?: QuestionPayload; summary?: { total: number; correct: number; totalTimeSec: number; avgTimeSec: number } };

export default function DrillRunner() {
  const { sid } = useParams<{ sid: string }>();
  const [payload, setPayload] = useState<NextResp|null>(null);
  const [picked, setPicked] = useState<number|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [locked, setLocked] = useState<boolean>(false);

  async function loadNext() {
    setPicked(null); setRevealed(false); setElapsedMs(0); setLocked(false);
    const res = await fetch(`/api/drills/${sid}/next`);
    setPayload(await res.json());
  }
  useEffect(() => { loadNext(); }, [sid]);

  async function submit() {
    if (payload?.done || picked == null || !payload?.progress || !payload?.question) return;
    setSubmitting(true); setLocked(true);
    const res = await fetch(`/api/drills/${sid}/answer`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ questionId: payload.question.id, orderIndex: payload.progress.index, answerIndex: picked, elapsedMs })
    });
    await res.json();
    setSubmitting(false); setRevealed(true);
  }

  if (!payload) return <div className="container my-5">Loading…</div>;
  if (payload.done) {
    const s = payload.summary!;
    return (
      <div className="container my-5">
        <h3>Drill Summary</h3>
        <div className="row g-3">
          <div className="col-md-3"><div className="card p-3"><b>Total</b><div>{s.total}</div></div></div>
          <div className="col-md-3"><div className="card p-3"><b>Correct</b><div>{s.correct}</div></div></div>
          <div className="col-md-3"><div className="card p-3"><b>Total time</b><div>{s.totalTimeSec}s</div></div></div>
          <div className="col-md-3"><div className="card p-3"><b>Avg / Q</b><div>{s.avgTimeSec}s</div></div></div>
        </div>
        <a href="/dashboard" className="btn btn-outline-primary mt-4">Back to Dashboard</a>
      </div>
    );
  }

  const q = payload.question!;
  const idx = payload.progress!.index;
  const total = payload.progress!.total;

  return (
    <div className="container my-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div><strong>Question {idx} / {total}</strong>{q.topic ? <span className="text-muted ms-2">· {q.topic}</span> : null}</div>
      </div>

      <div className="card p-3 mb-3">
        <div className="mb-3" style={{whiteSpace:'pre-wrap'}}>{q.stem}</div>
        <div className="list-group">
          {q.options.map((o, i) => {
            const active = picked === i;
            const showCorrect = revealed && i === q.correctIndex;
            const showWrong = revealed && active && i !== q.correctIndex;
            const cls = ['list-group-item list-group-item-action', active ? 'active' : '', showCorrect ? 'border border-success' : '', showWrong ? 'border border-danger' : ''].join(' ');
            return (
              <button key={i} disabled={revealed || locked} onClick={()=>setPicked(i)} className={cls}>
                <b className="me-2">{o.label}.</b> {o.text}
              </button>
            );
          })}
        </div>

        <div className="d-flex gap-2 mt-3">
          {!revealed ? (
            <button className="btn btn-primary" disabled={picked==null || submitting} onClick={submit}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          ) : (
            <>
              <span className={`badge ${picked===q.correctIndex?'bg-success':'bg-danger'}`}>
                {picked===q.correctIndex ? 'Correct' : 'Incorrect'}
              </span>
              <button className="btn btn-outline-secondary" onClick={loadNext}>Next</button>
            </>
          )}
        </div>

        {revealed && q.explanation && (
          <div className="alert alert-info mt-3">
            <b>Explanation:</b>
            <div style={{whiteSpace:'pre-wrap'}}>{q.explanation}</div>
          </div>
        )}
      </div>

      <Timer running={!revealed && !locked} onTick={setElapsedMs}/>
      {revealed && <div className="position-fixed bottom-0 end-0 m-3 badge bg-dark">Time: {Math.round(elapsedMs/100)/10}s</div>}
    </div>
  );
}
