import React from 'react';
import { X, Trash2, Check } from 'lucide-react';

export default function NotePopover({
  noteData,
  zoom,
  onSave,
  onDelete,
  onClose,
  onChangeText,
}) {
  if (!noteData) return null;

  return (
    <div
      className="canvas-note-popover"
      style={{
        left: `${noteData.x * zoom + 16}px`,
        top: `${noteData.y * zoom - 10}px`,
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="note-popover-header">
        <span className="note-popover-author">💬 Catatan Saya</span>
        <button
          type="button"
          className="note-close-btn"
          onClick={onClose}
          title="Tutup"
        >
          <X size={14} />
        </button>
      </div>

      <textarea
        autoFocus
        className="note-popover-textarea"
        placeholder="Tulis komentar atau catatan Anda..."
        value={noteData.text || ''}
        onChange={e => onChangeText(e.target.value)}
        rows={3}
      />

      <div className="note-popover-footer">
        <button
          type="button"
          className="btn cc-btn-secondary note-del-btn"
          onClick={onDelete}
        >
          <Trash2 size={13} /> Hapus
        </button>
        <button
          type="button"
          className="btn cc-btn-primary note-save-btn"
          onClick={onSave}
        >
          <Check size={13} /> Simpan
        </button>
      </div>
    </div>
  );
}
