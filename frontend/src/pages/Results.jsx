import React, { useState, useEffect } from 'react';
import { Container, Spinner, Alert } from 'react-bootstrap';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FiArrowLeft, FiDownload, FiFileText, FiSearch, FiCheckCircle, FiXCircle, FiInfo } from 'react-icons/fi';
import { getResultsByFileId } from '../services/api';
import * as XLSX from 'xlsx';
import SpotlightViewer from '../components/SpotlightViewer';

const Results = () => {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [fileInfo, setFileInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [found, setFound] = useState(false);
  const [spotlightComponent, setSpotlightComponent] = useState(null);
  const [showSpotlight, setShowSpotlight] = useState(false);
  const location = useLocation();

  useEffect(() => {
    fetchResults();
    
    // Check if navigated from search with a specific component to highlight
    const navState = location.state;
    if (navState?.spotlightComponent && navState.highlightOnLoad) {
      setSpotlightComponent(navState.spotlightComponent);
      setShowSpotlight(true);
    }
  }, [fileId, location.state]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getResultsByFileId(fileId);
      if (response.data.success) {
        setResults(response.data.results || []);
        setFileInfo(response.data.file);
        setFound(response.data.found === true);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Results not found for this file');
      } else {
        setError('Failed to load results. Please ensure the backend server is running.');
      }
      console.error('Results error:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    if (results.length === 0) return;

    const excelData = results.map((r, index) => {
      return {
        'S.No': index + 1,
        'JOINT NUMBER': r.component || '',
        'RELATED FLANGES': r.related_elements || '',
        'FIRST FLANGE NO': r.first_element_value || '',
        'FIRST PART NUMBER': r.extracted_number !== null && r.extracted_number !== undefined ? r.extracted_number : '',
        'FIRST ME CODE': r.item_code || 'Not Found',
        'SECOND FLANGE NO': r.second_element_value || '',
        'SECOND PART NUMBER': r.second_extracted_number !== null && r.second_extracted_number !== undefined ? r.second_extracted_number : '',
        'SECOND ME CODE': r.second_item_code || '',
        'THIRD FLANGE NO': r.third_element_value || '',
        'THIRD PART NUMBER': r.third_extracted_number !== null && r.third_extracted_number !== undefined ? r.third_extracted_number : '',
        'THIRD ME CODE': r.third_item_code || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Components');
    
    const colWidths = Object.keys(excelData[0]).map(key => ({
      wch: Math.max(key.length, 15)
    }));
    ws['!cols'] = colWidths;

    const fileName = fileInfo 
      ? `analysis_${fileInfo.file_name.replace('.pdf', '')}_${new Date().toISOString().split('T')[0]}.xlsx`
      : `analysis_results_${fileId}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    XLSX.writeFile(wb, fileName);
  };

  if (loading) {
    return (
      <Container>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading results...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container fluid className="fade-in">
      {error && (
        <Container>
          <div className="alert-modern alert-modern-danger mb-4">
            <FiXCircle size={18} />
            <div>
              {error}
              <div className="mt-2 d-flex gap-2">
                <button className="btn-modern btn-modern-sm btn-modern-outline-danger" onClick={() => navigate('/upload')}>
                  Upload a PDF
                </button>
                <button className="btn-modern btn-modern-sm btn-modern-outline" onClick={() => navigate('/dashboard')}>
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        </Container>
      )}

      {!error && (
        <>
          <Container>
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
              <div className="d-flex align-items-center gap-3">
                <button 
                  className="btn-modern btn-modern-sm btn-modern-outline"
                  onClick={() => navigate(-1)}
                >
                  <FiArrowLeft /> Back
                </button>
                <h1 className="page-title mb-0">
                  <FiFileText /> Component Analysis Results
                </h1>
              </div>
              {found && (
                <button className="btn-modern btn-modern-success" onClick={exportToExcel}>
                  <FiDownload /> Export to Excel
                </button>
              )}
            </div>

            {fileInfo && (
              <div className="file-info-bar mb-4">
                <div className="file-info-text">
                  <FiFileText size={16} style={{ color: 'var(--primary-500)' }} />
                  <strong>{fileInfo.file_name}</strong>
                  <span className="file-info-divider"></span>
                  <span>Status: </span>
                  <span className={`status-badge ${fileInfo.upload_status}`}>
                    {fileInfo.upload_status.charAt(0).toUpperCase() + fileInfo.upload_status.slice(1)}
                  </span>
                </div>
                {found && (
                  <div style={{ fontSize: 'var(--font-sm)', color: 'var(--neutral-500)' }}>
                    {results.length} Joint No{results.length > 1 ? 's' : ''} found
                  </div>
                )}
              </div>
            )}
          </Container>

          <Container>
            <div className="modern-card">
              <div className="modern-card-body p-0">
                {!found ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <FiSearch />
                    </div>
                    <div className="empty-state-title">No Joint No Found</div>
                    <div className="empty-state-text">
                      No Joint No exist within the F-1000 to F-1999 range in this PDF.
                    </div>
                    <div className="d-flex gap-3">
                      <button 
                        className="btn-modern btn-modern-primary"
                        onClick={() => navigate('/upload')}
                      >
                        Upload Another PDF
                      </button>
                      <button 
                        className="btn-modern btn-modern-outline"
                        onClick={() => navigate('/dashboard')}
                      >
                        Back to Dashboard
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="modern-table-wrapper">
                    <table className="modern-table">
                      <thead>
                        <tr>
                          <th style={{width: '60px', textAlign: 'center'}}>#</th>
                          <th className="selectable-text">Joint Number</th>
                          <th className="non-selectable-text">Flanges</th>
                          <th className="non-selectable-text">Part Numbers</th>
                          <th className="selectable-text">ME Code</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((result, index) => {
                          const elements = [];
                          if (result.first_element_value) elements.push(result.first_element_value);
                          if (result.second_element_value) elements.push(result.second_element_value);
                          if (result.third_element_value) elements.push(result.third_element_value);

                          const numbers = [];
                          if (result.extracted_number !== null && result.extracted_number !== undefined) numbers.push(result.extracted_number);
                          if (result.second_extracted_number !== null && result.second_extracted_number !== undefined) numbers.push(result.second_extracted_number);
                          if (result.third_extracted_number !== null && result.third_extracted_number !== undefined) numbers.push(result.third_extracted_number);

                          const itemCodes = [];
                          if (result.item_code) itemCodes.push(result.item_code);
                          else if (result.extracted_number !== null) itemCodes.push('Not Found');
                          if (result.second_item_code) itemCodes.push(result.second_item_code);
                          else if (result.second_extracted_number !== null) itemCodes.push('Not Found');
                          if (result.third_item_code) itemCodes.push(result.third_item_code);
                          else if (result.third_extracted_number !== null) itemCodes.push('Not Found');

                          return (
                            <tr key={result.id || index}>
                              <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--neutral-400)' }}>
                                {index + 1}
                              </td>
                               <td>
                                 <button
                                   className="btn btn-link p-0 text-decoration-none fw-semibold"
                                   style={{ color: 'var(--primary-600)' }}
                                   onClick={() => {
                                     setSpotlightComponent(result);
                                     setShowSpotlight(true);
                                   }}
                                 >
                                   {result.component}
                                 </button>
                               </td>
                              <td className="non-selectable-text">
                                {elements.length > 0 ? (
                                  <div className="d-flex flex-wrap gap-1">
                                    {elements.map((el, i) => (
                                      <span key={i} className="code-value">{el}</span>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--neutral-400)' }}>—</span>
                                )}
                              </td>
                              <td className="non-selectable-text">
                                {numbers.length > 0 ? (
                                  <span style={{ fontWeight: 600 }}>
                                    {numbers.join(', ')}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--neutral-400)' }}>—</span>
                                )}
                              </td>
                              <td className="selectable-text">
                                {itemCodes.length > 0 ? (
                                  <div className="d-flex flex-wrap gap-1">
                                    {itemCodes.map((code, i) => (
                                      <span 
                                        key={i} 
                                        className={`code-value ${code === 'Not Found' ? 'not-found' : ''}`}
                                      >
                                        {code}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="code-value not-found">Not Found</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </Container>
        </>
      )}

      {/* Spotlight Viewer Modal */}
      <SpotlightViewer
        show={showSpotlight}
        onHide={() => setShowSpotlight(false)}
        component={spotlightComponent}
        fileId={fileId}
      />
    </Container>
  );
};

export default Results;