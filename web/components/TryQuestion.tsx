'use client';
import { useState } from 'react';
import QuestionCard, { Item } from './QuestionCard';

const item: Item = {
  id: 'demo1',
  stem: 'Which statement best describes the ratio decidendi of a case?',
  options: [
    'A judge’s personal opinion unrelated to the decision',
    'The legal principle necessary for the decision',
    'A summary produced by law reporters',
    'A dissenting view from a lower court',
    'The parties’ agreed facts'
  ],
  correctIndex: 1,
  explanation: 'Ratio decidendi is the legal principle essential to the outcome.',
  source: 'Intro to Law, Precedent overview'
};

export default function TryQuestion() {
  const [key, setKey] = useState(0);
  return (
    <div className="d-flex flex-column gap-2">
      <QuestionCard key={key} item={item} onNext={() => { /* demo only */ }} />
      <button className="btn btn-link p-0" onClick={() => setKey(k => k+1)}>Try another like this</button>
    </div>
  );
}
