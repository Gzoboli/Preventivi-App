import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { MetodoPage } from './pages/MetodoPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { QuotePage } from './pages/QuotePage'
import { SendPage } from './pages/SendPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="metodo" element={<MetodoPage />} />
              <Route path="preventivi/:id" element={<QuotePage />} />
              <Route path="preventivi/:id/pdf" element={<SendPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
