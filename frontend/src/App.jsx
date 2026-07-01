import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/design-system.css';
import { ThemeProvider } from './context/ThemeContext';
import AppNavbar from './components/Navbar';
import ChatBot from './components/ChatBot';
import Dashboard from './pages/Dashboard';
import UploadPDF from './pages/UploadPDF';
import Results from './pages/Results';
import History from './pages/History';

function App() {
  return (
    <ThemeProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="min-vh-100" style={{ backgroundColor: 'var(--surface-body-bg)' }}>
          <AppNavbar />
          <main className="py-5">
            <Routes>
              {/* Redirect root to dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              
              {/* Main Routes */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/upload" element={<UploadPDF />} />
              <Route path="/results/:fileId" element={<Results />} />
              <Route path="/history" element={<History />} />
              
              {/* Fallback route - redirect to dashboard */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
          <ChatBot />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;