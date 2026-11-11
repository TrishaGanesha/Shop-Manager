import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const response = await fetch(`${API_URL}/auth/${mode}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(mode === 'register' ? { display_name: displayName } : {}),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to sign in.')
      onAuthenticated(data.user)
    } catch (requestError) {
      setError(requestError.message || 'Unable to connect to the account service.')
    } finally {
      setSubmitting(false)
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setError('')
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="brand auth-brand" href="/" aria-label="Shop Manager">
          <span className="brand-mark">m</span>
          <span>Shop<span className="brand-light"> Manager</span></span>
        </a>
        <div className="auth-heading">
          <span className="section-kicker"><span className="kicker-line" /> SHOP WORKSPACE</span>
          <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p>{mode === 'login' ? 'Sign in to manage your products, stock, and sales.' : 'Create an account to start managing your shop.'}</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <label className="form-field">
              <span>Your name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength="2" maxLength="80" autoComplete="name" required />
            </label>
          )}
          <label className="form-field">
            <span>Email address</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'register' ? 10 : undefined} maxLength="128" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
            {mode === 'register' && <small>Use at least 10 characters.</small>}
          </label>
          {error && <div className="dialog-error" role="alert">{error}</div>}
          <button className="button button-primary auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'login' ? 'New to Shop Manager?' : 'Already have an account?'}
          <button type="button" onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </button>
        </p>
        <p className="auth-shared-note">Store inventory is shared with your signed-in staff team.</p>
      </section>
    </main>
  )
}

export default AuthScreen
