import React, { useState, useRef } from 'react';
import { Container, Row, Col, Form, Spinner, Modal } from 'react-bootstrap';
import { FiUpload, FiFile, FiCheckCircle, FiAlertCircle, FiX, FiInfo, FiAlertTriangle } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { uploadMultiplePDFs, checkDuplicate } from '../services/api';

const MAX_FILES = 50;

const UploadPDF = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [summary, setSummary] = useState(null);
  const [redirecting, setRedirecting] = useState(false);
  const [redirectTarget, setRedirectTarget] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const processFiles = (files) => {
    let fileArray = Array.from(files);
    if (fileArray.length === 0) return [];

    const invalidFiles = fileArray.filter(f => f.type !== 'application/pdf');
    if (invalidFiles.length > 0) {
      setError('Upload failed. Please try again.');
      fileArray = fileArray.filter(f => f.type === 'application/pdf');
    }

    const totalCount = selectedFiles.length + fileArray.length;
    if (totalCount > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed. You can add up to ${MAX_FILES - selectedFiles.length} more.`);
      const slotsAvailable = MAX_FILES - selectedFiles.length;
      fileArray = fileArray.slice(0, slotsAvailable);
    }

    const oversizedFiles = fileArray.filter(f => f.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setError(`${oversizedFiles.length} file(s) exceed the 10MB limit and were skipped.`);
      fileArray = fileArray.filter(f => f.size <= 10 * 1024 * 1024);
    }

    if (fileArray.length === 0) return [];

    setError(null);
    setSuccess(null);
    setSummary(null);
    return fileArray;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    if (uploading || redirecting) return;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const validFiles = processFiles(files);
    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e) => {
    let files = Array.from(e.target.files);
    if (files.length === 0) return;

    const invalidFiles = files.filter(f => f.type !== 'application/pdf');
    if (invalidFiles.length > 0) {
      setError('Upload failed. Please try again.');
      files = files.filter(f => f.type === 'application/pdf');
    }

    const totalCount = selectedFiles.length + files.length;
    if (totalCount > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed. You can add up to ${MAX_FILES - selectedFiles.length} more.`);
      const slotsAvailable = MAX_FILES - selectedFiles.length;
      files = files.slice(0, slotsAvailable);
    }

    const oversizedFiles = files.filter(f => f.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setError(`${oversizedFiles.length} file(s) exceed the 10MB limit and were skipped.`);
      files = files.filter(f => f.size <= 10 * 1024 * 1024);
    }

    if (files.length === 0) return;

    setError(null);
    setSuccess(null);
    setSummary(null);
    setSelectedFiles(prev => [...prev, ...files]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setError(null);
    setSuccess(null);
    setSummary(null);
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setError(null);
    setSuccess(null);
    setSummary(null);
    setUploadProgress(0);
    setUploadStatus('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const checkForDuplicates = async (files) => {
    setCheckingDuplicate(true);
    const duplicates = [];

    for (const file of files) {
      try {
        const res = await checkDuplicate(file.name);
        if (res.data.isDuplicate) {
          duplicates.push({
            file,
            existing: res.data.existingFile,
          });
        }
      } catch (err) {
        console.error('Duplicate check failed for', file.name, err);
      }
    }

    setCheckingDuplicate(false);
    return duplicates;
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Upload failed. Please try again.');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setSuccess(null);
      setSummary(null);
      setUploadProgress(0);
      setUploadStatus('uploading');

      const duplicates = await checkForDuplicates(selectedFiles);

      if (duplicates.length > 0) {
        setDuplicateInfo({
          duplicates,
          totalFiles: selectedFiles.length,
        });
        setPendingUpload(selectedFiles);
        setUploading(false);
        setShowDuplicateModal(true);
        return;
      }

      await performUpload(selectedFiles);
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Upload failed. Please try again.';
      setError(errorMsg);
      setUploadStatus('error');
      setUploading(false);
    }
  };

  const performUpload = async (filesToUpload) => {
    setUploading(true);
    setError(null);
    setSuccess(null);
    setSummary(null);
    setUploadProgress(0);
    setUploadStatus('uploading');

    const formData = new FormData();
    filesToUpload.forEach(file => {
      formData.append('pdfs', file);
    });

    const response = await uploadMultiplePDFs(formData, (progressEvent) => {
      const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      setUploadProgress(percent);
    });

    if (response.data.success) {
      setUploadStatus('success');
      setSuccess(`Successfully processed ${response.data.summary.totalFiles} file(s)! ${response.data.summary.totalComponents} components found, ${response.data.summary.totalMatched} matched.`);
      setSummary(response.data.summary);
      setSelectedFiles([]);

      const fileIds = response.data.fileIds || [];
      if (fileIds.length === 1) {
        setRedirectTarget('results');
        setRedirecting(true);
        setTimeout(() => navigate(`/results/${fileIds[0]}`), 1500);
      } else if (fileIds.length > 1) {
        setRedirectTarget('history');
        setRedirecting(true);
        setTimeout(() => navigate('/history'), 1500);
      }
    } else {
      setError(response.data.message || 'Upload failed. Please try again.');
      setUploadStatus('error');
    }

    setUploading(false);
  };

  const handleDuplicateKeepFile = () => {
    setShowDuplicateModal(false);
    setDuplicateInfo(null);
    if (pendingUpload) {
      performUpload(pendingUpload);
      setPendingUpload(null);
    }
  };

  const handleDuplicateCancel = () => {
    setShowDuplicateModal(false);
    setDuplicateInfo(null);
    setPendingUpload(null);
    setUploading(false);
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <Container className="fade-in">
      {/* Duplicate Warning Modal */}
      <Modal
        show={showDuplicateModal}
        onHide={handleDuplicateCancel}
        centered
        className="modern-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FiAlertTriangle className="me-2 text-warning" />
            Duplicate File Detected
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>A file with the same name already exists. Do you want to upload anyway?</p>
          {duplicateInfo && duplicateInfo.duplicates.length > 0 && (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {duplicateInfo.duplicates.map((dup, idx) => (
                <div key={idx} className="file-list-item mb-2">
                  <div className="file-info">
                    <div className="file-icon">
                      <FiFile size={16} />
                    </div>
                    <div>
                      <div className="file-name">{dup.file.name}</div>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--neutral-500)' }}>
                        Previously Uploaded: {dup.existing.uploaded_at ? new Date(dup.existing.uploaded_at).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button className="btn-modern btn-modern-outline" onClick={handleDuplicateCancel}>
            Cancel
          </button>
          <button className="btn-modern btn-modern-outline-danger" onClick={handleDuplicateCancel}>
            Cancel
          </button>
          <button className="btn-modern btn-modern-primary" onClick={handleDuplicateKeepFile}>
            Keep File
          </button>
        </Modal.Footer>
      </Modal>

      <h1 className="page-title">
        <FiUpload /> Upload PDF
      </h1>

      <Row className="justify-content-center">
        <Col md={10} lg={8}>
          <div className="modern-card">
            <div className="modern-card-body">
              {redirecting && (
                <div className="alert-modern alert-modern-info mb-4">
                  <Spinner animation="border" size="sm" className="me-2" />
                  <span>Analysis complete! Redirecting to {redirectTarget === 'results' ? 'Results page' : 'History page'}...</span>
                </div>
              )}

              {success && !redirecting && (
                <div className="alert-modern alert-modern-success mb-4">
                  <FiCheckCircle size={18} />
                  <div>
                    <strong>Upload Successful!</strong>
                    <div className="mt-1">{success}</div>
                    {summary && (
                      <div className="mt-2" style={{ fontSize: 'var(--font-xs)', opacity: 0.8 }}>
                        {summary.totalComponents} component(s) found across {summary.successfulFiles} file(s).
                        {' '}{summary.totalMatched} matched with item codes.
                        {summary.failedFiles > 0 && ` ${summary.failedFiles} file(s) failed.`}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn-modern btn-modern-sm btn-modern-outline ms-auto"
                    onClick={() => setSuccess(null)}
                  >
                    <FiX />
                  </button>
                </div>
              )}

              {error && (
                <div className="alert-modern alert-modern-danger mb-4">
                  <FiAlertCircle size={18} />
                  <div>{error}</div>
                  <button
                    className="btn-modern btn-modern-sm btn-modern-outline ms-auto"
                    onClick={() => setError(null)}
                  >
                    <FiX />
                  </button>
                </div>
              )}

              <div
                className={`upload-zone ${dragOver ? 'drag-over' : ''} ${selectedFiles.length > 0 ? 'has-files' : ''}`}
                onClick={() => !uploading && !redirecting && fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {selectedFiles.length > 0 ? (
                  <>
                    <div className="upload-icon" style={{ background: 'var(--primary-100)', color: 'var(--primary-500)' }}>
                      <FiFile size={24} />
                    </div>
                    <div className="upload-title">{selectedFiles.length} file(s) selected</div>
                    <div className="upload-subtitle">Click to add more files ({MAX_FILES - selectedFiles.length} slots remaining)</div>
                  </>
                ) : (
                  <>
                    <div className="upload-icon">
                      <FiUpload size={24} />
                    </div>
                    <div className="upload-title">Drag & drop PDF here</div>
                    <div className="upload-subtitle">or browse files</div>
                    <div className="upload-hint">Max {MAX_FILES} files, 10MB each</div>
                  </>
                )}
              </div>

              <Form.Control
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileSelect}
                ref={fileInputRef}
                className="d-none"
                multiple
              />

              {uploadStatus === 'uploading' && (
                <div className="mb-4">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span style={{ fontSize: 'var(--font-sm)', color: 'var(--neutral-500)', fontWeight: 500 }}>
                      Processing {selectedFiles.length} file(s)...
                    </span>
                    <span style={{ fontSize: 'var(--font-xs)', color: 'var(--neutral-400)', fontWeight: 600 }}>
                      {uploadProgress}%
                    </span>
                  </div>
                  <div className="progress-modern">
                    <div
                      className="progress-bar"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {selectedFiles.length > 0 && (
                <div className="mb-4">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="section-title mb-0" style={{ fontSize: 'var(--font-sm)' }}>
                      <FiFile /> Selected Files ({selectedFiles.length}/{MAX_FILES})
                    </h6>
                    {!uploading && (
                      <button className="btn-modern btn-modern-sm btn-modern-outline-danger" onClick={clearAllFiles}>
                        <FiX /> Clear All
                      </button>
                    )}
                  </div>
                  <div>
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="file-list-item">
                        <div className="file-info">
                          <div className="file-icon">
                            <FiFile size={16} />
                          </div>
                          <span className="file-name">{file.name}</span>
                          <span className="file-size">{formatFileSize(file.size)}</span>
                        </div>
                        {!uploading && (
                          <button className="file-remove" onClick={() => removeFile(index)} title="Remove file">
                            <FiX size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="d-grid gap-3">
                <button
                  className="btn-modern btn-modern-primary btn-modern-lg"
                  onClick={handleUpload}
                  disabled={selectedFiles.length === 0 || uploading || redirecting || checkingDuplicate}
                >
                  {uploading || checkingDuplicate ? (
                    <>
                      <Spinner animation="border" size="sm" />
                      {checkingDuplicate ? 'Checking for duplicates...' : `Processing ${selectedFiles.length} file(s)...`}
                    </>
                  ) : (
                    <>
                      <FiUpload />
                      Upload & Analyze {selectedFiles.length > 0 ? `(${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''})` : ''}
                    </>
                  )}
                </button>
                {!uploading && selectedFiles.length > 0 && (
                  <button className="btn-modern btn-modern-outline" onClick={clearAllFiles}>
                    Clear Selection
                  </button>
                )}
              </div>

              <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--neutral-100)' }}>
                <h6 className="section-title mb-3" style={{ fontSize: 'var(--font-sm)' }}>
                  <FiInfo /> Supported File Format
                </h6>
                <Row className="g-3">
                  <Col sm={6}>
                    <div className="d-flex align-items-center gap-2" style={{ fontSize: 'var(--font-sm)', color: 'var(--neutral-500)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-400)' }}></div>
                      PDF files only (.pdf)
                    </div>
                  </Col>
                  <Col sm={6}>
                    <div className="d-flex align-items-center gap-2" style={{ fontSize: 'var(--font-sm)', color: 'var(--neutral-500)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-400)' }}></div>
                      Upload up to {MAX_FILES} files at a time
                    </div>
                  </Col>
                  <Col sm={6}>
                    <div className="d-flex align-items-center gap-2" style={{ fontSize: 'var(--font-sm)', color: 'var(--neutral-500)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-400)' }}></div>
                      Maximum file size: 10MB per file
                    </div>
                  </Col>
                  <Col sm={6}>
                    <div className="d-flex align-items-center gap-2" style={{ fontSize: 'var(--font-sm)', color: 'var(--neutral-500)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-400)' }}></div>
                      Files are automatically analyzed after upload
                    </div>
                  </Col>
                </Row>
              </div>
            </div>
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default UploadPDF;