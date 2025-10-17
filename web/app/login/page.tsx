import { LoginForm, RegisterForm } from '../../components/AuthForms';

export default function LoginPage() {
  return (
    <div className="row justify-content-center">
      <div className="col-12 col-lg-10">
        <div className="card overflow-hidden shadow-sm">
          <div className="row g-0">
            <div className="col-12 col-md-5 p-4" style={{background:'linear-gradient(180deg,#e8f1fe,#f5faff)'}}>
              <div className="h-100 d-flex flex-column">
                <div className="mb-4">
                  <h3 className="fw-bold">Welcome back!</h3>
                  <p className="text-secondary mb-0">Sign in with your credentials or single sign-on.</p>
                </div>
                <LoginForm />
              </div>
            </div>
            <div className="col-12 col-md-7 p-4">
              <h3 className="fw-bold">Create account</h3>
              <p className="text-secondary">Or use your email to register:</p>
              <RegisterForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
