import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, X } from 'lucide-react';
import { TOOLS } from '../utils/editorConstants';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { useAnnotations } from '../hooks/useAnnotations';
import { exportAnnotatedPdf } from '../services/pdfExportService';

import EditorToolbar from './editor/EditorToolbar';
import PdfPage from './editor/PdfPage';
import SelectionPill from './editor/SelectionPill';
import NotePopover from './editor/NotePopover';
import CommentsSidebar from './editor/CommentsSidebar';
import SaveSuccessModal from './editor/SaveSuccessModal';

export default function PdfEditor({ file, onClose, onSaveSuccess }) {
  // Document Hook
  const {
    pdfDoc,
    numPages,
    isLoading,
    errorMessage,
    setErrorMessage,
    rawBytesRef,
  } = usePdfDocument(file);

  // Annotations Hook
  const {
    annotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    addAnnotation,
    removeAnnotation,
    updateAnnotation,
    handleUndo,
    notesList,
  } = useAnnotations();

  // Viewport & Tool State
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [activeTool, setActiveTool] = useState(TOOLS.SELECT);
  const [activeColor, setActiveColor] = useState('#FFD300');
  const [fontSize, setFontSize] = useState(16);
  const [penWidth, setPenWidth] = useState(3);
  const [showSidebar, setShowSidebar] = useState(true);

  // Transient Interaction Popups
  const [selectionPill, setSelectionPill] = useState(null);
  const [activeNotePopup, setActiveNotePopup] = useState(null);
  const [activeTextInput, setActiveTextInput] = useState(null);

  // Save State
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessInfo, setSaveSuccessInfo] = useState(null);

  // Page DOM references for smooth scrolling
  const pageRefs = useRef({});
  const setPageRef = useCallback((pageNum, el) => {
    if (el) pageRefs.current[pageNum] = el;
    else delete pageRefs.current[pageNum];
  }, []);

  // Keyboard Shortcuts (Undo and Escape)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'Escape') {
        setActiveTool(TOOLS.SELECT);
        setSelectionPill(null);
        setActiveNotePopup(null);
        setActiveTextInput(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo]);

  // Floating Selection Actions
  const handleApplyHighlightFromSelection = useCallback(() => {
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
  }, [selectionPill, activeColor, addAnnotation]);

  const handleApplyNoteFromSelection = useCallback(() => {
    if (!selectionPill) return;
    const noteId = `note-${Date.now()}`;
    addAnnotation({
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
    });
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
  }, [selectionPill, activeColor, addAnnotation]);

  // Free Text Commit
  const handleCommitText = useCallback(() => {
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
  }, [activeTextInput, addAnnotation]);

  // Sticky Note Save / Delete
  const handleSaveNoteComment = useCallback(() => {
    if (!activeNotePopup) return;
    if (!activeNotePopup.text.trim()) {
      removeAnnotation(activeNotePopup.noteId);
    } else {
      updateAnnotation(activeNotePopup.noteId, { text: activeNotePopup.text });
    }
    setActiveNotePopup(null);
  }, [activeNotePopup, removeAnnotation, updateAnnotation]);

  // Sidebar Scroll to Annotation
  const handleScrollToAnnotation = useCallback((annot) => {
    setSelectedAnnotationId(annot.id);
    const pageEl = pageRefs.current[annot.page];
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setCurrentPage(annot.page);
    }
  }, [setSelectedAnnotationId]);

  // Page Navigator Navigation
  const handlePageChange = useCallback((targetPage) => {
    const pageNum = Math.max(1, Math.min(numPages, targetPage));
    setCurrentPage(pageNum);
    const pageEl = pageRefs.current[pageNum];
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [numPages]);

  // PDF Export and Save Pipeline
  const handleSavePdf = async () => {
    if (isSaving || !rawBytesRef.current) return;
    setIsSaving(true);
    setErrorMessage('');

    try {
      const b64 = await exportAnnotatedPdf(rawBytesRef.current, annotations);

      if (window.pywebview?.api?.save_pdf_base64) {
        const res = await window.pywebview.api.save_pdf_base64(file.path, b64);
        if (!res.success) throw new Error(res.error || 'Gagal menyimpan file.');
        setSaveSuccessInfo(res);
        if (onSaveSuccess) onSaveSuccess(res);
      } else {
        // Web preview fallback
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/pdf' });
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

  return (
    <div className="pdf-editor-root">
      {/* Modular Toolbar */}
      <EditorToolbar
        fileName={file.name}
        filePath={file.path}
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        activeColor={activeColor}
        setActiveColor={setActiveColor}
        fontSize={fontSize}
        setFontSize={setFontSize}
        penWidth={penWidth}
        setPenWidth={setPenWidth}
        canUndo={annotations.length > 0}
        onUndo={handleUndo}
        currentPage={currentPage}
        numPages={numPages}
        onPageChange={handlePageChange}
        zoom={zoom}
        onZoomChange={setZoom}
        showSidebar={showSidebar}
        onToggleSidebar={() => setShowSidebar(s => !s)}
        commentCount={notesList.length}
        isSaving={isSaving}
        onSave={handleSavePdf}
        onClose={onClose}
      />

      {/* Editor Body */}
      <div className="pdf-editor-workspace">
        <div className="pdf-viewport">
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
                <PdfPage
                  key={pageNum}
                  pageNum={pageNum}
                  numPages={numPages}
                  pdfDoc={pdfDoc}
                  zoom={zoom}
                  activeTool={activeTool}
                  activeColor={activeColor}
                  penWidth={penWidth}
                  fontSize={fontSize}
                  annotations={annotations}
                  selectedAnnotationId={selectedAnnotationId}
                  onSelectAnnotation={setSelectedAnnotationId}
                  onAddAnnotation={addAnnotation}
                  onTextSelection={setSelectionPill}
                  onOpenNotePopup={setActiveNotePopup}
                  activeTextInput={activeTextInput}
                  setActiveTextInput={setActiveTextInput}
                  onCommitText={handleCommitText}
                  pageRefCallback={setPageRef}
                />
              ))}
            </div>
          )}

          {/* Contextual Selection Pill */}
          <SelectionPill
            position={selectionPill}
            onHighlight={handleApplyHighlightFromSelection}
            onAddNote={handleApplyNoteFromSelection}
            onClose={() => setSelectionPill(null)}
          />

          {/* Sticky Note Popover */}
          <NotePopover
            noteData={activeNotePopup}
            zoom={zoom}
            onSave={handleSaveNoteComment}
            onDelete={() => {
              if (activeNotePopup?.noteId) removeAnnotation(activeNotePopup.noteId);
              setActiveNotePopup(null);
            }}
            onClose={() => setActiveNotePopup(null)}
            onChangeText={(txt) => setActiveNotePopup(prev => ({ ...prev, text: txt }))}
          />
        </div>

        {/* Modular Comments Sidebar */}
        {showSidebar && (
          <CommentsSidebar
            notesList={notesList}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={handleScrollToAnnotation}
            onDeleteAnnotation={removeAnnotation}
            onClose={() => setShowSidebar(false)}
          />
        )}
      </div>

      {/* Save Success Modal */}
      <SaveSuccessModal
        saveInfo={saveSuccessInfo}
        onRevealInFolder={handleRevealInFolder}
        onClose={() => setSaveSuccessInfo(null)}
      />
    </div>
  );
}
