import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Spinner } from 'react-bootstrap';
import { FiUpload, FiFileText, FiCheckCircle, FiXCircle, FiClock, FiTrendingUp } from 'react-icons/fi';
import { useNavigate, Link } from 'react-router-dom';
import { getDashboardStats } from '../services/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentUploads, setRecentUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getDashboardStats();
      if (response.data.success) {
        setStats(response.data.stats);
        setRecentUploads(response.data.recentUploads || []);
      }
    } catch (err) {
      setError('Failed to load dashboard data. Please ensure the backend server is running.');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      uploaded: { class: 'uploaded', label: 'Uploaded' },
      analyzing: { class: 'analyzing', label: 'Analyzing' },
      completed: { class: 'completed', label: 'Completed' },
      failed: { class: 'failed', label: 'Failed' }
    };
    const s = statusMap[status] || { class: '', label: status };
    return <span className={`status-badge ${s.class}`}>{s.label}</span>;
  };

  if (loading) {
    return (
      <Container>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading dashboard...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="fade-in">
      {/* Page Title */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
        <h1 className="page-title mb-0">
          <FiTrendingUp /> Dashboard
        </h1>
        <Link to="/upload" className="btn-modern btn-modern-primary">
          <FiUpload /> Upload New PDF
        </Link>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert-modern alert-modern-danger mb-4">
          <FiXCircle size={18} />
          <div>
            {error}
            <button 
              className="btn-modern btn-modern-sm btn-modern-outline ms-3"
              onClick={fetchDashboardData}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      <Row className="g-4 mb-5">
        <Col sm={6} xl={4}>
          <div className="stats-card primary">
            <div className="stats-icon">
              <FiUpload />
            </div>
            <div className="stats-number">{stats?.totalFiles || 0}</div>
            <div className="stats-label">Total Files Uploaded</div>
          </div>
        </Col>
        <Col sm={6} xl={4}>
          <div className="stats-card success">
            <div className="stats-icon">
              <FiCheckCircle />
            </div>
            <div className="stats-number">{stats?.analyzedFiles || 0}</div>
            <div className="stats-label">Successfully Analyzed</div>
          </div>
        </Col>
        <Col sm={6} xl={4}>
          <div className="stats-card info">
            <div className="stats-icon">
              <FiFileText />
            </div>
            <div className="stats-number">{stats?.totalComponents || 0}</div>
            <div className="stats-label">Total Joint Number</div>
          </div>
        </Col>
        <Col sm={6} xl={4}>
          <div className="stats-card success">
            <div className="stats-icon">
              <FiCheckCircle />
            </div>
            <div className="stats-number">{stats?.matchedItems || 0}</div>
            <div className="stats-label">Matched ME Codes</div>
          </div>
        </Col>
        <Col sm={6} xl={4}>
          <div className="stats-card danger">
            <div className="stats-icon">
              <FiXCircle />
            </div>
            <div className="stats-number">{stats?.noMatchItems || 0}</div>
            <div className="stats-label">Unmatched ME Codes</div>
          </div>
        </Col>
        <Col sm={6} xl={4}>
          <div className="stats-card warning">
            <div className="stats-icon">
              <FiFileText />
            </div>
            <div className="stats-number">{stats?.totalResults || 0}</div>
            <div className="stats-label">Total Analysis Results</div>
          </div>
        </Col>
      </Row>

      {/* Recent Uploads */}
      <div className="modern-card">
        <div className="modern-card-header">
          <h5>
            <FiClock /> Recent Uploads
          </h5>
          {recentUploads.length > 0 && (
            <Link to="/history" className="btn-modern btn-modern-sm btn-modern-outline">
              View All
            </Link>
          )}
        </div>
        <div className="modern-card-body p-0">
          {recentUploads.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FiUpload />
              </div>
              <div className="empty-state-title">No files uploaded yet</div>
              <div className="empty-state-text">Upload your first engineering drawing PDF to get started.</div>
              <Link to="/upload" className="btn-modern btn-modern-primary">
                <FiUpload /> Upload Your First PDF
              </Link>
            </div>
          ) : (
            <div className="modern-table-wrapper">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th className="selectable-text">File Name</th>
                    <th className="non-selectable-text">Size</th>
                    <th className="non-selectable-text">Status</th>
                    <th className="non-selectable-text">Uploaded At</th>
                    <th className="non-selectable-text" style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUploads.map((file) => (
                    <tr key={file.id}>
                      <td className="selectable-text">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div style={{ 
                            width: 32, height: 32, borderRadius: 'var(--radius-md)', 
                            background: 'var(--primary-50)', display: 'flex', 
                            alignItems: 'center', justifyContent: 'center',
                            color: 'var(--primary-500)', flexShrink: 0
                          }}>
                            <FiFileText size={14} />
                          </div>
                          <span className="selectable-text" style={{ fontWeight: 500 }}>{file.file_name}</span>
                        </div>
                      </td>
                      <td className="non-selectable-text">{formatFileSize(file.file_size)}</td>
                      <td className="non-selectable-text">{getStatusBadge(file.upload_status)}</td>
                      <td className="non-selectable-text" style={{ whiteSpace: 'nowrap' }}>{formatDate(file.uploaded_at)}</td>
                      <td className="non-selectable-text" style={{ textAlign: 'right' }}>
                        <button
                          className="btn-modern btn-modern-sm btn-modern-primary"
                          onClick={() => navigate(`/results/${file.id}`)}
                          disabled={file.upload_status !== 'completed'}
                        >
                          View Results
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
};

export default Dashboard;