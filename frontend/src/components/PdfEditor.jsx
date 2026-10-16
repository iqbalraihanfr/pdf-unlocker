import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  MousePointer,
  Highlighter,
  MessageSquare,
  Type,
  PenTool,
  Undo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Save,
  Folder,
  X,
  Trash2,
  Check,
  ShieldCheck,
  Loader2,
  ArrowLeft,
  FileCheck2
} from 'lucide-react';

// Use disableWorker for 100% offline self-contained operation in pywebview
const RENDER_SCALE = 1.5;

const PALETTE = [
  { name: 'Kuning', hex: '#FFD300', rgb: [1, 0.827, 0], bg: 'rgba(255, 211, 0, 0.35)' },
  { name: 'Lime', hex: '#AEE938', rgb: [0.682, 0.914, 0.22], bg: 'rgba(174, 233, 56, 0.35)' },
  { name: 'Sky', hex: '#38BDF8', rgb: [0.22, 0.745, 0.973], bg: 'rgba(56, 189, 248, 0.35)' },
  { name: 'Rose', hex: '#F472B6', rgb: [0.957, 0.447, 0.714], bg: 'rgba(244, 114, 182, 0.35)' },
  { name: 'Putih', hex: '#FFFFFF', rgb: [1, 1, 1], bg: 'rgba(255, 255, 255, 0.35)' },
];

function hexToRgb(hex) {
  const c = PALETTE.find(p => p.hex.toLowerCase() === hex.toLowerCase());
  if (c) return c.rgb;
  const num = parseInt(hex.replace('#', ''), 16);
  return [(num >> 16) / 255, ((num >> 8) & 0xff) / 255, (num & 0xff) / 255];
}

