'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const read = () => (typeof window === 'undefined' ? null : localStorage.getItem('auth'));
const write = (v: string|null) => {
  if (typeof window !== 'undefined'){
    if (v===null) localStorage.removeItem('auth');
    else localStorage.setItem('auth', v);
  }
};

export function LoginForm() {
  const r = useRouter();
  const [user, setUser] = useState(''); const [pass, setPass] = useState(''); const [loading, setLoading] = useState(false);

  useEffect(() => { if (read()==='1') r.replace('/dashboard'); }, [r]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    if (user && pass) { write('1'); r.push('/dashboard'); }
    else { alert('Enter username and password'); }
    setLoading(false);
  };

  const google = process.env.NEXT_PUBLIC_OIDC_GOOGLE || '#';
  const microsoft = process.env.NEXT_PUBLIC_OIDC_MICROSOFT || '#';

  return (
    <form onSubmit={submit}>
      <div className="mb-3">
        <label className="form-label">Username or Email</label>
        <input className="form-control" value={user} onChange={e=>setUser(e.target.value)} />
      </div>
      <div className="mb-2">
        <label className="form-label">Password</label>
        <input type="password" className="form-control" value={pass} onChange={e=>setPass(e.target.value)} />
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <a className="small d-inline-flex align-items-center gap-2" href="/reset">
          <i className="fa-solid fa-key"></i><span>Reset password</span>
        </a>
      </div>

      <button className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
              disabled={loading} type="submit">
        <i className="fa-solid fa-right-to-bracket"></i><span>Login</span>
      </button>

      <div className="text-center text-secondary small my-3">or</div>

      <div className="d-grid gap-2">
        <a className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2" href={google}>
          <i className="fa-brands fa-google"></i><span>Login with Google</span>
        </a>
        <a className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2" href={microsoft}>
          <i className="fa-brands fa-microsoft"></i><span>Login with Microsoft</span>
        </a>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const r = useRouter();
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [pass, setPass] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && name && pass) { write('1'); r.push('/dashboard'); }
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-3">
        <label className="form-label">Name</label>
        <input className="form-control" value={name} onChange={e=>setName(e.target.value)} />
      </div>
      <div className="mb-3">
        <label className="form-label">Email</label>
        <input type="email" className="form-control" value={email} onChange={e=>setEmail(e.target.value)} />
      </div>
      <div className="mb-3">
        <label className="form-label">Password</label>
        <input type="password" className="form-control" value={pass} onChange={e=>setPass(e.target.value)} />
      </div>

      <button className="btn btn-success w-100 d-flex align-items-center justify-content-center gap-2" type="submit">
        <i className="fa-solid fa-user-plus"></i><span>Create account</span>
      </button>

      <div className="text-secondary small mt-2">By signing up you agree to our terms.</div>
    </form>
  );
}
