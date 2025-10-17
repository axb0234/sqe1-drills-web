'use client';

import { useState } from 'react';

export type Item = {
  id: string;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  source?: string;
};

export default function QuestionCard({ item, onNext }:{ item: Item; onNext: ()=>void }) {
  const [sel, setSel] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = sel === item.correctIndex;

  return (
    <div className="card shadow-sm">
      <div className="card-body">
        <div className="d-flex justify-content-between mb-2">
          <span className="badge text-bg-secondary">Intro to Law</span>
        </div>
        <p className="lead">{item.stem}</p>
        <div className="d-grid gap-2">
          {item.options.map((opt, i) => {
            const state = submitted ? (i === item.correctIndex ? 'correct' : (i === sel ? 'incorrect' : '')) : '';
            return (
              <button key={i}
                className={`quiz-option text-start btn ${state ? '' : 'btn-light' } ${state}`}
                onClick={() => !submitted && setSel(i)}
                disabled={submitted}
              >
                {opt}
              </button>
            );
          })}
        </div>
        <div className="d-flex gap-2 mt-3">
          {!submitted && <button className="btn btn-primary" disabled={sel===null} onClick={()=>setSubmitted(true)}>Submit</button>}
          {submitted && (
            <>
              <div className={`alert ${correct ? 'alert-success' : 'alert-danger'} flex-grow-1 mb-0`}>
                {correct ? 'Correct' : 'Incorrect'}{item.explanation ? ` — ${item.explanation}` : ''}
                {item.source && <div className="small text-muted mt-1">Source: {item.source}</div>}
              </div>
              <button className="btn btn-outline-secondary ms-auto" onClick={onNext}>Next</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}