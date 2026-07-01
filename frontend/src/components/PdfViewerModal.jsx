import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { FiZoomIn, FiZoomOut, FiMaximize, FiMinimize, FiFileText, FiSearch } from 'react-icons/fi';
import * as pdfjsLib from 'pdfjs-dist';

// Use the worker from the local node_modules via Vite's static serving
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PdfViewerModal = ({ show, onHide, fileId }) => {
  const [zoom, setZoom] = useState(1);
  const [isMaximized, setIsMaximized] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState(0);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const pdfUrlRef = useRef(null);

  // --- Load PDF when modal opens ---
  useEffect(() => {
    if (show && fileId) {
      loadPdf();
    }
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      setPdfDoc(null);
      setCurrentPage(1);
      setTotalPages(0);
      setZoom(1);
      setSearchQuery('');
      setSearchMatches(0);
    };
  }, [show, fileId]);

  // --- Re-render page when page/zoom changes ---
  useEffect(() => {
    if (pdfDoc && canvasRef.current) {
      renderPage();
    }
  }, [pdfDoc, currentPage, zoom]);

  const loadPdf = async () => {
    setLoading(true);
    setSearchQuery('');
    setSearchMatches(0);
    try {
      const url = `/api/pdf/by-id/${fileId}`;
      pdfUrlRef.current = url;
      const loadingTask = pdfjsLib.getDocument({ url });
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
    } catch (err) {
      console.error('Failed to load PDF:', err);
    } finally {
      setLoading(false);
    }
  };

  const runSearch = useCallback(async () => {
    if (!pdfDoc || !searchQuery.trim()) {
      setSearchMatches(0);
      return;
    }
    try {
      const q = searchQuery.trim().toUpperCase();
      let count = 0;
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        textContent.items.forEach(item => {
          if (item.str.toUpperCase().includes(q)) count++;
        });
      }
      setSearchMatches(count);
    } catch {
      // silent
    }
  }, [pdfDoc, searchQuery, totalPages]);

  // --- Run search when query changes ---
  useEffect(() => {
    runSearch();
  }, [searchQuery, runSearch]);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdfDoc.getPage(currentPage);
      const container = containerRef.current;
      const canvas = canvasRef.current;
      const containerWidth = container?.clientWidth || 800;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const fitScale = (containerWidth - 40) / unscaledViewport.width;
      const finalScale = fitScale * zoom;
      const viewport = page.getViewport({ scale: finalScale });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: canvas.getContext('2d'),
        viewport: viewport,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      renderTaskRef.current = null;
    } catch (err) {
      if (err.name !== 'RenderingCancelledException') {
        console.error('Error rendering page:', err);
      }
    }
  }, [pdfDoc, currentPage, zoom]);

  const changePage = (delta) => {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleReset = () => setZoom(1);

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="xl"
      centered
      className="pdf-viewer-modal"
      style={{ maxWidth: isMaximized ? '98vw' : '960px' }}
    >
      <Modal.Header closeButton className="border-0" style={{ paddingBottom: 0 }}>
        <Modal.Title className="d-flex align-items-center gap-2" style={{ fontSize: '1rem' }}>
          <FiFileText className="text-primary" style={{ fontSize: '1.2rem' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
            PDF Preview
          </span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0">
        {/* --- Toolbar --- */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 20px',
          background: 'var(--neutral-50)',
          borderBottom: '1px solid var(--neutral-200)',
          borderTop: '1px solid var(--neutral-200)',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', fontWeight: 500 }}>
            {totalPages > 0 ? `Page ${currentPage} of ${totalPages}` : 'Loading...'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Button variant="outline-secondary" size="sm" onClick={() => changePage(-1)} disabled={currentPage <= 1}>
              Prev
            </Button>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: 30, textAlign: 'center' }}>
              {currentPage}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--neutral-400)' }}>/</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--neutral-500)' }}>{totalPages}</span>
            <Button variant="outline-secondary" size="sm" onClick={() => changePage(1)} disabled={currentPage >= totalPages}>
              Next
            </Button>
            <div style={{ width: 1, height: 24, background: 'var(--neutral-200)', margin: '0 4px' }} />
            <Button variant="outline-secondary" size="sm" onClick={handleZoomOut} disabled={zoom <= 0.5}>
              <FiZoomOut />
            </Button>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: 40, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="outline-secondary" size="sm" onClick={handleZoomIn} disabled={zoom >= 3}>
              <FiZoomIn />
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={handleReset} className="ms-1">
              Reset
            </Button>
            <Button
              variant={isMaximized ? 'outline-primary' : 'outline-secondary'}
              size="sm"
              onClick={() => setIsMaximized(!isMaximized)}
              className="ms-1"
            >
              {isMaximized ? <FiMinimize /> : <FiMaximize />}
            </Button>
          </div>
        </div>

        {/* --- Search Bar --- */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 20px',
          background: 'var(--surface-card)',
          borderBottom: '1px solid var(--neutral-200)'
        }}>
          <FiSearch style={{ color: 'var(--neutral-400)', fontSize: '0.85rem' }} />
          <Form.Control
            type="text"
            placeholder="Search in PDF..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="sm"
            style={{
              fontSize: '0.8rem',
              border: '1px solid var(--neutral-200)',
              borderRadius: '6px',
              padding: '4px 10px',
              maxWidth: 300
            }}
          />
          {searchQuery && searchMatches > 0 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--primary-600)', fontWeight: 600 }}>
              {searchMatches} match{searchMatches !== 1 ? 'es' : ''}
            </span>
          )}
          {searchQuery && searchMatches === 0 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--neutral-400)' }}>No matches</span>
          )}
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => { setSearchQuery(''); setSearchMatches(0); }}
            disabled={!searchQuery}
          >
            Clear
          </Button>
        </div>

        {/* --- PDF Viewer --- */}
        <div className="pdf-viewer-body" ref={containerRef} style={{
          height: isMaximized ? '80vh' : '550px',
          position: 'relative',
          overflow: 'hidden',
          background: '#e8e8e8'
        }}>
          {loading && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '16px'
            }}>
              <div style={{
                width: 40, height: 40,
                border: '3px solid var(--neutral-200)',
                borderTopColor: 'var(--primary-500)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
              <p style={{ fontSize: '0.875rem', color: 'var(--neutral-500)', fontWeight: 500, margin: 0 }}>
                Loading PDF...
              </p>
            </div>
          )}
          {!pdfDoc && !loading && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '40px',
              textAlign: 'center'
            }}>
              <div style={{
                width: 72, height: 72,
                borderRadius: '16px',
                background: 'var(--neutral-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                fontSize: '1.75rem',
                color: 'var(--neutral-400)'
              }}>
                PDF
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--neutral-700)', marginBottom: '8px' }}>
                PDF Preview
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--neutral-500)' }}>
                No PDF file loaded. Please try again.
              </div>
            </div>
          )}
          {pdfDoc && (
            <div style={{
              overflow: 'auto',
              height: '100%',
              padding: '20px',
              position: 'relative'
            }}>
              <div style={{ position: 'relative', display: 'inline-block', minWidth: '100%' }}>
                <canvas ref={canvasRef} style={{ display: 'block' }} />
              </div>
            </div>
          )}
        </div>
      </Modal.Body>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .pdf-viewer-modal .modal-content {
          border: none;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3);
        }
        .pdf-viewer-modal .modal-header {
          padding: 16px 20px 8px 20px;
        }
        .pdf-viewer-modal .btn-close {
          opacity: 0.6;
          transition: opacity 0.2s;
        }
        .pdf-viewer-modal .btn-close:hover {
          opacity: 1;
        }
        .pdf-viewer-modal .modal-body {
          padding: 0;
        }
        .pdf-viewer-body::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .pdf-viewer-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .pdf-viewer-body::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 4px;
        }
        .pdf-viewer-body::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.25);
        }
      `}</style>
    </Modal>
  );
};

export default PdfViewerModal;