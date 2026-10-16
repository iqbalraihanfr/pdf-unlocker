import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { RENDER_SCALE, TOOLS } from '../../utils/editorConstants';

export default React.memo(function PdfPage({
  pageNum,
  numPages,
  pdfDoc,
  zoom,
  activeTool,
  activeColor,
  penWidth,
  fontSize,
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
  onAddAnnotation,
  onTextSelection,
  onOpenNotePopup,
  activeTextInput,
  setActiveTextInput,
  onCommitText,
  pageRefCallback,
}) {
  const cardRef = useRef(null);
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const currentRenderTaskRef = useRef(null);

  const [isVisible, setIsVisible] = useState(false);
  const [liveDrawPath, setLiveDrawPath] = useState([]);
  const [liveHighlightRect, setLiveHighlightRect] = useState(null);

  const isDrawingRef = useRef(false);
  const highlightStartRef = useRef(null);

  // Set page ref for parent scrolling
  const setCardRef = useCallback((el) => {
    cardRef.current = el;
    if (pageRefCallback) pageRefCallback(pageNum, el);
  }, [pageNum, pageRefCallback]);

  // Viewport intersection observer (Lazy Loading)
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { rootMargin: '300px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Render Page Canvas & Text Layer when visible and zoom/doc changes
  useEffect(() => {
    if (!pdfDoc || !isVisible) return;
    let isCancelled = false;

    async function render() {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        const textContainer = textLayerRef.current;
        if (!canvas) return;

        // Cancel any pending render task for this page
        if (currentRenderTaskRef.current) {
          try {
            currentRenderTaskRef.current.cancel();
          } catch {
            // Cancellation handled safely
          }
        }

        const viewport = page.getViewport({ scale: zoom * RENDER_SCALE });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / RENDER_SCALE}px`;
        canvas.style.height = `${viewport.height / RENDER_SCALE}px`;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });
        currentRenderTaskRef.current = renderTask;

        await renderTask.promise;
        if (isCancelled) return;

        // Render Text Layer
        if (textContainer && pdfjsLib.TextLayer) {
          textContainer.innerHTML = '';
          textContainer.style.width = `${viewport.width / RENDER_SCALE}px`;
          textContainer.style.height = `${viewport.height / RENDER_SCALE}px`;
          const textContent = await page.getTextContent();
          if (isCancelled) return;

          const displayViewport = page.getViewport({ scale: zoom });
          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textContainer,
            viewport: displayViewport,
          });
          await textLayer.render();
        }
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`Render error on page ${pageNum}:`, err);
        }
      }
    }

    render();

    return () => {
      isCancelled = true;
      if (currentRenderTaskRef.current) {
        try {
          currentRenderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, pageNum, zoom, isVisible]);

  // Pointer Event Handlers for Overlay
  const getPageCoordinates = (e) => {
    const pageRect = cardRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - pageRect.left) / zoom,
      y: (e.clientY - pageRect.top) / zoom,
    };
  };

  const handleMouseDown = (e) => {
    const coords = getPageCoordinates(e);
    if (activeTool === TOOLS.DRAW) {
      isDrawingRef.current = true;
      setLiveDrawPath([coords]);
    } else if (activeTool === TOOLS.HIGHLIGHT) {
      highlightStartRef.current = coords;
      setLiveHighlightRect({ x: coords.x, y: coords.y, width: 0, height: 0 });
    }
  };

  const handleMouseMove = (e) => {
    const coords = getPageCoordinates(e);
    if (activeTool === TOOLS.DRAW && isDrawingRef.current) {
      setLiveDrawPath(prev => [...prev, coords]);
    } else if (activeTool === TOOLS.HIGHLIGHT && highlightStartRef.current) {
      const start = highlightStartRef.current;
      setLiveHighlightRect({
        x: Math.min(start.x, coords.x),
        y: Math.min(start.y, coords.y),
        width: Math.abs(coords.x - start.x),
        height: Math.abs(coords.y - start.y),
      });
    }
  };

  const handleMouseUp = (e) => {
    const coords = getPageCoordinates(e);

    if (activeTool === TOOLS.DRAW && isDrawingRef.current) {
      isDrawingRef.current = false;
      if (liveDrawPath.length > 1) {
        onAddAnnotation({
          type: 'draw',
          page: pageNum,
          points: [...liveDrawPath, coords],
          color: activeColor,
          strokeWidth: penWidth,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
      setLiveDrawPath([]);
    } else if (activeTool === TOOLS.HIGHLIGHT && highlightStartRef.current) {
      const start = highlightStartRef.current;
      highlightStartRef.current = null;
      const w = Math.abs(coords.x - start.x);
      const h = Math.abs(coords.y - start.y);
      if (w > 5 && h > 5) {
        onAddAnnotation({
          type: 'highlight',
          page: pageNum,
          x: Math.min(start.x, coords.x),
          y: Math.min(start.y, coords.y),
          width: w,
          height: h,
          color: activeColor,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
      setLiveHighlightRect(null);
    }
  };

  const handleClick = (e) => {
    const coords = getPageCoordinates(e);

    if (activeTool === TOOLS.NOTE) {
      onOpenNotePopup({
        page: pageNum,
        x: Math.round(coords.x),
        y: Math.round(coords.y),
        isNew: true,
        text: '',
      });
    } else if (activeTool === TOOLS.TEXT) {
      setActiveTextInput({
        id: `text-${Date.now()}`,
        page: pageNum,
        x: Math.round(coords.x),
        y: Math.round(coords.y),
        text: '',
        color: activeColor,
        fontSize,
      });
    }
  };

  const handleTextLayerMouseUp = () => {
    if (activeTool !== TOOLS.SELECT) return;
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        onTextSelection(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const pageWrapper = cardRef.current;
      if (!pageWrapper) return;
      const pageRect = pageWrapper.getBoundingClientRect();

      onTextSelection({
        page: pageNum,
        text: selection.toString().trim(),
        x: rect.left - pageRect.left + rect.width / 2,
        y: rect.top - pageRect.top - 12,
        pdfRect: {
          x: (rect.left - pageRect.left) / zoom,
          y: (rect.top - pageRect.top) / zoom,
          width: rect.width / zoom,
          height: rect.height / zoom,
        },
      });
    }, 25);
  };

  const pageAnnotations = annotations.filter(a => a.page === pageNum);

  return (
    <div
      ref={setCardRef}
      className="pdf-page-card"
      data-page-number={pageNum}
    >
      <div className="pdf-page-header-tag" aria-hidden="true">
        Halaman {pageNum} dari {numPages}
      </div>

      <div
        className={`pdf-canvas-container tool-mode-${activeTool}`}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Canvas Layer */}
        <canvas ref={canvasRef} />

        {/* Text Layer for Selection */}
        <div
          ref={textLayerRef}
          className="textLayer"
          onMouseUp={handleTextLayerMouseUp}
        />

        {/* SVG Annotations Overlay */}
        <svg
          className="pdf-annotation-svg"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: `${100 / zoom}%`,
            height: `${100 / zoom}%`,
          }}
        >
          {/* Live Dragging Highlight */}
          {liveHighlightRect && (
            <rect
              x={liveHighlightRect.x}
              y={liveHighlightRect.y}
              width={liveHighlightRect.width}
              height={liveHighlightRect.height}
              fill={activeColor}
              opacity={0.35}
            />
          )}

          {/* Live Drawing Path */}
          {liveDrawPath.length > 1 && (
            <path
              d={liveDrawPath.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '')}
              stroke={activeColor}
              strokeWidth={penWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Existing Saved Annotations */}
          {pageAnnotations.map((annot, aIdx) => {
            const isSelected = selectedAnnotationId === annot.id;

            if (annot.type === 'highlight') {
              return (
                <rect
                  key={annot.id}
                  x={annot.x}
                  y={annot.y}
                  width={annot.width}
                  height={annot.height}
                  fill={annot.color}
                  opacity={isSelected ? 0.6 : 0.35}
                  className={`annot-svg-highlight ${isSelected ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(annot.id);
                  }}
                />
              );
            }

            if (annot.type === 'draw' && annot.points?.length > 1) {
              const d = annot.points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');
              return (
                <path
                  key={annot.id}
                  d={d}
                  stroke={annot.color}
                  strokeWidth={annot.strokeWidth || 3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`annot-svg-draw ${isSelected ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(annot.id);
                  }}
                />
              );
            }

            if (annot.type === 'text') {
              return (
                <text
                  key={annot.id}
                  x={annot.x}
                  y={annot.y + (annot.fontSize || 16)}
                  fill={annot.color}
                  fontSize={annot.fontSize || 16}
                  fontFamily="sans-serif"
                  fontWeight="600"
                  className={`annot-svg-text ${isSelected ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(annot.id);
                  }}
                >
                  {annot.text}
                </text>
              );
            }

            if (annot.type === 'note') {
              return (
                <g
                  key={annot.id}
                  transform={`translate(${annot.x}, ${annot.y})`}
                  className={`annot-svg-pin ${isSelected ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(annot.id);
                    onOpenNotePopup({
                      noteId: annot.id,
                      page: annot.page,
                      x: annot.x,
                      y: annot.y,
                      text: annot.text || '',
                      isNew: false,
                    });
                  }}
                >
                  <circle r={12} fill={annot.color} filter="drop-shadow(0 2px 4px rgba(0,0,0,0.4))" />
                  <text textAnchor="middle" dy=".3em" fill="#000" fontSize="11" fontWeight="bold">
                    {aIdx + 1}
                  </text>
                </g>
              );
            }

            return null;
          })}
        </svg>

        {/* Inline Free Text Input */}
        {activeTextInput && activeTextInput.page === pageNum && (
          <div
            className="canvas-inline-text-wrapper"
            style={{
              left: `${activeTextInput.x * zoom}px`,
              top: `${activeTextInput.y * zoom}px`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <input
              autoFocus
              type="text"
              className="canvas-inline-input"
              placeholder="Ketik teks di sini..."
              style={{
                fontSize: `${activeTextInput.fontSize * zoom}px`,
                color: activeTextInput.color,
              }}
              value={activeTextInput.text}
              onChange={e => setActiveTextInput(prev => ({ ...prev, text: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') onCommitText();
                else if (e.key === 'Escape') setActiveTextInput(null);
              }}
              onBlur={onCommitText}
            />
          </div>
        )}
      </div>
    </div>
  );
});
