'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import UserGreeting from '../../components/UserGreeting';



export default function StartPage() {
  const [subject, setSubject] = useState('INTRO_LAW');
  const [len, setLen] = useState(10);
  const r = useRouter();

  const create = () => {
    const sid = `${subject}-${Date.now()}`;
    r.push(`/drill/${sid}?n=${len}`);
  };

  return (
	// …inside your component render, near the top:
<>	
<UserGreeting className="mb-3" />

    <div className="card shadow-sm">
      <div className="card-body">
        <h5 className="card-title">New Drill</h5>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Subject</label>
            <select className="form-select" value={subject} onChange={e=>setSubject(e.target.value)}>
              <option value="INTRO_LAW">Introduction to Law</option>
              <option value="CRIMINAL">Criminal Law</option>
              <option value="CONTRACT">Contract</option>
              <option value="TORT">Tort</option>
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Length</label>
            <select className="form-select" value={len} onChange={e=>setLen(parseInt(e.target.value))}>
              <option>10</option><option>30</option><option>60</option><option>90</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary mt-3" onClick={create}>Create drill</button>
      </div>
    </div>
</>	
  );
}