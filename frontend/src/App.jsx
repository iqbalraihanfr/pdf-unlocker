import { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Key,
  LockOpen,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  UploadCloud,
  Terminal,
  ShieldCheck,
  PenTool,
  ArrowRight
} from 'lucide-react';
import PdfEditor from './components/PdfEditor';

function App() {
  const [currentTab, setCurrentTab] = useState('unlock'); // 'unlock' | 'edit'
  const [files, setFiles] = useState([]);
  const [globalPassword, setGlobalPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isApiReady, setIsApiReady] = useState(false);
  const [appError, setAppError] = useState('');
  const [editingFile, setEditingFile] = useState(null);
  const busy = useRef(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const onReady = () => setIsApiReady(true);
    window.addEventListener('pywebviewready', onReady);
    if (window.pywebview?.api) onReady();
    return () => window.removeEventListener('pywebviewready', onReady);
  }, []);

  const handleSelectFiles = async () => {
    if (busy.current || !window.pywebview?.api) return;
    busy.current = true;
    setIsSelecting(true);
    setAppError('');
    try {
      const selectedFiles = await window.pywebview.api.select_files();
      if (!Array.isArray(selectedFiles)) throw new Error('Invalid file list');
      setFiles(prev => {
        const paths = new Set(prev.map(file => file.path));
        const additions = selectedFiles.filter(file => {
          if (paths.has(file.path)) return false;
          paths.add(file.path);
          return true;
        });
        return [...prev, ...additions];
      });
    } catch {
      setAppError('Tidak dapat memilih file. Silakan coba lagi.');
    } finally {
      busy.current = false;
      setIsSelecting(false);
    }
  };

  const handleSelectSingleForEditing = async () => {
    if (busy.current) return;
    setAppError('');
    try {
      if (window.pywebview?.api?.select_single_pdf) {
        busy.current = true;
        const selected = await window.pywebview.api.select_single_pdf();
        if (selected && selected.path) {
          setEditingFile({ path: selected.path, name: selected.name });
          setCurrentTab('edit');
        }
      } else {
        fileInputRef.current?.click();
      }
    } catch {
      setAppError('Tidak dapat membuka dialog pemilihan file.');
    } finally {
      busy.current = false;
    }
  };

  const handleBrowserFileInput = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result.split(',')[1];
      setEditingFile({
        path: file.name,
        name: file.name,
        data: b64,
      });
      setCurrentTab('edit');
    };
    reader.readAsDataURL(file);
  };

  const handleOpenInEditor = (fileObj) => {
    setEditingFile({
      path: fileObj.outputPath || fileObj.path,
      name: fileObj.name || fileObj.path.split('/').pop(),
    });
    setCurrentTab('edit');
  };

  const removeFile = (path) => {
    if (busy.current) return;
    setFiles(prev => prev.filter(file => file.path !== path));
  };

  const updateFilePassword = (path, newPassword) => {
    setFiles(prev => prev.map(file =>
      file.path === path ? { ...file, customPassword: newPassword, status: 'pending', errorMsg: '' } : file
    ));
  };

  const handleUnlock = async () => {
    if (busy.current || !window.pywebview?.api) return;
    const queue = files.filter(file => file.status !== 'success');
    if (queue.length === 0) return;
    busy.current = true;
    setIsProcessing(true);
    setAppError('');
    const queuedPaths = new Set(queue.map(file => file.path));
    setFiles(prev => prev.map(file => queuedPaths.has(file.path)
      ? { ...file, status: 'pending', errorMsg: '', outputPath: '' }
      : file));

    try {
      for (const file of queue) {
        setFiles(prev => prev.map(current => current.path === file.path
          ? { ...current, status: 'processing' } : current));
        const results = await window.pywebview.api.unlock_files([
          { path: file.path, customPassword: file.customPassword || '' }
        ], globalPassword);
        const result = results?.[0];
        if (result?.path !== file.path || typeof result.success !== 'boolean'
          || (result.success && (typeof result.outputPath !== 'string' || !result.outputPath))) {
          throw new Error('Invalid unlock result');
        }
        setFiles(prev => prev.map(current => current.path === file.path ? {
          ...current,
          status: result.success ? 'success' : 'error',
          errorMsg: result.success ? '' : result.error || 'Gagal memproses PDF.',
          outputPath: result.success ? result.outputPath : '',
          customPassword: result.success ? '' : current.customPassword
        } : current));
      }
    } catch {
      const message = 'Koneksi ke pemroses PDF gagal. Coba lagi untuk file yang belum berhasil.';
      setAppError(message);
      setFiles(prev => prev.map(file => queuedPaths.has(file.path) && file.status !== 'success'
        && file.status !== 'error' ? { ...file, status: 'error', errorMsg: message } : file));
    } finally {
      busy.current = false;
      setIsProcessing(false);
    }
  };

  const completedCount = files.filter(file => file.status === 'success').length;
  const failedCount = files.filter(file => file.status === 'error').length;
  const finishedCount = completedCount + failedCount;
  const remainingCount = files.length - completedCount;
  const controlsDisabled = isProcessing || isSelecting || !isApiReady;

  // If in edit mode and a file is active, show the full-screen editor
  if (currentTab === 'edit' && editingFile) {
    return (
      <PdfEditor
        file={editingFile}
        onClose={() => setEditingFile(null)}
        onSaveSuccess={(info) => {
          console.log('Saved file:', info);
        }}
      />
    );
  }

  return (
    <main className="app-container">
      {/* Hidden file input for web fallback */}
      <input
        type="file"
        ref={fileInputRef}
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={handleBrowserFileInput}
      />

      <header className="header">
        <div className="header-title-row">
          <h1>
            PDF Unlocker &amp; Editor<span className="cc-cursor" aria-hidden="true" />
          </h1>
          <span className="cc-status-pill">
            <span className="cc-pulse-dot" aria-hidden="true" />
            100% Offline
          </span>
        </div>
        <p>Buka password &amp; edit dokumen PDF Anda secara lokal tanpa upload ke internet.</p>
        
        {/* Navigation Mode Tabs */}
        <div className="cc-mode-tabs" role="tablist" aria-label="Mode Aplikasi">
          <button
            type="button"
            role="tab"
            aria-selected={currentTab === 'unlock'}
            className={`cc-tab-pill ${currentTab === 'unlock' ? 'active' : ''}`}
            onClick={() => setCurrentTab('unlock')}
          >
            <LockOpen size={15} />
            <span>Buka Password ({files.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={currentTab === 'edit'}
            className={`cc-tab-pill ${currentTab === 'edit' ? 'active' : ''}`}
            onClick={() => setCurrentTab('edit')}
          >
            <PenTool size={15} />
            <span>Edit &amp; Catat PDF</span>
            <span className="cc-tab-badge">Baru</span>
          </button>
        </div>
      </header>

      {currentTab === 'unlock' ? (
        <div className="glass-panel cc-editor-card">
          {/* Codecademy Editor Header Bar */}
          <div className="cc-editor-header" aria-hidden="true">
            <div className="cc-window-dots">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <div className="cc-editor-title">
              <Terminal size={14} className="cc-icon-terminal" />
              <span>workspace / unlock_batch.py</span>
            </div>
            <div className="cc-editor-env">Python + React Native Bridge</div>
          </div>

          {!isApiReady && (
            <p className="app-notice" role="status">Menunggu API desktop. Jalankan aplikasi melalui Python untuk memilih dan memproses PDF.</p>
          )}
          {appError && <p className="app-error" role="alert">{appError}</p>}

          <div className="global-password-section">
            <div className="section-label-row">
              <label htmlFor="global-password">Password global (opsional)</label>
              <span className="cc-code-comment">// Berlaku untuk semua PDF di antrean</span>
            </div>
            <div className="password-control">
              <Key size={18} aria-hidden="true" />
              <input
                id="global-password"
                type="password"
                className="input-field"
                placeholder="Dipakai jika password per file kosong (misal: tgl lahir DDMMYYYY)"
                value={globalPassword}
                onChange={(event) => setGlobalPassword(event.target.value)}
                disabled={isProcessing}
              />
            </div>
          </div>

          {files.length === 0 ? (
            <button type="button" className="drop-zone cc-drop-workspace" onClick={handleSelectFiles} disabled={controlsDisabled}>
              <div className="cc-drop-inner">
                <div className="cc-drop-icon-box">
                  <UploadCloud className="drop-zone-icon" aria-hidden="true" />
                </div>
                <span className="drop-zone-title">{isSelecting ? 'Membuka dialog...' : 'Pilih File PDF'}</span>
                <span className="cc-drop-desc">Klik untuk memilih file PDF dari komputer Anda.</span>
                <div className="cc-drop-footer-hint">
                  <ShieldCheck size={14} />
                  <span>Pemrosesan langsung di memori lokal komputer, file asli aman.</span>
                </div>
              </div>
            </button>
          ) : (
            <>
              <div className="file-list-header">
                <div className="file-header-meta">
                  <h2>Daftar File ({files.length})</h2>
                  <span className="cc-syllabus-tag">BATCH QUEUE</span>
                </div>
                <button type="button" onClick={handleSelectFiles} className="btn add-btn cc-btn-secondary" disabled={controlsDisabled}>
                  {isSelecting ? 'Membuka dialog...' : '+ Tambah File'}
                </button>
              </div>

              <div className="file-list-container cc-syllabus-list">
                {files.map((file, idx) => (
                  <div key={file.path} className={`file-item file-item-${file.status} cc-lesson-row`}>
                    <div className="cc-row-index" aria-hidden="true">
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                    <FileText className="file-icon" size={22} aria-hidden="true" />
                    <div className="file-info">
                      <div className="file-name" title={file.path}>{file.name}</div>
                      <div className="file-status">
                        {file.status === 'pending' && <span className="status-pending"><span className="cc-status-dot pending-dot" /> Menunggu...</span>}
                        {file.status === 'processing' && <span className="status-processing"><Loader2 size={12} className="spin" aria-hidden="true" /> Memproses...</span>}
                        {file.status === 'success' && <span className="status-success"><CheckCircle2 size={13} aria-hidden="true" /> Berhasil</span>}
                        {file.status === 'error' && <span className="status-error"><XCircle size={13} aria-hidden="true" /> {file.errorMsg}</span>}
                      </div>
                      {file.outputPath && (
                        <div className="output-row">
                          <p className="output-path">Hasil: {file.outputPath}</p>
                          <button
                            type="button"
                            className="btn cc-btn-secondary edit-file-btn"
                            onClick={() => handleOpenInEditor(file)}
                            title="Buka dokumen ini di Editor & Anotasi Offline"
                          >
                            <PenTool size={12} />
                            <span>Edit / Beri Catatan</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="cc-password-wrapper">
                      <input
                        type="password"
                        placeholder="Password khusus"
                        aria-label={`Password untuk ${file.name}`}
                        className="input-field custom-password-input"
                        value={file.customPassword || ''}
                        onChange={(event) => updateFilePassword(file.path, event.target.value)}
                        disabled={isProcessing || file.status === 'success'}
                        title="Isi jika password file ini berbeda dari password global"
                      />
                    </div>
                    <button
                      type="button"
                      className="remove-btn cc-remove-btn"
                      onClick={() => removeFile(file.path)}
                      disabled={isProcessing || isSelecting}
                      aria-label={`Hapus ${file.name} dari daftar`}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="action-bar cc-action-footer">
            <div className="action-stats cc-stats-panel" role="status" aria-live="polite" aria-atomic="true">
              {files.length > 0 && <>
                <div className="cc-stats-text">
                  <span className="cc-stat-highlight">{finishedCount} dari {files.length}</span> diproses
                  <span className="cc-stat-badge cc-badge-success">{completedCount} berhasil</span>
                  {failedCount > 0 && <span className="cc-stat-badge cc-badge-failed">{failedCount} gagal</span>}
                </div>
                <progress value={finishedCount} max={files.length} aria-label="Progres pemrosesan PDF" />
              </>}
            </div>
            <button
              type="button"
              className="btn unlock-btn cc-btn-primary"
              onClick={handleUnlock}
              disabled={remainingCount === 0 || controlsDisabled}
            >
              {isProcessing ? (
                <><Loader2 className="spin" size={20} aria-hidden="true" /> Memproses...</>
              ) : (
                <><LockOpen size={20} aria-hidden="true" /> {failedCount > 0 ? 'Coba Lagi / Proses Sisa' : 'Buka Password PDF'}</>
              )}
            </button>
          </div>
          <p className="privacy-note">
            <ShieldCheck size={14} className="privacy-icon" aria-hidden="true" />
            Hasil disimpan di folder PDF asal tanpa password. File asli tidak diubah.
          </p>
        </div>
      ) : (
        /* Edit Tab Launcher */
        <div className="glass-panel cc-editor-card">
          <div className="cc-editor-header" aria-hidden="true">
            <div className="cc-window-dots">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <div className="cc-editor-title">
              <Terminal size={14} className="cc-icon-terminal" />
              <span>workspace / offline_annotator.py</span>
            </div>
            <div className="cc-editor-env">Pure Client Canvas + PDF-Lib</div>
          </div>

          <div className="editor-launcher-box">
            <div className="launcher-features-banner">
              <div className="feature-item">
                <span className="feature-dot yellow-dot" />
                <span>🖍️ Stabilo Text &amp; Area</span>
              </div>
              <div className="feature-item">
                <span className="feature-dot lime-dot" />
                <span>💬 Sticky Notes &amp; Komentar</span>
              </div>
              <div className="feature-item">
                <span className="feature-dot sky-dot" />
                <span>🔤 Teks Bebas &amp; Catatan</span>
              </div>
              <div className="feature-item">
                <span className="feature-dot rose-dot" />
                <span>✍️ Tanda Tangan &amp; Coretan</span>
              </div>
            </div>

            <button
              type="button"
              className="drop-zone cc-drop-workspace editor-select-drop"
              onClick={handleSelectSingleForEditing}
            >
              <div className="cc-drop-inner">
                <div className="cc-drop-icon-box">
                  <PenTool className="drop-zone-icon" aria-hidden="true" />
                </div>
                <span className="drop-zone-title">Pilih PDF untuk Diedit</span>
                <span className="cc-drop-desc">Buka dokumen PDF lokal mana pun untuk diberi catatan atau tanda tangan.</span>
                <div className="cc-drop-footer-hint">
                  <ShieldCheck size={14} />
                  <span>100% Offline. Tidak ada data yang diunggah ke Adobe atau server mana pun.</span>
                </div>
              </div>
            </button>

            {/* Quick access to successfully unlocked files */}
            {completedCount > 0 && (
              <div className="unlocked-quick-list">
                <h4>Atau buka dari hasil unlock sesi ini:</h4>
                <div className="quick-file-chips">
                  {files.filter(f => f.status === 'success' && f.outputPath).map(f => (
                    <button
                      key={f.path}
                      type="button"
                      className="btn cc-btn-secondary quick-file-btn"
                      onClick={() => handleOpenInEditor(f)}
                    >
                      <FileText size={14} />
                      <span className="quick-file-name">{f.name}</span>
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
