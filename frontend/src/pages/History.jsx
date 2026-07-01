import React, { useState, useEffect, useMemo } from 'react';
import { Container, Spinner, Modal, Dropdown, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { FiClock, FiEye, FiTrash2, FiDownload, FiFileText, FiAlertTriangle, FiSearch, FiFilter, FiExternalLink } from 'react-icons/fi';
import { getHistory, deleteFile, deleteAllFiles, exportAllResults, exportSelectedResults } from '../services/api';
import * as XLSX from 'xlsx';
import PdfViewerModal from '../components/PdfViewerModal';

const History = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('Upload Date');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfViewerFileName, setPdfViewerFileName] = useState('');


  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getHistory();
      if (response.data.success) {
        setFiles(response.data.history || []);
        setSelectedIds([]);
        setSelectAll(false);
        setSearchQuery('');
        setSelectedFilter('Upload Date');
      }
    } catch (err) {
      setError('Failed to load history. Please ensure the backend server is running.');
      console.error('History error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (fileId, fileName) => {
    if (!window.confirm(`Are you sure you want to delete "${fileName}" and all its analysis data?`)) {
      return;
    }

    try {
      setDeleting(fileId);
      const response = await deleteFile(fileId);
      if (response.data.success) {
        setFiles(files.filter(f => f.id !== fileId));
        setSelectedIds(selectedIds.filter(id => id !== fileId));
      }
    } catch (err) {
      alert('Failed to delete file. Please try again.');
      console.error('Delete error:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteSelected = async () => {
    try {
      setDeletingSelected(true);
      const deletePromises = selectedIds.map(id => deleteFile(id));
      await Promise.all(deletePromises);
      setFiles(files.filter(f => !selectedIds.includes(f.id)));
      setSelectedIds([]);
      setSelectAll(false);
      setShowDeleteSelectedModal(false);
    } catch (err) {
      alert('Failed to delete selected files. Please try again.');
      console.error('Delete selected error:', err);
    } finally {
      setDeletingSelected(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      setDeletingAll(true);
      const response = await deleteAllFiles();
      if (response.data.success) {
        setFiles([]);
        setSelectedIds([]);
        setSelectAll(false);
        setShowDeleteModal(false);
      }
    } catch (err) {
      alert('Failed to delete all files. Please try again.');
      console.error('Delete all error:', err);
    } finally {
      setDeletingAll(false);
    }
  };

  const handleToggleSelect = (fileId) => {
    setSelectedIds(prev => {
      if (prev.includes(fileId)) {
        return prev.filter(id => id !== fileId);
      }
      return [...prev, fileId];
    });
    setSelectAll(false);
  };

  const handleToggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds([]);
      setSelectAll(false);
    } else {
      setSelectedIds(filteredFiles.map(f => f.id));
      setSelectAll(true);
    }
  };

  const buildExcelData = (fileList) => {
    return fileList.flatMap(file => {
      const rows = [];
      const components = (file.components || []).map((c, i) => ({
        'File Name': file.file_name,
        'UPLOAD DATE': file.uploaded_at ? new Date(file.uploaded_at).toLocaleDateString() : '',
        'JOINT NUMBER': c.component || '',
        'RELATED FLANGES': c.related_elements || '',
        'FIRST FLANGE NO': c.first_element_value || '',
        'FIRST PART NUMBER': c.extracted_number ?? '',
        'FIRST ME CODE': c.item_code || 'Not Found',
        'SECOND FLANGE NO': c.second_element_value || '',
        'SECOND PART NUMBER': c.second_extracted_number ?? '',
        'SECOND ME CODE': c.second_item_code || '',
        'THIRD FLANGE NO': c.third_element_value || '',
        'THIRD PART NUMBER': c.third_extracted_number ?? '',
        'THIRD ME CODE': c.third_item_code || '',
        'Match Status': c.match_status || ''
      }));
      rows.push(...components);
      return rows;
    });
  };

  const exportToExcel = (data, fileName) => {
    if (data.length === 0) {
      alert('No data to export for the current filter selection.');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    const colWidths = Object.keys(data[0]).map(key => ({ wch: Math.max(key.length, 15) }));
    ws['!cols'] = colWidths;
    XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportOverall = async () => {
    try {
      setExporting(true);
      const response = await exportAllResults();
      if (response.data.success) {
        const data = response.data.exportData;
        exportToExcel(data, 'overall_analysis');
      } else {
        alert('Failed to export data: ' + (response.data.message || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to export data. Please try again.');
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleExportSelected = async () => {
    if (selectedIds.length === 0) {
      alert('Please select at least one file to export.');
      return;
    }
    try {
      setExporting(true);
      const response = await exportSelectedResults(selectedIds);
      if (response.data.success) {
        const data = response.data.exportData;
        exportToExcel(data, 'selected_analysis');
      } else {
        alert('Failed to export data: ' + (response.data.message || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to export data. Please try again.');
      console.error('Export error:', err);
    } finally {
      setExporting(false);
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

  // Filtering logic
  const filteredFiles = useMemo(() => {
    let result = [...files];

    // Search filter (case-insensitive)
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(f => {
        const fileName = (f.file_name || '').toLowerCase();
        const jointNumber = String(f.total_components || 0);
        const meCode = String(f.total_matched || 0);
        return fileName.includes(query) || jointNumber.includes(query) || meCode.includes(query);
      });
    }

    // Sort based on selectedFilter
    if (selectedFilter === 'Upload Date') {
      result.sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));
    } else if (selectedFilter === 'Matched') {
      result.sort((a, b) => (b.total_matched || 0) - (a.total_matched || 0));
    } else if (selectedFilter === 'Status') {
      result.sort((a, b) => (a.upload_status || '').localeCompare(b.upload_status || ''));
    } else if (selectedFilter === 'File Size') {
      result.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
    }

    return result;
  }, [files, searchQuery, selectedFilter]);

  if (loading) {
    return (
      <Container>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading history...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="fade-in">
      {/* Delete Selected Confirmation Modal */}
      <Modal 
        show={showDeleteSelectedModal} 
        onHide={() => setShowDeleteSelectedModal(false)} 
        centered 
        className="modern-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FiAlertTriangle className="me-2 text-danger" />
            Delete Selected Files
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Are you sure you want to delete the selected {selectedIds.length} file(s)? This action cannot be undone.</p>
          <div className="alert-modern alert-modern-danger">
            <FiAlertTriangle size={18} />
            <span><strong>Warning:</strong> All selected PDFs and their analysis data will be permanently removed.</span>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button 
            className="btn-modern btn-modern-outline"
            onClick={() => setShowDeleteSelectedModal(false)}
          >
            Cancel
          </button>
          <button 
            className="btn-modern btn-modern-danger"
            onClick={handleDeleteSelected}
            disabled={deletingSelected}
          >
            {deletingSelected ? (
              <><Spinner animation="border" size="sm" /> Deleting...</>
            ) : (
              `Yes, Delete ${selectedIds.length} File(s)`
            )}
          </button>
        </Modal.Footer>
      </Modal>

      {/* Delete All Confirmation Modal */}
      <Modal 
        show={showDeleteModal} 
        onHide={() => setShowDeleteModal(false)} 
        centered 
        className="modern-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FiAlertTriangle className="me-2 text-danger" />
            Delete All Files
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Are you sure you want to delete all files? This action cannot be undone.</p>
          <div className="alert-modern alert-modern-danger">
            <FiAlertTriangle size={18} />
            <span><strong>Warning:</strong> All uploaded PDFs and their analysis data will be permanently removed.</span>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button 
            className="btn-modern btn-modern-outline"
            onClick={() => setShowDeleteModal(false)}
          >
            Cancel
          </button>
          <button 
            className="btn-modern btn-modern-danger"
            onClick={handleDeleteAll}
            disabled={deletingAll}
          >
            {deletingAll ? (
              <><Spinner animation="border" size="sm" /> Deleting...</>
            ) : (
              'Yes, Delete All'
            )}
          </button>
        </Modal.Footer>
      </Modal>

      {/* Page Header */}
      <h1 className="page-title">
        <FiClock /> Upload History
      </h1>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <span style={{ fontSize: 'var(--font-sm)', color: 'var(--neutral-500)' }}>
            {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''} shown
            {selectedIds.length > 0 && (
              <span style={{ fontWeight: 600, color: 'var(--primary-600)' }}>
                {' '}· {selectedIds.length} selected
              </span>
            )}
          </span>
          <Dropdown 
            show={showFilterDropdown} 
            onToggle={(isOpen) => setShowFilterDropdown(isOpen)}
            className="ms-2"
          >
            <Dropdown.Toggle 
              variant="outline-primary" 
              size="sm"
              className="btn-modern btn-modern-sm btn-modern-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
            >
              <FiFilter /> Filter
            </Dropdown.Toggle>

            <Dropdown.Menu style={{ minWidth: 200 }} className="filter-dropdown">
              <Dropdown.Header>Filter By</Dropdown.Header>
              <Dropdown.Item 
                active={selectedFilter === 'Upload Date'}
                onClick={() => { setSelectedFilter('Upload Date'); setShowFilterDropdown(false); }}
              >
                Upload Date
              </Dropdown.Item>
              <Dropdown.Item 
                active={selectedFilter === 'Matched'}
                onClick={() => { setSelectedFilter('Matched'); setShowFilterDropdown(false); }}
              >
                Matched
              </Dropdown.Item>
              <Dropdown.Item 
                active={selectedFilter === 'Status'}
                onClick={() => { setSelectedFilter('Status'); setShowFilterDropdown(false); }}
              >
                Status
              </Dropdown.Item>
              <Dropdown.Item 
                active={selectedFilter === 'File Size'}
                onClick={() => { setSelectedFilter('File Size'); setShowFilterDropdown(false); }}
              >
                File Size
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
        <div className="toolbar-right">
          <div className="search-wrapper">
            <FiSearch className="search-icon" />
            <Form.Control
              type="text"
              placeholder="Search by File Name, ME Code, Joint Number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input non-selectable-text"
            />
          </div>
          {selectedIds.length > 0 && (
            <>
              <button 
                className="btn-modern btn-modern-sm btn-modern-danger"
                onClick={() => setShowDeleteSelectedModal(true)}
              >
                <FiTrash2 /> Delete Selected ({selectedIds.length})
              </button>
               <button 
                className="btn-modern btn-modern-sm btn-modern-primary"
                onClick={handleExportSelected}
              >
                <><FiDownload /> Export Selected ({selectedIds.length})</>
              </button>
            </>
          )}
          <button 
            className="btn-modern btn-modern-sm btn-modern-success"
            onClick={handleExportOverall}
          >
            <><FiDownload /> Export All</>
          </button>
          {files.length > 0 && (
            <button 
              className="btn-modern btn-modern-sm btn-modern-outline-danger"
              onClick={() => setShowDeleteModal(true)}
            >
              <FiTrash2 /> Delete All
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert-modern alert-modern-danger mb-4">
          <FiAlertTriangle size={18} />
          <div>{error}</div>
        </div>
      )}

      {/* Files Table */}
      <div className="modern-card">
        <div className="modern-card-body p-0">
          {filteredFiles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FiSearch />
              </div>
              <div className="empty-state-title">No files found</div>
              <div className="empty-state-text">
                {searchQuery || selectedFilter !== 'Upload Date'
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Uploaded engineering drawings will appear here for review and exporting.'}
              </div>
              {(searchQuery || selectedFilter !== 'Upload Date') && (
                <button 
                  className="btn-modern btn-modern-outline"
                  onClick={() => { setSearchQuery(''); setSelectedFilter('Upload Date'); }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="modern-table-wrapper">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th style={{width: '40px'}}>
                      <input 
                        type="checkbox" 
                        checked={selectAll || (selectedIds.length === filteredFiles.length && filteredFiles.length > 0)}
                        onChange={handleToggleSelectAll}
                        className="checkbox-modern"
                      />
                    </th>
                    <th className="selectable-text">File Name</th>
                    <th className="non-selectable-text">Size</th>
                    <th className="non-selectable-text">Status</th>
                    <th className="non-selectable-text">Joint No</th>
                    <th className="non-selectable-text">RESULTS</th>
                    <th className="non-selectable-text">MATCHED</th>
                    <th className="non-selectable-text">UPLOAD DATE</th>
                    <th className="non-selectable-text" style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => (
                    <tr 
                      key={file.id} 
                      className={selectedIds.includes(file.id) ? 'selected' : ''}
                    >
                      <td>
                        <input 
                          type="checkbox"
                          checked={selectedIds.includes(file.id)}
                          onChange={() => handleToggleSelect(file.id)}
                          className="checkbox-modern"
                        />
                      </td>
                      <td className="selectable-text">
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}
                          onClick={() => {
                            setPdfViewerFileName(file.id);
                            setShowPdfViewer(true);
                          }}
                        >
                          <div style={{ 
                            width: 32, height: 32, borderRadius: 'var(--radius-md)', 
                            background: 'var(--primary-50)', display: 'flex', 
                            alignItems: 'center', justifyContent: 'center',
                            color: 'var(--primary-500)', flexShrink: 0
                          }}>
                            <FiFileText size={14} />
                          </div>
                          <span className="selectable-text" style={{ fontWeight: 500, color: 'var(--primary-600)', textDecoration: 'underline', textDecorationColor: 'var(--primary-200)', textUnderlineOffset: '3px' }}>{file.file_name}</span>
                        </div>
                      </td>
                      <td className="non-selectable-text">{formatFileSize(file.file_size)}</td>
                      <td className="non-selectable-text">{getStatusBadge(file.upload_status)}</td>
                      <td className="non-selectable-text">{file.total_components || 0}</td>
                      <td className="non-selectable-text">{file.total_results || 0}</td>
                      <td className="non-selectable-text">
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>{file.total_matched || 0}</span>
                      </td>
                      <td className="non-selectable-text" style={{ whiteSpace: 'nowrap' }}>{formatDate(file.uploaded_at)}</td>
                      <td className="non-selectable-text" style={{ textAlign: 'right' }}>
                        <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                           <button
                             className="action-btn"
                             onClick={() => navigate(`/results/${file.id}`)}
                             disabled={file.upload_status !== 'completed'}
                             title="View Results"
                           >
                             <FiEye />
                           </button>
                           <button
                             className="action-btn danger"
                             onClick={() => handleDelete(file.id, file.file_name)}
                             disabled={deleting === file.id}
                             title="Delete"
                           >
                             {deleting === file.id ? (
                               <Spinner animation="border" size="sm" style={{ width: 14, height: 14 }} />
                             ) : (
                               <FiTrash2 />
                             )}
                           </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {/* PDF Viewer Modal */}
      <PdfViewerModal
        show={showPdfViewer}
        onHide={() => setShowPdfViewer(false)}
        fileId={pdfViewerFileName}
      />
    </Container>
  );
};

export default History;
