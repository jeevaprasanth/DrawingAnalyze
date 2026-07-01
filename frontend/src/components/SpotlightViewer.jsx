import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Modal, Button, Badge } from 'react-bootstrap';
import { FiZoomIn, FiZoomOut, FiMaximize, FiMinimize, FiCrosshair, FiLayers } from 'react-icons/fi';
import * as pdfjsLib from 'pdfjs-dist';
import { getResultsByFileId } from '../services/api';

// Use the worker from the local node_modules via Vite's static serving
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const SpotlightViewer = ({ show, onHide, component, fileId }) => {
  const [zoom, setZoom] = useState(1);
  const [zoomSpeed, setZoomSpeed] = useState(600); // ms
  const [isMaximized, setIsMaximized] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [flangeHighlights, setFlangeHighlights] = useState([]);
  const [jointHighlight, setJointHighlight] = useState(null);
  const [textItems, setTextItems] = useState([]);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const renderTaskRef = useRef(null);

  // --- Extract related flanges from component data ---
  const flanges = useMemo(() => {
    const arr = [];
    if (component?.first_element_value) arr.push(component.first_element_value);
    if (component?.second_element_value) arr.push(component.second_element_value);
    if (component?.third_element_value) arr.push(component.third_element_value);
    return arr;
  }, [component]);

  // --- Extract part numbers ---
  const partNumbers = useMemo(() => {
    const arr = [];
    if (component?.extracted_number != null) arr.push(component.extracted_number);
    if (component?.second_extracted_number != null) arr.push(component.second_extracted_number);
    if (component?.third_extracted_number != null) arr.push(component.third_extracted_number);
    return arr;
  }, [component]);

  // --- Extract ME Codes ---
  const meCodes = useMemo(() => {
    const arr = [];
    if (component?.item_code) arr.push(component.item_code);
    if (component?.second_item_code) arr.push(component.second_item_code);
    if (component?.third_item_code) arr.push(component.third_item_code);
    return arr;
  }, [component]);

  // --- Combine part numbers with their corresponding ME codes ---
  const partAndMeCodes = useMemo(() => {
    const arr = [];
    const allParts = [];
    if (component?.extracted_number != null) allParts.push(component.extracted_number);
    if (component?.second_extracted_number != null) allParts.push(component.second_extracted_number);
    if (component?.third_extracted_number != null) allParts.push(component.third_extracted_number);

    const allME = [];
    if (component?.item_code) allME.push(component.item_code);
    if (component?.second_item_code) allME.push(component.second_item_code);
    if (component?.third_item_code) allME.push(component.third_item_code);

    const maxLen = Math.max(allParts.length, allME.length);
    for (let i = 0; i < maxLen; i++) {
      arr.push({
        partNumber: allParts[i] != null ? allParts[i] : null,
        meCode: allME[i] || null,
        flange: flanges[i] || null
      });
    }
    return arr;
  }, [component, flanges]);

  // --- Load PDF ---
  useEffect(() => {
    if (show && fileId) {
      setPdfDoc(null);
      setPdfUrl(null);
      setCurrentPage(1);
      setTotalPages(0);
      setFlangeHighlights([]);
      setJointHighlight(null);
      setTextItems([]);
      loadPDF(fileId);
    }
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [show, fileId]);

  // --- Track if this is a new spotlight opening ---
  const [isSpotlightActive, setIsSpotlightActive] = useState(false);
  
  // --- Handle page change and component updates ---
  useEffect(() => {
    if (pdfDoc && component) {
      const targetPage = component.page_number || 1;
      setCurrentPage(targetPage);
      setFlangeHighlights([]);
      setJointHighlight(null);
      setTextItems([]);
      
      // Trigger initial zoom-in animation when spotlight opens
      if (component.bbox_x != null && component.bbox_y != null) {
        setIsSpotlightActive(true);
        // First zoom in smoothly, then scroll to center
        setTimeout(() => {
          animateZoom(1.5); // Zoom to 150%
        }, 300);
        setTimeout(() => {
          zoomToBBox(component, true);
        }, 900);
      }
    }
  }, [pdfDoc, component]);

  const loadPDF = async (fileId) => {
    setLoading(true);
    try {
      const url = `/api/pdf/by-id/${fileId}`;
      setPdfUrl(url);
      const loadingTask = pdfjsLib.getDocument({ url });
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
    } catch (err) {
      console.error('Failed to load PDF:', err);
    } finally {
      setLoading(false);
    }
  };

  // --- Render a page on the canvas ---
  const renderPage = useCallback(async (pageNum, scale) => {
    if (!pdfDoc || !canvasRef.current) return;
    try {
      // Cancel previous render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdfDoc.getPage(pageNum);
      const container = containerRef.current;
      const canvas = canvasRef.current;
      const containerWidth = container?.clientWidth || 800;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const fitScale = (containerWidth - 40) / unscaledViewport.width;
      const finalScale = fitScale * scale;
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
  }, [pdfDoc]);

  // --- Find and highlight elements on the rendered page ---
  const findAndHighlightElements = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current || !component) return;
    if (!canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(currentPage);
      const textContent = await page.getTextContent();
      
    // Verify canvas has been rendered with correct dimensions
    const canvas = canvasRef.current;
    if (canvas.width === 0 || canvas.height === 0) {
      console.warn('Canvas not yet rendered, delaying highlight calculation');
      setTimeout(() => findAndHighlightElements(), 100);
      return;
    }

      const container = containerRef.current;
      const containerWidth = container?.clientWidth || 800;

      // Calculate scale: same as renderPage
      const unscaledViewport = page.getViewport({ scale: 1 });
      const fitScale = (containerWidth - 40) / unscaledViewport.width;
      const finalScale = fitScale * zoom;
      const viewport = page.getViewport({ scale: finalScale });

      // Transform PDF coordinates to canvas coordinates
      const transformPoint = (x, y) => {
        const [canvasX, canvasY] = viewport.convertToViewportPoint(x, y);
        return { x: canvasX, y: canvasY };
      };

      // --- 1. Highlight Joint Number (main bbox) ---
      if (component.bbox_x != null && component.bbox_y != null) {
        const tl = transformPoint(component.bbox_x, component.bbox_y);
        const br = transformPoint(
          component.bbox_x + (component.bbox_width || 80),
          component.bbox_y + (component.bbox_height || 40)
        );
        const w = br.x - tl.x;
        const h = br.y - tl.y;
        setJointHighlight({
          x: tl.x,
          y: tl.y,
          width: w,
          height: h,
          label: `Joint #${component.component}`
        });
      }

      // --- 2. Collect all text items with their transformed positions ---
      const items = textContent.items.map(item => {
        const transform = item.transform;
        const x = transform[4];
        const y = transform[5];
        const pt = transformPoint(x, y);
        const fontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);
        return {
          str: item.str.trim(),
          x: pt.x,
          y: pt.y,
          fontSize: fontSize * finalScale,
          width: item.width * finalScale,
          height: fontSize * finalScale * 1.2,
          hasSpace: /\s/.test(item.str)
        };
      });

      setTextItems(items);

      // --- Highlight helper: three-pass matching with spatial filtering ---
      const findExactMatches = (searchStr) => {
        if (!searchStr) return [];
        const cleanFull = searchStr.replace(/[\s\u00A0]/g, '').toUpperCase();
        
        // Get joint bbox center for spatial filtering (if available)
        const jointCenterX = component.bbox_x != null ? component.bbox_x + (component.bbox_width || 80) / 2 : null;
        const jointCenterY = component.bbox_y != null ? component.bbox_y + (component.bbox_height || 40) / 2 : null;
        const maxDistance = 1200; // Match items within 1200px to capture all related elements
        
        // Filter function that checks both text match AND spatial proximity
        const matchesByText = (itemArr) => {
          return itemArr.filter(item => {
            if (!item.str || item.str.trim() === '') return false;
            const itemStr = item.str.replace(/[\s\u00A0]/g, '').toUpperCase();
            const textMatches = itemStr === cleanFull || itemStr === cleanFull.replace(/\s+/g, '');
            
            if (!textMatches) return false;
            
            // Spatial filtering: only include if close to joint number
            if (jointCenterX != null && jointCenterY != null) {
              const dx = item.x - jointCenterX;
              const dy = item.y - jointCenterY;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance > maxDistance) return false;
            }
            
            return true;
          });
        };
        
        // Pass 1: Exact match after removing all whitespace (including non-breaking)
        const pass1 = matchesByText(items);
        if (pass1.length > 0) return pass1;
        
        // Pass 2: Try matching empty-item PDF strings against non-empty search
        const pass2 = matchesByText(items.filter(item => item.str.trim() === ''));
        if (pass2.length > 0) return pass2;
        
        // Pass 3: Without interior whitespace
        const cleanInterior = searchStr.replace(/\s+/g, '').toUpperCase();
        const pass3 = items.filter(item => {
          if (!item.str || item.str.trim() === '') return false;
          const itemStr = item.str.replace(/[\s\u00A0]/g, '').toUpperCase();
          const textMatches = itemStr === cleanInterior;
          if (!textMatches) return false;
          
          // Spatial filtering
          if (jointCenterX != null && jointCenterY != null) {
            const dx = item.x - jointCenterX;
            const dy = item.y - jointCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > maxDistance) return false;
          }
          
          return true;
        });
        
        return pass3;
      };

      const highlights = [];

      // --- 3. Highlight flanges ---
      flanges.forEach((flange) => {
        if (!flange) return;
        const matches = findExactMatches(flange);
        matches.forEach(match => {
          highlights.push({
            x: match.x,
            y: match.y - match.height * 0.15,
            width: match.width + 8,
            height: match.height + 4,
            color: '#10b981',
            label: `Flange: ${flange}`,
            opacity: 0.85,
            found: true
          });
        });
      });

      // --- 4. Highlight Part Numbers ---
      partNumbers.forEach((pn) => {
        if (pn == null) return;
        const strPn = String(pn);
        const matches = findExactMatches(strPn);
        matches.forEach(match => {
          highlights.push({
            x: match.x,
            y: match.y - match.height * 0.15,
            width: match.width + 8,
            height: match.height + 4,
            color: '#10b981',
            label: `Part: ${strPn}`,
            opacity: 0.85,
            found: true
          });
        });
      });

      // --- 5. Highlight ME Codes ---
      meCodes.forEach((mc) => {
        if (!mc) return;
        const matches = findExactMatches(mc);
        matches.forEach(match => {
          highlights.push({
            x: match.x,
            y: match.y - match.height * 0.15,
            width: match.width + 8,
            height: match.height + 4,
            color: '#10b981',
            label: `ME: ${mc}`,
            opacity: 0.85,
            found: true
          });
        });
      });

      setFlangeHighlights(highlights);
    } catch (err) {
      console.error('Error finding highlights:', err);
    }
  }, [pdfDoc, currentPage, zoom, component, flanges, partNumbers, meCodes]);

  // --- Re-render when page/zoom changes and recalculate highlights ---
  useEffect(() => {
    if (pdfDoc && canvasRef.current) {
      renderPage(currentPage, zoom).then(() => {
        findAndHighlightElements();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, currentPage, zoom]);

  // --- Smooth zoom to bbox with animation ---
  const zoomToBBox = (comp, animate = true) => {
    if (!comp || comp.bbox_x == null || comp.bbox_y == null) return;
    if (!canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const containerWidth = container.clientWidth || 800;
    if (canvas.width === 0 || containerWidth === 0) return;
    
    const scaleX = canvas.width / containerWidth;
    const x = comp.bbox_x * scaleX;
    const y = comp.bbox_y * scaleX;
    const w = (comp.bbox_width || 80) * scaleX;
    const h = (comp.bbox_height || 40) * scaleX;
    
    const targetScrollLeft = Math.max(0, x - containerWidth / 2 + w / 2);
    const targetScrollTop = Math.max(0, y - 80);
    
    if (animate) {
      // Smooth animated scroll with easing
      const startScrollLeft = container.scrollLeft;
      const startScrollTop = container.scrollTop;
      const duration = 800; // 800ms for smooth animation
      const startTime = performance.now();
      
      const easeInOutCubic = (t) => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      };
      
      const animateScroll = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeInOutCubic(progress);
        
        container.scrollLeft = startScrollLeft + (targetScrollLeft - startScrollLeft) * easedProgress;
        container.scrollTop = startScrollTop + (targetScrollTop - startScrollTop) * easedProgress;
        
        if (progress < 1) {
          requestAnimationFrame(animateScroll);
        }
      };
      
      requestAnimationFrame(animateScroll);
    } else {
      container.scrollLeft = targetScrollLeft;
      container.scrollTop = targetScrollTop;
    }
  };

  // --- Smooth zoom animation with configurable speed ---
  const animateZoom = (targetZoom) => {
    const startZoom = zoom;
    const duration = zoomSpeed;
    const startTime = performance.now();
    
    const easeInOutCubic = (t) => {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeInOutCubic(progress);
      
      const currentZoom = startZoom + (targetZoom - startZoom) * easedProgress;
      setZoom(currentZoom);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  };

  // --- Zoom to fit viewport (smooth scale + center) ---
  const zoomToFit = () => {
    if (!canvasRef.current || !containerRef.current) return;
    
    const container = containerRef.current;
    const canvas = canvasRef.current;
    
    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;
    
    const scaleX = containerWidth / canvas.width;
    const scaleY = containerHeight / canvas.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);
    
    animateZoom(fitZoom);
    
    // After zoom completes, scroll to center
    setTimeout(() => {
      const targetScrollLeft = Math.max(0, (canvas.width * fitZoom - containerWidth) / 2);
      const targetScrollTop = Math.max(0, (canvas.height * fitZoom - containerHeight) / 2);
      
      smoothScrollToPoint(targetScrollLeft + containerWidth / 2, targetScrollTop + containerHeight / 2);
    }, zoomSpeed + 50);
  };

  // --- Track zoom state for click-to-zoom toggle ---
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const pendingScrollRef = useRef(null);

  // --- Scroll to center a specific point in the canvas ---
  const smoothScrollToPoint = (targetX, targetY) => {
    const container = containerRef.current;
    if (!container) return;
    
    const targetScrollLeft = Math.max(0, targetX - container.clientWidth / 2);
    const targetScrollTop = Math.max(0, targetY - container.clientHeight / 2);
    
    const startScrollLeft = container.scrollLeft;
    const startScrollTop = container.scrollTop;
    const duration = 500;
    const startTime = performance.now();
    
    const easeInOutCubic = (t) => {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };
    
    const animateScroll = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeInOutCubic(progress);
      
      container.scrollLeft = startScrollLeft + (targetScrollLeft - startScrollLeft) * easedProgress;
      container.scrollTop = startScrollTop + (targetScrollTop - startScrollTop) * easedProgress;
      
      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };
    
    requestAnimationFrame(animateScroll);
  };

  // --- Handle single click on drawing to zoom to mouse position ---
  const handleDrawingClick = (e) => {
    if (!canvasRef.current || !containerRef.current) return;
    
    if (isZoomedIn) {
      // Already zoomed in - zoom out back to default
      setIsZoomedIn(false);
      animateZoom(1);
    } else {
      // Zoom in to the exact clicked position
      setIsZoomedIn(true);
      
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      
      // Get mouse position relative to the container (viewport)
      const mouseViewportX = e.clientX - containerRect.left;
      const mouseViewportY = e.clientY - containerRect.top;
      
      // Calculate where this point is in the unscrolled canvas coordinates
      const canvasClickX = container.scrollLeft + mouseViewportX;
      const canvasClickY = container.scrollTop + mouseViewportY;
      
      // Store the target for after zoom renders
      pendingScrollRef.current = {
        targetX: canvasClickX,
        targetY: canvasClickY
      };
      
      // Animate zoom to 2x
      animateZoom(2);
    }
  };

  // --- After zoom re-render, scroll to center the clicked point ---
  useEffect(() => {
    if (isZoomedIn && pendingScrollRef.current && containerRef.current) {
      const { targetX, targetY } = pendingScrollRef.current;
      smoothScrollToPoint(targetX, targetY);
      pendingScrollRef.current = null;
    }
  }, [zoom, isZoomedIn]);

  // --- Handle double-click as alternative zoom toggle ---
  const handleDoubleClick = (e) => {
    handleDrawingClick(e);
  };

  // --- Keyboard shortcuts for zooming ---
  useEffect(() => {
    if (!show) return;
    
    const handleKeyDown = (e) => {
      // Ctrl + Plus: Zoom In
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const targetZoom = Math.min(zoom + 0.35, 5);
        animateZoom(targetZoom);
      }
      // Ctrl + Minus: Zoom Out
      else if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        const targetZoom = Math.max(zoom - 0.35, 0.5);
        animateZoom(targetZoom);
      }
      // Ctrl + 0: Reset zoom
      else if ((e.ctrlKey || e.metaKey) && (e.key === '0' || e.key === ')')) {
        e.preventDefault();
        animateZoom(1);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [show, zoom]);

  // --- Ctrl + Mouse Wheel zoom ---
  useEffect(() => {
    if (!show || !containerRef.current) return;
    
    const container = containerRef.current;
    
    const handleWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      
      // Determine zoom direction: scroll up = zoom in, scroll down = zoom out
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      const targetZoom = Math.min(Math.max(zoom + delta, 0.5), 5);
      
      // Get mouse position relative to the container
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate the point in unscrolled canvas coordinates
      const canvasPointX = container.scrollLeft + mouseX;
      const canvasPointY = container.scrollTop + mouseY;
      
      // Store for post-zoom centering
      pendingScrollRef.current = {
        targetX: canvasPointX,
        targetY: canvasPointY
      };
      
      animateZoom(targetZoom);
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [show, zoom]);

  const changePage = (delta) => {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleReset = () => setZoom(1);

  // --- Track which items were found ---
  const foundFlanges = useMemo(() => {
    return flanges.map(f => f ? textItems.some(item => 
      item.str.replace(/[\s\u00A0]/g, '').toUpperCase() === f.replace(/[\s\u00A0]/g, '').toUpperCase()
    ) : false);
  }, [flanges, textItems]);

  const foundParts = useMemo(() => {
    return partNumbers.map(pn => {
      if (pn == null) return false;
      const strPn = String(pn);
      return textItems.some(item => 
        item.str.replace(/[\s\u00A0]/g, '').toUpperCase() === strPn.replace(/[\s\u00A0]/g, '').toUpperCase()
      );
    });
  }, [partNumbers, textItems]);

  const foundMeCodes = useMemo(() => {
    return meCodes.map(mc => {
      if (!mc) return false;
      return textItems.some(item => 
        item.str.replace(/[\s\u00A0]/g, '').toUpperCase() === mc.replace(/[\s\u00A0]/g, '').toUpperCase()
      );
    });
  }, [meCodes, textItems]);

  // --- Group found status with partAndMeCodes ---
  const enrichedPartAndMeCodes = useMemo(() => {
    return partAndMeCodes.map((item, idx) => ({
      ...item,
      flangeFound: foundFlanges[idx] || false,
      partFound: foundParts[idx] || false,
      meFound: foundMeCodes[idx] || false
    }));
  }, [partAndMeCodes, foundFlanges, foundParts, foundMeCodes]);

  if (!component) return null;

  // --- Render highlight overlay elements ---
  const renderHighlights = () => {
    const elements = [];

    // Joint Number spotlight (main highlight)
    if (jointHighlight) {
      elements.push(
        <div key="joint-spotlight" style={{
          position: 'absolute',
          left: jointHighlight.x - 12,
          top: jointHighlight.y - 12,
          width: jointHighlight.width + 24,
          height: jointHighlight.height + 24,
          pointerEvents: 'none',
          zIndex: 25,
          animation: 'bbox-appear 0.6s ease-out'
        }}>
          {/* Outer glow ring */}
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '8px',
            border: '4px solid #fbbf24',
            boxShadow: `
              0 0 0 4px rgba(251, 191, 36, 0.3),
              0 0 20px rgba(251, 191, 36, 0.6),
              0 0 40px rgba(251, 191, 36, 0.3),
              0 0 60px rgba(251, 191, 36, 0.15)
            `,
            animation: 'spotlight-pulse 2s ease-in-out infinite'
          }} />
          {/* Inner highlight fill */}
          <div style={{
            position: 'absolute',
            top: 4,
            left: 4,
            right: 4,
            bottom: 4,
            background: 'rgba(251, 191, 36, 0.12)',
            borderRadius: '5px'
          }} />
          {/* Label */}
          <div style={{
            position: 'absolute',
            top: -36,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#fff',
            padding: '5px 14px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(217, 119, 6, 0.45), 0 0 0 2px rgba(251, 191, 36, 0.3)',
            letterSpacing: '0.03em',
            zIndex: 30
          }}>
            {jointHighlight.label}
          </div>
          {/* Crosshair dot */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#fbbf24',
            boxShadow: '0 0 8px #fbbf24, 0 0 16px rgba(251, 191, 36, 0.4)'
          }} />
        </div>
      );
    }

    // Flange highlights with green pulse
    flangeHighlights.forEach((fh, idx) => {
      const isFound = fh.found !== false;
      elements.push(
        <div key={`flange-${idx}`} style={{
          position: 'absolute',
          left: fh.x,
          top: fh.y,
          width: fh.width,
          height: fh.height,
          pointerEvents: 'none',
          zIndex: 20,
          animation: `bbox-appear 0.6s ease-out ${idx * 0.15}s`
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            border: `3px solid ${isFound ? fh.color : '#ef4444'}`,
            borderRadius: '5px',
            background: isFound ? `${fh.color}20` : 'rgba(239, 68, 68, 0.1)',
            boxShadow: isFound 
              ? `0 0 12px ${fh.color}60, 0 0 0 2px ${fh.color}30`
              : `0 0 12px rgba(239, 68, 68, 0.4), 0 0 0 2px rgba(239, 68, 68, 0.2)`,
            animation: isFound 
              ? `green-pulse 2s ease-in-out ${idx * 0.3}s infinite, flange-glow 2s ease-in-out ${idx * 0.3}s infinite`
              : `flange-glow 2s ease-in-out ${idx * 0.3}s infinite`
          }} />
          {isFound ? (
            <div style={{
              position: 'absolute',
              top: -26,
              left: '50%',
              transform: 'translateX(-50%)',
              background: fh.color,
              color: '#fff',
              padding: '2px 10px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              letterSpacing: '0.02em'
            }}>
              {fh.label}
            </div>
          ) : (
            <div style={{
              position: 'absolute',
              top: -26,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#ef4444',
              color: '#fff',
              padding: '2px 10px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
              letterSpacing: '0.02em'
            }}>
              {fh.label}
            </div>
          )}
        </div>
      );
    });

    return elements;
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="xl"
      centered
      className="spotlight-modal"
      style={{ maxWidth: isMaximized ? '98vw' : '960px' }}
    >
      <Modal.Header closeButton className="border-0" style={{ paddingBottom: 0 }}>
        <Modal.Title className="d-flex align-items-center gap-2">
          <FiCrosshair className="text-warning" style={{ fontSize: '1.2rem' }} />
          <span>Spotlight Mode — Joint #{component.component}</span>
          <Badge
            bg="warning"
            text="dark"
            style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.03em' }}
          >
            {flanges.length > 0 ? `${flanges.length} Flange${flanges.length > 1 ? 's' : ''}` : 'No Flanges'}
          </Badge>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0">
        {/* --- Toolbar --- */}
        <div className="spotlight-toolbar" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 20px',
          background: 'var(--neutral-50)',
          borderBottom: '1px solid var(--neutral-200)',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div className="spotlight-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Badge bg="warning" text="dark" style={{ fontWeight: 700, fontSize: '0.75rem' }}>
              #{component.component}
            </Badge>
            <span className="text-muted small">
              Flanges: {flanges.length > 0 ? flanges.join(', ') : 'None'}
            </span>
          </div>
          <div className="spotlight-controls" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Button variant="outline-secondary" size="sm" onClick={() => changePage(-1)} disabled={currentPage <= 1}>
              Prev
            </Button>
            <span className="zoom-level mx-1" style={{ fontSize: '0.8rem', fontWeight: 500 }}>
              Pg {currentPage}/{totalPages}
            </span>
            <Button variant="outline-secondary" size="sm" onClick={() => changePage(1)} disabled={currentPage >= totalPages}>
              Next
            </Button>
            <div style={{ width: 1, height: 24, background: 'var(--neutral-200)', margin: '0 4px' }} />
            <Button variant="outline-secondary" size="sm" onClick={zoomToFit} title="Fit to Screen">
              <FiMaximize />
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={handleZoomOut} disabled={zoom <= 0.5}>
              <FiZoomOut />
            </Button>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: 40, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="outline-secondary" size="sm" onClick={handleZoomIn} disabled={zoom >= 5}>
              <FiZoomIn />
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={handleReset} className="ms-1">
              Reset
            </Button>
            <div style={{ width: 1, height: 24, background: 'var(--neutral-200)', margin: '0 4px' }} />
            <label style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--neutral-600)', whiteSpace: 'nowrap' }}>
              Speed:
            </label>
            <input
              type="range"
              min="200"
              max="1200"
              step="100"
              value={zoomSpeed}
              onChange={(e) => setZoomSpeed(Number(e.target.value))}
              style={{
                width: '80px',
                height: '4px',
                cursor: 'pointer',
                accentColor: 'var(--primary-500)'
              }}
              title="Zoom animation speed (200ms = fast, 1200ms = slow)"
            />
            <Button
              variant={isMaximized ? "outline-warning" : "outline-secondary"}
              size="sm"
              onClick={() => setIsMaximized(!isMaximized)}
              className="ms-1"
            >
              {isMaximized ? <FiMinimize /> : <FiMaximize />}
            </Button>
          </div>
        </div>

        {/* --- PDF Viewer --- */}
        <div className="spotlight-viewer" ref={containerRef} style={{
          height: isMaximized ? '75vh' : '520px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {loading && (
            <div className="loading-container" style={{ height: '100%' }}>
              <div className="loading-spinner"></div>
              <p className="loading-text">Loading PDF...</p>
            </div>
          )}
          {!pdfDoc && !loading && (
            <div className="pdf-placeholder" style={{ height: '100%' }}>
              <div className="empty-state">
                <div className="empty-state-icon">PDF</div>
                <div className="empty-state-title">PDF Preview</div>
                <div className="empty-state-text">PDF rendering will appear here with coordinate-based zoom.</div>
              </div>
            </div>
          )}
          {pdfDoc && (
            <div 
              className="pdf-canvas-container" 
              style={{
                overflow: 'auto',
                height: '100%',
                padding: '20px',
                position: 'relative',
                cursor: isZoomedIn ? 'zoom-out' : 'zoom-in'
              }}
              onClick={handleDrawingClick}
              onDoubleClick={handleDoubleClick}
            >
              <div style={{ position: 'relative', display: 'inline-block', minWidth: '100%' }}>
                <canvas ref={canvasRef} className="pdf-canvas" style={{ display: 'block' }} />
                <div
                  ref={overlayRef}
                  className="highlight-overlay"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none'
                  }}
                >
                  {renderHighlights()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Legend / Details Panel --- */}
        <div className="spotlight-details">
          <div style={{ padding: '14px 20px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px'
            }}>
              <FiLayers style={{ color: 'var(--primary-500)', fontSize: '1rem' }} />
              <h6 style={{
                margin: 0,
                fontWeight: 700,
                fontSize: '0.8rem',
                color: 'var(--neutral-700)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Highlighted Elements
              </h6>
            </div>

            {/* Joint Number row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 0',
              borderBottom: '1px solid var(--neutral-100)',
              marginBottom: '8px'
            }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#fbbf24',
                boxShadow: '0 0 6px rgba(251, 191, 36, 0.6)',
                flexShrink: 0
              }} />
              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--neutral-800)', minWidth: 100 }}>
                Joint #{component.component}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--neutral-400)' }}>
                {component.bbox_x != null ? 'Position locked' : 'No position data'}
              </span>
            </div>

            {/* Flange rows */}
            {flanges.length > 0 && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  Related Flanges
                </div>
                {flanges.map((flange, idx) => {
                  const color = '#10b981';
                  const enriched = enrichedPartAndMeCodes[idx];
                  return (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '4px 0'
                    }}>
                      <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: '3px',
                        background: color,
                        boxShadow: `0 0 6px ${color}60`,
                        flexShrink: 0
                      }} />
                      <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--neutral-700)', minWidth: 100 }}>
                        {flange}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--neutral-400)' }}>
                        {enriched?.partNumber != null
                          ? `Part: ${enriched.partNumber}`
                          : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Part Numbers & ME Codes Table */}
            {partAndMeCodes.length > 0 && (
              <>
                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--neutral-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 6,
                  marginTop: 8
                }}>
                  Part Numbers & ME Codes
                </div>
                <div style={{
                  background: 'var(--neutral-50)',
                  borderRadius: '8px',
                  border: '1px solid var(--neutral-200)',
                  overflow: 'hidden'
                }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.78rem'
                  }}>
                    <thead>
                      <tr style={{
                        background: 'var(--neutral-100)',
                        borderBottom: '2px solid var(--neutral-200)'
                      }}>
                        <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--neutral-600)' }}>#</th>
                        <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--neutral-600)' }}>Flange</th>
                        <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--neutral-600)' }}>Part Number</th>
                        <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--neutral-600)' }}>ME Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrichedPartAndMeCodes.map((item, idx) => (
                        <tr key={idx} style={{
                          borderBottom: idx < enrichedPartAndMeCodes.length - 1 ? '1px solid var(--neutral-100)' : 'none'
                        }}>
                          <td style={{ padding: '7px 12px', color: 'var(--neutral-400)', fontWeight: 500 }}>{idx + 1}</td>
                          <td style={{ padding: '7px 12px', fontWeight: 500, color: 'var(--neutral-700)' }}>
                            {item.flange || '—'}
                          </td>
                          <td style={{ padding: '7px 12px', fontWeight: 600, color: 'var(--neutral-800)' }}>
                            {item.partNumber != null ? item.partNumber : '—'}
                          </td>
                          <td style={{ padding: '7px 12px' }}>
                            {item.meCode ? (
                              <span style={{
                                fontFamily: 'monospace',
                                fontSize: '0.7rem',
                                background: 'var(--primary-50)',
                                color: 'var(--primary-700)',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontWeight: 500,
                                border: '1px solid var(--primary-200)'
                              }}>
                                {item.meCode}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--neutral-400)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </Modal.Body>

      {/* CSS animations injected via style tag */}
      <style>{`
        @keyframes spotlight-pulse {
          0%, 100% {
            box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.3),
                        0 0 20px rgba(251, 191, 36, 0.6),
                        0 0 40px rgba(251, 191, 36, 0.3),
                        0 0 60px rgba(251, 191, 36, 0.15);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(251, 191, 36, 0.4),
                        0 0 30px rgba(251, 191, 36, 0.7),
                        0 0 50px rgba(251, 191, 36, 0.4),
                        0 0 70px rgba(251, 191, 36, 0.2);
          }
        }
        @keyframes green-pulse {
          0%, 100% {
            box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3),
                        0 0 15px rgba(16, 185, 129, 0.5),
                        0 0 30px rgba(16, 185, 129, 0.3),
                        0 0 45px rgba(16, 185, 129, 0.15);
            opacity: 0.85;
          }
          50% {
            box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.5),
                        0 0 25px rgba(16, 185, 129, 0.7),
                        0 0 45px rgba(16, 185, 129, 0.5),
                        0 0 65px rgba(16, 185, 129, 0.25);
            opacity: 1;
          }
        }
        @keyframes flange-glow {
          0%, 100% {
            opacity: 0.8;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.03);
          }
        }
        @keyframes bbox-appear {
          0% {
            transform: scale(0.8);
            opacity: 0;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.9;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .spotlight-modal .modal-content {
          border: none;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3);
        }
        .spotlight-modal .modal-header {
          padding: 16px 20px 8px 20px;
        }
        .spotlight-modal .btn-close {
          opacity: 0.6;
          transition: opacity 0.2s;
        }
        .spotlight-modal .btn-close:hover {
          opacity: 1;
        }
        .spotlight-modal .modal-body {
          padding: 0;
        }
        .pdf-canvas-container::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .pdf-canvas-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .pdf-canvas-container::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 4px;
        }
        .pdf-canvas-container::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.25);
        }
      `}</style>
    </Modal>
  );
};

export default SpotlightViewer;