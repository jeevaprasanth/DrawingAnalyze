import React from 'react';
import { Navbar as BootstrapNavbar, Nav, Container } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import { FiUpload, FiHome, FiFileText, FiClock, FiSun, FiMoon } from 'react-icons/fi';
import { useTheme } from '../context/ThemeContext';

const AppNavbar = () => {
  const location = useLocation();
  const { darkMode, toggleTheme } = useTheme();

  const isActive = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <BootstrapNavbar expand="lg" className="modern-navbar py-2">
      <Container>
        {/* Brand / Title */}
        <BootstrapNavbar.Brand as={Link} to="/dashboard" className="d-flex align-items-center">
          <FiFileText size={24} />
          <span>Drawing Analyzer</span>
        </BootstrapNavbar.Brand>

        <div className="d-flex align-items-center">
          {/* Theme Toggle (mobile) */}
          <button 
            className="theme-toggle-btn d-lg-none me-2"
            onClick={toggleTheme}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? <FiSun /> : <FiMoon />}
          </button>
          <BootstrapNavbar.Toggle aria-controls="main-navbar" className="border-0">
            <span className="navbar-toggler-icon"></span>
          </BootstrapNavbar.Toggle>
        </div>

        <BootstrapNavbar.Collapse id="main-navbar">
          <Nav className="ms-auto align-items-center">
            <Nav.Link
              as={Link}
              to="/dashboard"
              className={`nav-link-modern ${isActive('/dashboard') ? 'active' : ''}`}
            >
              <FiHome /> Dashboard
            </Nav.Link>
            <Nav.Link
              as={Link}
              to="/upload"
              className={`nav-link-modern ${isActive('/upload') ? 'active' : ''}`}
            >
              <FiUpload /> Upload
            </Nav.Link>
            <Nav.Link
              as={Link}
              to="/history"
              className={`nav-link-modern ${isActive('/history') ? 'active' : ''}`}
            >
              <FiClock /> History
            </Nav.Link>

            {/* Theme Toggle (desktop) */}
            <button 
              className="theme-toggle-btn d-none d-lg-inline-flex"
              onClick={toggleTheme}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? <FiSun /> : <FiMoon />}
            </button>
          </Nav>
        </BootstrapNavbar.Collapse>
      </Container>
    </BootstrapNavbar>
  );
};

export default AppNavbar;