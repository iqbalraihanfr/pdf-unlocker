import React from 'react';
import { MessageSquare, X, Trash2 } from 'lucide-react';

export default function CommentsSidebar({
  notesList,
  selectedAnnotationId,
  onSelectAnnotation,
  onDeleteAnnotation,
  onClose,
}) {
  return (
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
          onClick={onClose}
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
                onClick={() => onSelectAnnotation(item)}
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
                      onDeleteAnnotation(item.id);
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
  );
}