export default function PdfEditor({ file, onClose, onSaveSuccess }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [activeTool, setActiveTool] = useState('select'); // select, highlight, note, text, draw
  const [activeColor, setActiveColor] = useState('#FFD300');
  const [fontSize, setFontSize] = useState(16);
  const [penWidth, setPenWidth] = useState(3);
  const [annotations, setAnnotations] = useState([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessInfo, setSaveSuccessInfo] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectionPill, setSelectionPill] = useState(null);
  const [activeNotePopup, setActiveNotePopup] = useState(null);
  const [activeTextInput, setActiveTextInput] = useState(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);

  const containerRef = useRef(null);
  const pagesContainerRef = useRef(null);
  const pageRefs = useRef({});
  const canvasRefs = useRef({});
  const textLayerRefs = useRef({});
  const isDrawingRef = useRef(false);
  const currentDrawPathRef = useRef([]);
  const highlightStartRef = useRef(null);
  const rawPdfBytesRef = useRef(null);

  // Load PDF from base64
  useEffect(() => {
    let isCancelled = false;
    async function loadPdf() {
      setIsLoading(true);
      setErrorMessage('');
      try {
        let base64Data = file.data;
        if (!base64Data && file.path && window.pywebview?.api?.read_pdf_base64) {
          const res = await window.pywebview.api.read_pdf_base64(file.path);
          if (!res.success) throw new Error(res.error || 'Gagal membaca PDF');
          base64Data = res.data;
        }

        if (!base64Data) throw new Error('Data file PDF tidak ditemukan');

        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        rawPdfBytesRef.current = bytes;

        const loadingTask = pdfjsLib.getDocument({
          data: bytes,
          disableWorker: true,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (isCancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        if (isCancelled) return;
        console.error('Error loading PDF:', err);
        setErrorMessage('Gagal membuka dokumen PDF: ' + (err.message || 'Format tidak didukung'));
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    loadPdf();
    return () => { isCancelled = true; };
  }, [file]);

  // Render individual page
  const renderPage = useCallback(async (pageNum) => {
    if (!pdfDoc) return;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRefs.current[pageNum];
      const textContainer = textLayerRefs.current[pageNum];
      if (!canvas) return;

      const viewport = page.getViewport({ scale: zoom * RENDER_SCALE });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / RENDER_SCALE}px`;
      canvas.style.height = `${viewport.height / RENDER_SCALE}px`;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport,
      };
      await page.render(renderContext).promise;

      // Render Text Layer for text selection & highlight
      if (textContainer && pdfjsLib.TextLayer) {
        textContainer.innerHTML = '';
        textContainer.style.width = `${viewport.width / RENDER_SCALE}px`;
        textContainer.style.height = `${viewport.height / RENDER_SCALE}px`;
        const textContent = await page.getTextContent();
        const displayViewport = page.getViewport({ scale: zoom });
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textContainer,
          viewport: displayViewport,
        });
        await textLayer.render();
      }
    } catch (err) {
      console.warn('Render page error for page', pageNum, err);
    }
  }, [pdfDoc, zoom]);

  // Render all pages on zoom or doc change
  useEffect(() => {
    if (!pdfDoc) return;
    for (let i = 1; i <= numPages; i++) {
      renderPage(i);
    }
  }, [pdfDoc, numPages, zoom, renderPage]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'Escape') {
        setActiveTool('select');
        setSelectionPill(null);
        setActiveNotePopup(null);
        setActiveTextInput(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleUndo = () => {
    if (annotations.length === 0) return;
    setAnnotations(prev => prev.slice(0, -1));
  };

  // Add Annotation Helper
  const addAnnotation = (newAnnot) => {
    setAnnotations(prev => [...prev, { ...newAnnot, id: 'annot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4) }]);
  };

  // Remove Annotation Helper
  const removeAnnotation = (id) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
    if (activeNotePopup?.noteId === id) setActiveNotePopup(null);
  };

  // Handle Text Selection Floating Pill
  const handleTextLayerMouseUp = (pageNum) => {
    if (activeTool !== 'select') return;
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setSelectionPill(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const pageWrapper = pageRefs.current[pageNum];
      if (!pageWrapper) return;
      const pageRect = pageWrapper.getBoundingClientRect();

      setSelectionPill({
        page: pageNum,
        text: selection.toString().trim(),
        x: rect.left - pageRect.left + rect.width / 2,
        y: rect.top - pageRect.top - 12,
        pdfRect: {
          x: (rect.left - pageRect.left) / zoom,
          y: (rect.top - pageRect.top) / zoom,
          width: rect.width / zoom,
          height: rect.height / zoom,
        }
      });
    }, 20);
  };

  const applyHighlightFromSelection = () => {
    if (!selectionPill) return;
    addAnnotation({
      type: 'highlight',
      page: selectionPill.page,
      x: selectionPill.pdfRect.x,
      y: selectionPill.pdfRect.y,
      width: selectionPill.pdfRect.width,
      height: selectionPill.pdfRect.height,
      color: activeColor,
      text: selectionPill.text,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    window.getSelection()?.removeAllRanges();
    setSelectionPill(null);
  };

  const applyNoteFromSelection = () => {
    if (!selectionPill) return;
    const noteId = 'note-' + Date.now();
    const newNote = {
      id: noteId,
      type: 'note',
      page: selectionPill.page,
      x: selectionPill.pdfRect.x + selectionPill.pdfRect.width,
      y: selectionPill.pdfRect.y,
      color: activeColor,
      quote: selectionPill.text,
      text: '',
      author: 'Saya',
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    addAnnotation(newNote);
    setActiveNotePopup({
      noteId,
      page: selectionPill.page,
      x: selectionPill.pdfRect.x + selectionPill.pdfRect.width,
      y: selectionPill.pdfRect.y,
      isNew: true,
      text: '',
    });
    window.getSelection()?.removeAllRanges();
    setSelectionPill(null);
  };

  // Canvas Overlay Pointer Event Handlers
  const handleOverlayMouseDown = (pageNum, e) => {
    const pageWrapper = pageRefs.current[pageNum];
    if (!pageWrapper) return;
    const pageRect = pageWrapper.getBoundingClientRect();
    const x = (e.clientX - pageRect.left) / zoom;
    const y = (e.clientY - pageRect.top) / zoom;

    if (activeTool === 'draw') {
      isDrawingRef.current = true;
      currentDrawPathRef.current = [{ x, y }];
    } else if (activeTool === 'highlight') {
      highlightStartRef.current = { x, y };
    }
  };

  const handleOverlayMouseMove = (pageNum, e) => {
    const pageWrapper = pageRefs.current[pageNum];
    if (!pageWrapper) return;
    const pageRect = pageWrapper.getBoundingClientRect();
    const x = (e.clientX - pageRect.left) / zoom;
    const y = (e.clientY - pageRect.top) / zoom;

    if (activeTool === 'draw' && isDrawingRef.current) {
      currentDrawPathRef.current.push({ x, y });
      // Live preview draw
      const liveSvg = document.getElementById(`live-draw-${pageNum}`);
      if (liveSvg) {
        const d = currentDrawPathRef.current.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');
        liveSvg.setAttribute('d', d);
      }
    } else if (activeTool === 'highlight' && highlightStartRef.current) {
      const start = highlightStartRef.current;
      const liveRect = document.getElementById(`live-highlight-${pageNum}`);
      if (liveRect) {
        const rx = Math.min(start.x, x);
        const ry = Math.min(start.y, y);
        const rw = Math.abs(x - start.x);
        const rh = Math.abs(y - start.y);
        liveRect.setAttribute('x', rx);
        liveRect.setAttribute('y', ry);
        liveRect.setAttribute('width', rw);
        liveRect.setAttribute('height', rh);
      }
    }
  };

  const handleOverlayMouseUp = (pageNum, e) => {
    const pageWrapper = pageRefs.current[pageNum];
    if (!pageWrapper) return;
    const pageRect = pageWrapper.getBoundingClientRect();
    const x = (e.clientX - pageRect.left) / zoom;
    const y = (e.clientY - pageRect.top) / zoom;

    if (activeTool === 'draw' && isDrawingRef.current) {
      isDrawingRef.current = false;
      const pts = currentDrawPathRef.current;
      if (pts.length > 1) {
        addAnnotation({
          type: 'draw',
          page: pageNum,
          points: pts,
          color: activeColor,
          strokeWidth: penWidth,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
      currentDrawPathRef.current = [];
      const liveSvg = document.getElementById(`live-draw-${pageNum}`);
      if (liveSvg) liveSvg.setAttribute('d', '');
    } else if (activeTool === 'highlight' && highlightStartRef.current) {
      const start = highlightStartRef.current;
      highlightStartRef.current = null;
      const rx = Math.min(start.x, x);
      const ry = Math.min(start.y, y);
      const rw = Math.abs(x - start.x);
      const rh = Math.abs(y - start.y);
      if (rw > 5 && rh > 5) {
        addAnnotation({
          type: 'highlight',
          page: pageNum,
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          color: activeColor,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
      const liveRect = document.getElementById(`live-highlight-${pageNum}`);
      if (liveRect) {
        liveRect.setAttribute('width', '0');
        liveRect.setAttribute('height', '0');
      }
    }
  };

  const handleOverlayClick = (pageNum, e) => {
    const pageWrapper = pageRefs.current[pageNum];
    if (!pageWrapper) return;
    const pageRect = pageWrapper.getBoundingClientRect();
    const x = (e.clientX - pageRect.left) / zoom;
    const y = (e.clientY - pageRect.top) / zoom;

    if (activeTool === 'note') {
      const noteId = 'note-' + Date.now();
      const newNote = {
        id: noteId,
        type: 'note',
        page: pageNum,
        x: Math.round(x),
        y: Math.round(y),
        color: activeColor,
        text: '',
        author: 'Saya',
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      addAnnotation(newNote);
      setActiveNotePopup({
        noteId,
        page: pageNum,
        x: Math.round(x),
        y: Math.round(y),
        isNew: true,
        text: '',
      });
      setActiveTool('select');
    } else if (activeTool === 'text') {
      const textId = 'text-' + Date.now();
      setActiveTextInput({
        id: textId,
        page: pageNum,
        x: Math.round(x),
        y: Math.round(y),
        text: '',
        color: activeColor,
        fontSize,
      });
      setActiveTool('select');
    }
  };

  // Commit free text annotation
  const handleCommitText = () => {
    if (!activeTextInput || !activeTextInput.text.trim()) {
      setActiveTextInput(null);
      return;
    }
    addAnnotation({
      id: activeTextInput.id,
      type: 'text',
      page: activeTextInput.page,
      x: activeTextInput.x,
      y: activeTextInput.y,
      text: activeTextInput.text,
      color: activeTextInput.color,
      fontSize: activeTextInput.fontSize,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    setActiveTextInput(null);
  };

  // Commit sticky note comment
  const handleSaveNoteComment = (noteId, commentText) => {
    if (!commentText.trim()) {
      removeAnnotation(noteId);
    } else {
      setAnnotations(prev => prev.map(a => a.id === noteId ? { ...a, text: commentText } : a));
    }
    setActiveNotePopup(null);
  };

  // Scroll smoothly to annotation
  const scrollToAnnotation = (annot) => {
    setSelectedAnnotationId(annot.id);
    const pageWrapper = pageRefs.current[annot.page];
    if (pageWrapper) {
      pageWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setCurrentPage(annot.page);
    }
  };

  // Save PDF via pdf-lib and Python Bridge
  const handleSavePdf = async () => {
    if (isSaving || !rawPdfBytesRef.current) return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      const pdfDoc = await PDFDocument.load(rawPdfBytesRef.current);
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      // Render annotations onto pages
      for (const annot of annotations) {
        const pageIdx = annot.page - 1;
        if (pageIdx < 0 || pageIdx >= pages.length) continue;
        const page = pages[pageIdx];
        const pageHeight = page.getHeight();

        // Calculate scale ratio between our editor canvas (pts) and actual PDF points
        // In PDF.js default scale 1.0, 1 viewport unit = 1 PDF point.
        const rgbColor = hexToRgb(annot.color);

        if (annot.type === 'highlight') {
          page.drawRectangle({
            x: annot.x,
            y: pageHeight - annot.y - annot.height,
            width: annot.width,
            height: annot.height,
            color: rgb(rgbColor[0], rgbColor[1], rgbColor[2]),
            opacity: 0.35,
          });
        } else if (annot.type === 'text') {
          page.drawText(annot.text, {
            x: annot.x,
            y: pageHeight - annot.y - (annot.fontSize || 14),
            size: annot.fontSize || 14,
            font: regularFont,
            color: rgb(rgbColor[0], rgbColor[1], rgbColor[2]),
          });
        } else if (annot.type === 'draw' && annot.points?.length > 1) {
          for (let i = 0; i < annot.points.length - 1; i++) {
            const p1 = annot.points[i];
            const p2 = annot.points[i + 1];
            page.drawLine({
              start: { x: p1.x, y: pageHeight - p1.y },
              end: { x: p2.x, y: pageHeight - p2.y },
              thickness: annot.strokeWidth || 3,
              color: rgb(rgbColor[0], rgbColor[1], rgbColor[2]),
              opacity: 1,
            });
          }
        } else if (annot.type === 'note') {
          // Draw a clear pin marker
          page.drawCircle({
            x: annot.x,
            y: pageHeight - annot.y,
            size: 10,
            color: rgb(rgbColor[0], rgbColor[1], rgbColor[2]),
          });
          page.drawText('C', {
            x: annot.x - 4,
            y: pageHeight - annot.y - 4,
            size: 11,
            font,
            color: rgb(0, 0, 0),
          });
        }
      }

      const editedBytes = await pdfDoc.save();
      // Base64 encode
      let binary = '';
      const len = editedBytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(editedBytes[i]);
      }
      const b64 = btoa(binary);

      if (window.pywebview?.api?.save_pdf_base64) {
        const res = await window.pywebview.api.save_pdf_base64(file.path, b64);
        if (!res.success) throw new Error(res.error || 'Gagal menyimpan file.');
        setSaveSuccessInfo(res);
        if (onSaveSuccess) onSaveSuccess(res);
      } else {
        // Fallback browser download if outside pywebview
        const blob = new Blob([editedBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name.replace('.pdf', '_edited.pdf');
        a.click();
        URL.revokeObjectURL(url);
        setSaveSuccessInfo({ outputPath: a.download, name: a.download });
      }
    } catch (err) {
      console.error('Save PDF error:', err);
      setErrorMessage('Gagal menyimpan PDF: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevealInFolder = (path) => {
    if (window.pywebview?.api?.reveal_in_folder) {
      window.pywebview.api.reveal_in_folder(path);
    }
  };

  const notesList = annotations.filter(a => a.type === 'note' || a.type === 'highlight');

  return (
    <div className="pdf-editor-root" ref={containerRef}>
      {/* Top Main Navigation / Bar */}
      <header className="pdf-editor-toolbar">
        <div className="pdf-toolbar-left">
          <button
            type="button"
            className="btn cc-btn-secondary pdf-back-btn"
            onClick={onClose}
            title="Kembali ke antrean file"
          >
            <ArrowLeft size={16} />
            <span>Kembali</span>
          </button>
          <div className="pdf-file-badge" title={file.path}>
            <span className="pdf-badge-title">{file.name}</span>
            <span className="pdf-badge-offline">
              <ShieldCheck size={12} /> 100% Offline
            </span>
          </div>
        </div>

        {/* Center Floating Tool Palette */}
        <div className="pdf-tools-dock" role="toolbar" aria-label="Alat Edit PDF">
          <button
            type="button"
            className={`pdf-tool-btn ${activeTool === 'select' ? 'active' : ''}`}
            onClick={() => setActiveTool('select')}
            title="Pilih & Scroll (V)"
          >
            <MousePointer size={18} />
            <span className="tool-tip">Pilih</span>
          </button>

          <button
            type="button"
            className={`pdf-tool-btn ${activeTool === 'highlight' ? 'active' : ''}`}
            onClick={() => setActiveTool('highlight')}
            title="Stabilo / Highlight (H)"
          >
            <Highlighter size={18} />
            <span className="tool-tip">Stabilo</span>
          </button>

          <button
            type="button"
            className={`pdf-tool-btn ${activeTool === 'note' ? 'active' : ''}`}
            onClick={() => setActiveTool('note')}
            title="Sticky Note / Catatan (C)"
          >
            <MessageSquare size={18} />
            <span className="tool-tip">Catatan</span>
          </button>

          <button
            type="button"
            className={`pdf-tool-btn ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTool('text')}
            title="Tambah Teks Bebas (T)"
          >
            <Type size={18} />
            <span className="tool-tip">Teks</span>
          </button>

          <button
            type="button"
            className={`pdf-tool-btn ${activeTool === 'draw' ? 'active' : ''}`}
            onClick={() => setActiveTool('draw')}
            title="Pena & Tanda Tangan (D)"
          >
            <PenTool size={18} />
            <span className="tool-tip">Pena</span>
          </button>

          <div className="pdf-tool-divider" />

          {/* Color Picker Swatches */}
          <div className="pdf-color-swatches" title="Pilih warna">
            {PALETTE.slice(0, 4).map(p => (
              <button
                key={p.hex}
                type="button"
                className={`color-swatch-btn ${activeColor === p.hex ? 'selected' : ''}`}
                style={{ backgroundColor: p.hex }}
                onClick={() => setActiveColor(p.hex)}
                aria-label={`Warna ${p.name}`}
              />
            ))}
          </div>

          {/* Sub-options for Text (font size) */}
          {activeTool === 'text' && (
            <>
              <div className="pdf-tool-divider" />
              <div className="pdf-size-selectors" title="Ukuran Font">
                {[12, 16, 20, 24].map(sz => (
                  <button
                    key={sz}
                    type="button"
                    className={`pdf-size-btn ${fontSize === sz ? 'selected' : ''}`}
                    onClick={() => setFontSize(sz)}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Sub-options for Draw (pen width) */}
          {activeTool === 'draw' && (
            <>
              <div className="pdf-tool-divider" />
              <div className="pdf-size-selectors" title="Ketebalan Pena">
                {[2, 4, 6].map(w => (
                  <button
                    key={w}
                    type="button"
                    className={`pdf-size-btn ${penWidth === w ? 'selected' : ''}`}
                    onClick={() => setPenWidth(w)}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="pdf-tool-divider" />

          <button
            type="button"
            className="pdf-tool-btn"
            onClick={handleUndo}
            disabled={annotations.length === 0}
            title="Batalkan Anotasi (Ctrl+Z)"
          >
            <Undo2 size={18} />
            <span className="tool-tip">Undo</span>
          </button>
        </div>

        {/* Right Actions & Save */}
        <div className="pdf-toolbar-right">
          {/* Page Navigator */}
          <div className="pdf-page-nav-pill">
            <button
              type="button"
              className="zoom-btn"
              disabled={currentPage <= 1}
              onClick={() => {
                const target = Math.max(1, currentPage - 1);
                setCurrentPage(target);
                pageRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              title="Halaman Sebelumnya"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="page-nav-text">Hal {currentPage} / {numPages || 1}</span>
            <button
              type="button"
              className="zoom-btn"
              disabled={currentPage >= numPages}
              onClick={() => {
                const target = Math.min(numPages, currentPage + 1);
                setCurrentPage(target);
                pageRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              title="Halaman Berikutnya"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="pdf-zoom-control">
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoom(z => Math.max(0.6, Math.round((z - 0.15) * 100) / 100))}
              title="Perkecil"
            >
              <ZoomOut size={15} />
            </button>
            <span className="zoom-text">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoom(z => Math.min(2.5, Math.round((z + 0.15) * 100) / 100))}
              title="Perbesar"
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              className="zoom-btn fit-btn"
              onClick={() => setZoom(1.0)}
              title="Reset ke 100%"
            >
              <Maximize2 size={14} />
            </button>
          </div>

          {/* Comments sidebar toggle */}
          <button
            type="button"
            className={`btn cc-btn-secondary sidebar-toggle-btn ${showSidebar ? 'active' : ''}`}
            onClick={() => setShowSidebar(s => !s)}
            title="Daftar Komentar"
          >
            <MessageSquare size={16} />
            <span>Komentar</span>
            {notesList.length > 0 && <span className="comment-count-badge">{notesList.length}</span>}
          </button>

          {/* Primary Save Button */}
          <button
            type="button"
            className="btn cc-btn-primary save-pdf-btn"
            onClick={handleSavePdf}
            disabled={isSaving}
          >
            {isSaving ? (
              <><Loader2 size={16} className="spin" /> Menyimpan...</>
            ) : (
              <><Save size={16} /> Simpan PDF</>
            )}
          </button>
        </div>
      </header>

      {/* Editor Body Area */}
      <div className="pdf-editor-workspace">
        {/* Document Viewport */}
        <div className="pdf-viewport" ref={pagesContainerRef}>
          {isLoading && (
            <div className="pdf-loading-state">
              <Loader2 size={36} className="spin" />
              <p>Memuat halaman PDF di memori lokal...</p>
            </div>
          )}

          {errorMessage && (
            <div className="pdf-error-banner" role="alert">
              <p>{errorMessage}</p>
              <button type="button" onClick={() => setErrorMessage('')}><X size={16} /></button>
            </div>
          )}

          {!isLoading && numPages > 0 && (
            <div className="pdf-pages-scroll-column">
              {Array.from({ length: numPages }, (_, idx) => idx + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  ref={el => pageRefs.current[pageNum] = el}
                  className="pdf-page-card"
                  data-page-number={pageNum}
                >
                  <div className="pdf-page-header-tag" aria-hidden="true">
                    Halaman {pageNum} dari {numPages}
                  </div>

                  <div
                    className={`pdf-canvas-container tool-mode-${activeTool}`}
                    onClick={(e) => handleOverlayClick(pageNum, e)}
                    onMouseDown={(e) => handleOverlayMouseDown(pageNum, e)}
                    onMouseMove={(e) => handleOverlayMouseMove(pageNum, e)}
                    onMouseUp={(e) => handleOverlayMouseUp(pageNum, e)}
                  >
                    {/* Rendered HTML5 Canvas */}
                    <canvas ref={el => canvasRefs.current[pageNum] = el} />

                    {/* Text Layer for Selection */}
                    <div
                      ref={el => textLayerRefs.current[pageNum] = el}
                      className="textLayer"
                      onMouseUp={(e) => handleTextLayerMouseUp(pageNum, e)}
                    />

                    {/* SVG Annotation Overlay */}
                    <svg
                      className="pdf-annotation-svg"
                      style={{
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top left',
                        width: `${100 / zoom}%`,
                        height: `${100 / zoom}%`,
                      }}
                    >
                      {/* Live dragging shapes */}
                      <rect id={`live-highlight-${pageNum}`} fill={activeColor} opacity={0.35} />
                      <path id={`live-draw-${pageNum}`} stroke={activeColor} strokeWidth={penWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />

                      {/* Saved Annotations for this page */}
                      {annotations.filter(a => a.page === pageNum).map((annot, aIdx) => {
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
                                setSelectedAnnotationId(annot.id);
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
                                setSelectedAnnotationId(annot.id);
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
                                setSelectedAnnotationId(annot.id);
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
                                setSelectedAnnotationId(annot.id);
                                setActiveNotePopup({
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

                    {/* Inline Text Input on Canvas */}
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
                            if (e.key === 'Enter') handleCommitText();
                            else if (e.key === 'Escape') setActiveTextInput(null);
                          }}
                          onBlur={handleCommitText}
                        />
                      </div>
                    )}

                    {/* Sticky Note Popover Card on Canvas */}
                    {activeNotePopup && activeNotePopup.page === pageNum && (
                      <div
                        className="canvas-note-popover"
                        style={{
                          left: `${activeNotePopup.x * zoom + 16}px`,
                          top: `${activeNotePopup.y * zoom - 10}px`,
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="note-popover-header">
                          <span className="note-popover-author">💬 Catatan Saya</span>
                          <button
                            type="button"
                            className="note-close-btn"
                            onClick={() => setActiveNotePopup(null)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <textarea
                          autoFocus
                          className="note-popover-textarea"
                          placeholder="Tulis komentar atau catatan Anda..."
                          value={activeNotePopup.text}
                          onChange={e => setActiveNotePopup(prev => ({ ...prev, text: e.target.value }))}
                          rows={3}
                        />
                        <div className="note-popover-footer">
                          <button
                            type="button"
                            className="btn cc-btn-secondary note-del-btn"
                            onClick={() => {
                              removeAnnotation(activeNotePopup.noteId);
                              setActiveNotePopup(null);
                            }}
                          >
                            <Trash2 size={13} /> Hapus
                          </button>
                          <button
                            type="button"
                            className="btn cc-btn-primary note-save-btn"
                            onClick={() => handleSaveNoteComment(activeNotePopup.noteId, activeNotePopup.text)}
                          >
                            <Check size={13} /> Simpan
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Floating Contextual Pill on Text Selection (Adobe Style) */}
          {selectionPill && (
            <div
              className="pdf-floating-selection-pill"
              style={{
                left: `${selectionPill.x}px`,
                top: `${selectionPill.y}px`,
              }}
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                className="floating-action-btn"
                onClick={applyHighlightFromSelection}
              >
                <Highlighter size={14} />
                <span>Beri Stabilo</span>
              </button>
              <div className="floating-divider" />
              <button
                type="button"
                className="floating-action-btn"
                onClick={applyNoteFromSelection}
              >
                <MessageSquare size={14} />
                <span>Tambah Catatan</span>
              </button>
              <button
                type="button"
                className="floating-close-btn"
                onClick={() => setSelectionPill(null)}
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Collapsible Comments & Annotations Sidebar */}
        {showSidebar && (
          <aside className="pdf-sidebar-drawer" aria-label="Daftar Catatan dan Komentar">
            <div className="sidebar-drawer-header">
              <div className="sidebar-header-title">
                <MessageSquare size={16} />
                <h3>Komentar &amp; Anotasi</h3>
                <span className="sidebar-count">{notesList.length}</span>
              </div>
              <button
                type="button"
                className="sidebar-close-btn"
                onClick={() => setShowSidebar(false)}
                title="Tutup Panel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="sidebar-drawer-content">
              {notesList.length === 0 ? (
                <div className="sidebar-empty-state">
                  <MessageSquare size={32} className="empty-icon" />
                  <p className="empty-title">Belum ada catatan</p>
                  <p className="empty-desc">
                    Gunakan tool <strong>Stabilo</strong> atau <strong>Catatan</strong> di atas untuk menandai bagian penting dokumen.
                  </p>
                </div>
              ) : (
                <div className="sidebar-notes-list">
                  {notesList.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`sidebar-note-card ${selectedAnnotationId === item.id ? 'active' : ''}`}
                      onClick={() => scrollToAnnotation(item)}
                    >
                      <div className="note-card-meta">
                        <span
                          className="note-type-pill"
                          style={{
                            backgroundColor: `${item.color}25`,
                            color: item.color,
                            borderColor: `${item.color}50`,
                          }}
                        >
                          {item.type === 'note' ? `💬 Catatan #${idx + 1}` : '🖍️ Stabilo'}
                        </span>
                        <span className="note-page-tag">Hal. {item.page}</span>
                        <button
                          type="button"
                          className="note-card-del-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAnnotation(item.id);
                          }}
                          title="Hapus anotasi ini"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {item.quote && (
                        <blockquote className="note-card-quote">
                          &ldquo;{item.quote}&rdquo;
                        </blockquote>
                      )}

                      <div className="note-card-text">
                        {item.text ? item.text : <em className="note-placeholder">Klik untuk mengisi catatan...</em>}
                      </div>

                      <div className="note-card-footer">
                        <span>{item.author || 'Saya'}</span>
                        <span>{item.createdAt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Save Success Dialog */}
      {saveSuccessInfo && (
        <div className="modal-backdrop" onClick={() => setSaveSuccessInfo(null)}>
          <div className="glass-panel modal-card cc-editor-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <FileCheck2 size={24} className="success-icon" />
              <h3>PDF Berhasil Disimpan Secara Lokal!</h3>
            </div>
            <p className="modal-desc">
              Semua catatan, stabilo, teks, dan coretan telah disematkan secara permanen ke file PDF baru tanpa mengunggah apapun ke internet.
            </p>
            <div className="modal-path-box">
              <span className="path-label">Lokasi File:</span>
              <code className="path-text">{saveSuccessInfo.outputPath}</code>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn cc-btn-secondary"
                onClick={() => handleRevealInFolder(saveSuccessInfo.outputPath)}
              >
                <Folder size={16} /> Buka di Folder
              </button>
              <button
                type="button"
                className="btn cc-btn-primary"
                onClick={() => setSaveSuccessInfo(null)}
              >
                Lanjut Mengedit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
