import React from 'react';
import { Highlighter, MessageSquare, X } from 'lucide-react';

export default function SelectionPill({
  position,
  onHighlight,
  onAddNote,
  onClose,
}) {
  if (!position) return null;

  return (
    <div
      className="pdf-floating-selection-pill"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        className="floating-action-btn"
        onClick={onHighlight}
      >
        <Highlighter size={14} />
        <span>Beri Stabilo</span>
      </button>
      <div className="floating-divider" />
      <button
        type="button"
        className="floating-action-btn"
        onClick={onAddNote}
      >
        <MessageSquare size={14} />
        <span>Tambah Catatan</span>
      </button>
      <button
        type="button"
        className="floating-close-btn"
        onClick={onClose}
        title="Tutup"
      >
        <X size={12} />
      </button>
    </div>
  );
}
