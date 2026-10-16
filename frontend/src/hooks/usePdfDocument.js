import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { base64ToUint8Array } from '../utils/base64Utils';

/**
 * Custom hook to manage PDF document loading and lifecycle.
 * Ensures cancellation of in-flight tasks when switching files or unmounting.
 */
export function usePdfDocument(file) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const rawBytesRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;
    let currentLoadingTask = null;

    async function loadPdf() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        let base64Data = file?.data;
        if (!base64Data && file?.path && window.pywebview?.api?.read_pdf_base64) {
          const res = await window.pywebview.api.read_pdf_base64(file.path);
          if (!res.success) throw new Error(res.error || 'Gagal membaca PDF.');
          base64Data = res.data;
        }

        if (!base64Data) {
          throw new Error('Data file PDF tidak ditemukan.');
        }

        const bytes = base64ToUint8Array(base64Data);
        rawBytesRef.current = bytes;

        currentLoadingTask = pdfjsLib.getDocument({
          data: bytes,
          disableWorker: true,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true,
        });

        const doc = await currentLoadingTask.promise;
        if (isCancelled) {
          doc.destroy();
          return;
        }

        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        if (!isCancelled) {
          console.error('Error loading PDF document:', err);
          setErrorMessage('Gagal membuka dokumen PDF: ' + (err.message || 'Format tidak didukung'));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
      if (currentLoadingTask) {
        currentLoadingTask.destroy();
      }
    };
  }, [file]);

  return {
    pdfDoc,
    numPages,
    isLoading,
    errorMessage,
    setErrorMessage,
    rawBytesRef,
  };
}
