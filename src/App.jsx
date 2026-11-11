import { useEffect, useState } from 'react'
import AuthScreen from './AuthScreen.jsx'
import InventoryView from './InventoryView.jsx'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'

function App() {
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let active = true
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(async (response) => {
        if (response.status === 401) return null
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to verify your login.')
        return data.user
      })
      .then((currentUser) => {
        if (active) setUser(currentUser)
      })
      .catch((error) => {
        console.error('Unable to verify login session:', error)
      })
      .finally(() => {
        if (active) setCheckingSession(false)
      })
    return () => { active = false }
  }, [])

  if (checkingSession) {
    return <main className="auth-loading" aria-label="Checking login"><span className="auth-loading-mark">m</span></main>
  }

  if (!user) {
    return <AuthScreen onAuthenticated={setUser} />
  }

  async function logout() {
    const response = await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Unable to log out.')
    }
    setUser(null)
  }

  return <InventoryView user={user} onLogout={logout} />
}

export default App
