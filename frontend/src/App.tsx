import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { SessionProvider } from './context/SessionContext'
import { MatchPage } from './pages/MatchPage'
import { QueuePage } from './pages/QueuePage'

function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <main className="page">
          <Routes>
            <Route path="/" element={<QueuePage />} />
            <Route path="/matches/:matchId" element={<MatchPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </SessionProvider>
    </BrowserRouter>
  )
}

export default App
