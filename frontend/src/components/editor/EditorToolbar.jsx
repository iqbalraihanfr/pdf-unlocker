import React from 'react';
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
  ArrowLeft,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { TOOLS, PALETTE, FONT_SIZES, PEN_WIDTHS } from '../../utils/editorConstants';

export default function EditorToolbar({
  fileName,
  filePath,
  activeTool,
  setActiveTool,
  activeColor,
  setActiveColor,
  fontSize,
  setFontSize,
  penWidth,
  setPenWidth,
  canUndo,
  onUndo,
  currentPage,
  numPages,
  onPageChange,
  zoom,
  onZoomChange,
  showSidebar,
  onToggleSidebar,
  commentCount,
  isSaving,
  onSave,
  onClose,
}) {
  return (
    <header className="pdf-editor-toolbar">
      {/* Left: Back & File info */}
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
        <div className="pdf-file-badge" title={filePath}>
          <span className="pdf-badge-title">{fileName}</span>
          <span className="pdf-badge-offline">
            <ShieldCheck size={12} /> 100% Offline
          </span>
        </div>
      </div>

      {/* Center: Tools Dock */}
      <div className="pdf-tools-dock" role="toolbar" aria-label="Alat Edit PDF">
        <button
          type="button"
          className={`pdf-tool-btn ${activeTool === TOOLS.SELECT ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.SELECT)}
          title="Pilih & Scroll (V)"
        >
          <MousePointer size={18} />
          <span className="tool-tip">Pilih</span>
        </button>

        <button
          type="button"
          className={`pdf-tool-btn ${activeTool === TOOLS.HIGHLIGHT ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.HIGHLIGHT)}
          title="Stabilo / Highlight (H)"
        >
          <Highlighter size={18} />
          <span className="tool-tip">Stabilo</span>
        </button>

        <button
          type="button"
          className={`pdf-tool-btn ${activeTool === TOOLS.NOTE ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.NOTE)}
          title="Sticky Note / Catatan (C)"
        >
          <MessageSquare size={18} />
          <span className="tool-tip">Catatan</span>
        </button>

        <button
          type="button"
          className={`pdf-tool-btn ${activeTool === TOOLS.TEXT ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.TEXT)}
          title="Tambah Teks Bebas (T)"
        >
          <Type size={18} />
          <span className="tool-tip">Teks</span>
        </button>

        <button
          type="button"
          className={`pdf-tool-btn ${activeTool === TOOLS.DRAW ? 'active' : ''}`}
          onClick={() => setActiveTool(TOOLS.DRAW)}
          title="Pena & Tanda Tangan (D)"
        >
          <PenTool size={18} />
          <span className="tool-tip">Pena</span>
        </button>

        <div className="pdf-tool-divider" />

        {/* Color Palette */}
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

        {/* Sub-options: Font Size */}
        {activeTool === TOOLS.TEXT && (
          <>
            <div className="pdf-tool-divider" />
            <div className="pdf-size-selectors" title="Ukuran Font">
              {FONT_SIZES.map(sz => (
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

        {/* Sub-options: Pen Width */}
        {activeTool === TOOLS.DRAW && (
          <>
            <div className="pdf-tool-divider" />
            <div className="pdf-size-selectors" title="Ketebalan Pena">
              {PEN_WIDTHS.map(pw => (
                <button
                  key={pw.width}
                  type="button"
                  className={`pdf-size-btn ${penWidth === pw.width ? 'selected' : ''}`}
                  onClick={() => setPenWidth(pw.width)}
                >
                  {pw.width}px
                </button>
              ))}
            </div>
          </>
        )}

        <div className="pdf-tool-divider" />

        <button
          type="button"
          className="pdf-tool-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Batalkan Anotasi Terakhir (Ctrl+Z)"
        >
          <Undo2 size={18} />
          <span className="tool-tip">Undo</span>
        </button>
      </div>

      {/* Right: Page Nav, Zoom & Save */}
      <div className="pdf-toolbar-right">
        {/* Page Navigator */}
        <div className="pdf-page-nav-pill">
          <button
            type="button"
            className="zoom-btn"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            title="Halaman Sebelumnya"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="page-nav-text">Hal {currentPage} / {numPages || 1}</span>
          <button
            type="button"
            className="zoom-btn"
            disabled={currentPage >= numPages}
            onClick={() => onPageChange(currentPage + 1)}
            title="Halaman Berikutnya"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="pdf-zoom-control">
          <button
            type="button"
            className="zoom-btn"
            onClick={() => onZoomChange(Math.max(0.6, Math.round((zoom - 0.15) * 100) / 100))}
            title="Perkecil"
          >
            <ZoomOut size={15} />
          </button>
          <span className="zoom-text">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="zoom-btn"
            onClick={() => onZoomChange(Math.min(2.5, Math.round((zoom + 0.15) * 100) / 100))}
            title="Perbesar"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            className="zoom-btn fit-btn"
            onClick={() => onZoomChange(1.0)}
            title="Reset ke 100%"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        {/* Sidebar Toggle */}
        <button
          type="button"
          className={`btn cc-btn-secondary sidebar-toggle-btn ${showSidebar ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title="Daftar Komentar"
        >
          <MessageSquare size={16} />
          <span>Komentar</span>
          {commentCount > 0 && <span className="comment-count-badge">{commentCount}</span>}
        </button>

        {/* Save Button */}
        <button
          type="button"
          className="btn cc-btn-primary save-pdf-btn"
          onClick={onSave}
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
  );
}
