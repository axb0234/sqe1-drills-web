import { Item } from '../components/QuestionCard';

export const SAMPLE: Item[] = [
  {
    id: 'q1',
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
  },
  {
    id: 'q2',
    stem: 'Under the doctrine of precedent, which court binds the Crown Court?',
    options: ['High Court (KB)', 'Magistrates’ Court', 'County Court', 'Tribunal', 'Coroners Court'],
    correctIndex: 0,
    explanation: 'Crown Court is bound by decisions of the High Court and above.',
    source: 'Court hierarchy chart'
  }
];