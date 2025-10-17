import Image from 'next/image';
import Link from 'next/link';
import TryQuestion from '../components/TryQuestion';

export default function Marketing() {
  return (
    <>
      <section className="py-5">
        <div className="row align-items-center g-4">
          <div className="col-12 col-lg-6">
            <h1 className="display-5 fw-bold">Master SQE1 with focused drills</h1>
            <p className="lead text-secondary mt-3">
              Crisp MCQ practice by topic clusters, clean analytics, and a distraction-free workflow.
            </p>
            <div className="d-flex gap-2 mt-3">
              <Link href="/start" className="btn btn-primary btn-lg">Start a drill</Link>
              <Link href="/dashboard" className="btn btn-outline-secondary btn-lg">View dashboard</Link>
            </div>
            <div className="text-secondary small mt-3">No sign-in required to try a sample question below.</div>
          </div>
          <div className="col-12 col-lg-6 text-center">
            <Image className="img-fluid" src="/hero.svg" width={800} height={520} alt="SQE1 Drills hero" priority/>
          </div>
        </div>
      </section>

      <section className="py-5 border-top">
        <div className="row g-4">
          <div className="col-12 col-lg-6">
            <h2 className="h4 mb-3">Why SQE1 Drills?</h2>
            <ul className="list-unstyled">
              <li className="mb-2">• Fast, mobile-friendly UI built with Bootstrap 5</li>
              <li className="mb-2">• Exportable data — you own your progress</li>
              <li className="mb-2">• Clean KPIs mapped to workshop clusters</li>
            </ul>
          </div>
          <div className="col-12 col-lg-6">
            <h2 className="h4 mb-3">Try a question</h2>
            <TryQuestion />
          </div>
        </div>
      </section>
    </>
  );
}
