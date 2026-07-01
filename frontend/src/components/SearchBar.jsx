import React, { useState, useEffect, useRef } from 'react';
import { searchResults } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiX, FiFileText, FiExternalLink } from 'react-icons/fi';

const SearchBar = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (query.trim().length > 0) {
        performSearch(query);
      } else {
        setResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delaySearch);
  }, [query]);

  const performSearch = async (searchQuery) => {
    try {
      setLoading(true);
      const response = await searchResults(searchQuery);
      if (response.data.success) {
        setResults(response.data.results || []);
        setShowResults(true);
        setSelectedIndex(-1);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim().length > 0) {
      performSearch(query);
    }
  };

  const handleResultClick = (result) => {
    setShowResults(false);
    setQuery('');
    navigate(`/results/${result.file_id}`, {
      state: { 
        spotlightComponent: result,
        highlightOnLoad: true 
      }
    });
  };

  const handleKeyDown = (e) => {
    if (!showResults || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleResultClick(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowResults(false);
        break;
      default:
        break;
    }
  };

  const getMatchType = (result) => {
    const q = query.toLowerCase();
    if (result.component?.toLowerCase().includes(q)) return 'Joint Number';
    if (result.extracted_number?.toString().includes(q)) return 'Part Number';
    if (result.second_extracted_number?.toString().includes(q)) return 'Part Number';
    if (result.third_extracted_number?.toString().includes(q)) return 'Part Number';
    if (result.item_code?.toLowerCase().includes(q)) return 'ME Code';
    if (result.second_item_code?.toLowerCase().includes(q)) return 'ME Code';
    if (result.third_item_code?.toLowerCase().includes(q)) return 'ME Code';
    return 'Match';
  };

  const displayValue = (result) => {
    const q = query.toLowerCase();
    if (result.component?.toLowerCase().includes(q)) return result.component;
    if (result.extracted_number?.toString().includes(q)) return result.extracted_number;
    if (result.second_extracted_number) return result.second_extracted_number;
    if (result.third_extracted_number) return result.third_extracted_number;
    if (result.item_code?.toLowerCase().includes(q)) return result.item_code;
    if (result.second_item_code) return result.second_item_code;
    if (result.third_item_code) return result.third_item_code;
    return result.component;
  };

  return (
    <div ref={searchRef} style={{ position: 'relative', width: '320px' }}>
      <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
        <FiSearch 
          style={{ 
            position: 'absolute', 
            left: '12px', 
            top: '50%', 
            transform: 'translateY(-50%)',
            color: 'var(--neutral-400)',
            fontSize: '14px',
            pointerEvents: 'none'
          }} 
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length > 0 && setShowResults(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search: F22, G15, ME Code, Part No..."
          className="search-input"
          style={{
            width: '100%',
            paddingLeft: '36px',
            paddingRight: query ? '36px' : '12px',
            fontSize: 'var(--font-sm)',
            border: '1.5px solid var(--neutral-200)',
            borderRadius: 'var(--radius-lg)',
            transition: 'all var(--transition-fast)',
            background: 'var(--surface-bg)',
            color: 'var(--neutral-800)',
            height: '38px'
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              setShowResults(false);
            }}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--neutral-400)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <FiX size={16} />
          </button>
        )}
      </form>

      {showResults && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '8px',
          background: 'var(--surface-card)',
          border: '1px solid var(--neutral-200)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '400px',
          overflowY: 'auto',
          zIndex: 1000
        }}>
          {loading ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--neutral-500)' }}>
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--neutral-500)' }}>
              No results found
            </div>
          ) : (
            <div>
              <div style={{
                padding: 'var(--space-2) var(--space-3)',
                fontSize: 'var(--font-xs)',
                fontWeight: 600,
                color: 'var(--neutral-500)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid var(--neutral-100)'
              }}>
                {results.length} {results.length === 1 ? 'result' : 'results'} found
              </div>
              {results.map((result, idx) => {
                const matchType = getMatchType(result);
                const display = displayValue(result);
                return (
                  <div
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      background: idx === selectedIndex ? 'var(--primary-50)' : 'transparent',
                      borderBottom: '1px solid var(--neutral-100)',
                      transition: 'background var(--transition-fast)'
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <FiFileText 
                      size={16} 
                      style={{ 
                        color: 'var(--primary-500)',
                        flexShrink: 0 
                      }} 
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontWeight: 600, 
                        fontSize: 'var(--font-sm)',
                        color: 'var(--neutral-800)',
                        marginBottom: '2px'
                      }}>
                        {display}
                        <span style={{
                          marginLeft: '8px',
                          fontSize: 'var(--font-xs)',
                          fontWeight: 500,
                          color: 'var(--primary-600)',
                          background: 'var(--primary-50)',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)'
                        }}>
                          {matchType}
                        </span>
                      </div>
                      <div style={{ 
                        fontSize: 'var(--font-xs)',
                        color: 'var(--neutral-500)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {result.file_name}
                      </div>
                    </div>
                    <FiExternalLink 
                      size={14} 
                      style={{ 
                        color: 'var(--neutral-400)',
                        flexShrink: 0 
                      }} 
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;