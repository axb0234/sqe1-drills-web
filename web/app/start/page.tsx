'use client';

import { useEffect, useState, useContext } from 'react';
import { useRouter } from 'next/navigation';
import UserGreeting from '../../components/UserGreeting';
import { AuthContext } from '../../components/AuthProvider';

type Subject = { id: string | number; name: string };

const ALL_SUBJECT_OPTION: Subject = { id: 'ALL', name: 'ALL Subjects' };

function ensureAllSubjectOption(list: Subject[]): Subject[] {
  const normalized = list.map((item) => ({ id: item.id, name: item.name }));
  const hasAll = normalized.some((item) => String(item.id) === 'ALL');
  if (hasAll) {
    return normalized.map((item) =>
      String(item.id) === 'ALL' ? ALL_SUBJECT_OPTION : item,
    );
  }
  return [ALL_SUBJECT_OPTION, ...normalized];
}

function safeCommentContent(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/--/g, '-​-');
}

function getFallbackSubjects(): Subject[] {
  return ensureAllSubjectOption([]);
}

export default function StartPage() {
  const router = useRouter();
  const { authenticated } = useContext(AuthContext);

  const [subjects, setSubjects] = useState<Subject[]>(getFallbackSubjects);
  const [subject, setSubject] = useState<string>('ALL'); // store as string for the <select>
  const [len, setLen] = useState<number>(10);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');

  // Load subjects on mount
  useEffect(() => {
    let active = true;

    async function loadSubjects() {
      const fallback = getFallbackSubjects();
      try {
        setDebugInfo('Fetching /api/subjects…');
        const res = await fetch('/api/subjects');
        const raw = await res.text();
        console.debug('StartPage /api/subjects response', {
          status: res.status,
          body: raw,
        });

        if (!active) return;

        let parsed: unknown = null;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch (err) {
          console.error('Unable to parse /api/subjects JSON', err);
          setSubjects(getFallbackSubjects());
          setSubject('ALL');
          setDebugInfo(
            `Failed to parse /api/subjects response (status ${res.status}).`,
          );
          return;
        }

        const data = parsed as {
          subjects?: Subject[];
          debug?: { dbPath?: string; rowCount?: number };
        };

        const nextSubjects = Array.isArray(data.subjects)
          ? ensureAllSubjectOption(data.subjects)
          : fallback;

        setSubjects(nextSubjects);
        if (!Array.isArray(data.subjects)) {
          setSubject('ALL');
        }

        const dbPathInfo = data.debug?.dbPath ?? 'unknown path';
        const rowsInfo = data.debug?.rowCount ?? nextSubjects.length;
        setDebugInfo(
          `Fetched ${nextSubjects.length} subject option(s) (status ${res.status}; rows ${rowsInfo}; db ${dbPathInfo}).`,
        );
      } catch (err) {
        console.error('Failed to load /api/subjects', err);
        if (!active) return;
        setSubjects(getFallbackSubjects());
        setSubject('ALL');
        setDebugInfo(
          `Error fetching /api/subjects: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    loadSubjects();

    return () => {
      active = false;
    };
  }, []);

  async function create() {
    setBusy(true);
    setError(null);

    // Convert select value to the API shape: number for numeric IDs, or 'ALL'
    const payloadSubject = /^\d+$/.test(subject) ? Number(subject) : subject;

    const res = await fetch('/api/drills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: payloadSubject, length: len }),
    });

    const data = await res.json().catch(() => ({}));

    setBusy(false);

    if (res.status === 401) {
      setError('Please sign in to start a drill.');
      return;
    }

    if (!res.ok) {
      // Handle exhausted question bank case (server returns {available})
      if (data?.available !== undefined) {
        setError(
          `Not enough unseen questions. Only ${data.available} available — pick a smaller length.`
        );
      } else {
        setError(data?.error || 'Unable to create drill right now.');
      }
      return;
    }

    router.push(`/drill/${data.sid}`);
  }

  return (
    <>
      <UserGreeting className="mb-3" />

      <div className="card shadow-sm">
        <div className="card-body">
          <h5 className="card-title">New Drill</h5>

          {!authenticated && (
            <div className="alert alert-warning mb-3">
              Please sign in to start a drill.
            </div>
          )}

          {error && <div className="alert alert-warning mb-3">{error}</div>}

          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Subject</label>
              <select
                className="form-select"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={busy}
              >
                {subjects.map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div className="form-text">
                Choose <em>ALL Subjects</em> to mix questions across the bank.
              </div>
            </div>

            <div className="col-md-6">
              <label className="form-label">Length</label>
              <select
                className="form-select"
                value={len}
                onChange={(e) => setLen(parseInt(e.target.value, 10))}
                disabled={busy}
              >
                <option value={10}>10</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
                <option value={90}>90</option>
              </select>
            </div>
          </div>

          <button
            className="btn btn-primary mt-3"
            onClick={create}
            disabled={busy || !authenticated}
          >
            {busy ? 'Creating…' : 'Create drill'}
          </button>
          {debugInfo && (
            <>
              <div
                className="visually-hidden"
                aria-hidden="true"
                dangerouslySetInnerHTML={{
                  __html: `<!-- ${safeCommentContent(debugInfo)} -->`,
                }}
              />
              <p className="text-muted small mt-3">Debug: {debugInfo}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
