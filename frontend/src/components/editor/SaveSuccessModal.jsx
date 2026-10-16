import React from 'react';
import { FileCheck2, Folder } from 'lucide-react';

export default function SaveSuccessModal({
  saveInfo,
  onRevealInFolder,
  onClose,
}) {
  if (!saveInfo) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-card cc-editor-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <FileCheck2 size={24} className="success-icon" />
          <h3>PDF Berhasil Disimpan Secara Lokal!</h3>
        </div>
        <p className="modal-desc">
          Semua catatan, stabilo, teks, dan coretan telah disematkan secara permanen ke file PDF baru tanpa mengunggah apa pun ke internet.
        </p>
        <div className="modal-path-box">
          <span className="path-label">Lokasi File:</span>
          <code className="path-text">{saveInfo.outputPath}</code>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn cc-btn-secondary"
            onClick={() => onRevealInFolder(saveInfo.outputPath)}
          >
            <Folder size={16} /> Buka di Folder
          </button>
          <button
            type="button"
            className="btn cc-btn-primary"
            onClick={onClose}
          >
            Lanjut Mengedit
          </button>
        </div>
      </div>
    </div>
  );
}
