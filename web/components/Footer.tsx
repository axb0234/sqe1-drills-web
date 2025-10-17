export default function Footer() {
  return (
    <footer className="container py-4 small text-muted">
      <div className="d-flex align-items-center justify-content-between">
        <span>&copy; {new Date().getFullYear()} SQE1 Drills</span>
        <a className="link-secondary" href="https://sqe1prep.com" target="_blank" rel="noreferrer">Status</a>
      </div>
    </footer>
  );
}