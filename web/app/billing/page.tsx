import UserGreeting from '../../components/UserGreeting';



export default function Billing() {
  return (
  // …inside your component render, near the top:
<>  
<UserGreeting className="mb-3" />

    <div className="card">
      <div className="card-body">
        <h5 className="card-title">Billing</h5>
        <p className="text-muted">After the 30‑day trial, activate your subscription.</p>
        <div className="alert alert-info mb-0">Stripe integration placeholder.</div>
      </div>
    </div>
</>	
  );
}