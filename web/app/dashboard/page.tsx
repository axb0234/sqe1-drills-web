import KpiTile from '../../components/KpiTile';
import Link from 'next/link';
import UserGreeting from '../../components/UserGreeting';




export default function Page() {
  return (
	// …inside your component render, near the top:
<UserGreeting className="mb-3" />
    <div className="row g-3">
      <div className="col-12 col-lg-8">
        <div className="d-flex flex-wrap gap-3">
          <KpiTile label="MCQs today" value="0" hint="Target: 150/day" />
          <KpiTile label="Cumulative" value="0 / 150" hint="Week goal" />
          <KpiTile label="Accuracy" value="—" hint="Last 7 days" />
          <KpiTile label="Streak" value="0 days" />
        </div>
        <div className="card mt-3">
          <div className="card-body">
            <h5 className="card-title mb-3">Start drilling</h5>
            <p className="text-muted">Pick a subject and number of questions.</p>
            <Link className="btn btn-primary" href="/start">Start a Drill</Link>
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
  );
}
