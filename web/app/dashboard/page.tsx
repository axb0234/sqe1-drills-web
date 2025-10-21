'use client';

import { useEffect, useState } from 'react';
import KpiTile from '../../components/KpiTile';
import Link from 'next/link';
import UserGreeting from '../../components/UserGreeting';

type Kpis = {
  mcqsToday: number;
  weeklyGoal: { attempted: number; goal: number };
  accuracy7d: number | null; // null when no attempts
  streakDays: number;
};

export default function Page() {
  const [k, setK] = useState<Kpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/kpis', { cache: 'no-store' });
        if (res.status === 401) {
          if (!alive) return;
          setError('Please sign in to see your dashboard.');
          setK(null);
          return;
        }
        const data = await res.json();
        if (!alive) return;
        setK(data);
      } catch {
        if (!alive) return;
        setError('Unable to load KPIs right now.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Fallbacks for initial render / errors
  const mcqsToday = k?.mcqsToday ?? 0;
  const weekly = k?.weeklyGoal ?? { attempted: 0, goal: 150 };
  const accuracy = k?.accuracy7d == null ? '—' : `${k.accuracy7d}%`;
  const streak = k?.streakDays ?? 0;

  return (
    <>
      <UserGreeting className="mb-3" />

      {error && <div className="alert alert-warning">{error}</div>}

      <div className="row g-3">
        <div className="col-12 col-lg-8">
          <div className="d-flex flex-wrap gap-3">
            <KpiTile label="MCQs today" value={String(mcqsToday)} hint="Target: 150/day" />
            <KpiTile
              label="Cumulative"
              value={`${weekly.attempted} / ${weekly.goal}`}
              hint="Week goal"
            />
            <KpiTile label="Accuracy" value={accuracy} hint="Last 7 days" />
            <KpiTile label="Streak" value={`${streak} days`} />
          </div>

          <div className="card mt-3">
            <div className="card-body">
              <h5 className="card-title mb-3">Start drilling</h5>
              <p className="text-muted">Pick a subject and number of questions.</p>
              <Link className="btn btn-primary" href="/start">
                Start a Drill
              </Link>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-4">
          <div className="card">
            <div className="card-body">
              <h6 className="card-title">Recent activity</h6>
              <ul className="list-unstyled small mb-0">
                <li>No sessions yet.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
