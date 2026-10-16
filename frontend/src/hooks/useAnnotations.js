import { useState, useCallback, useMemo } from 'react';

/**
 * Custom hook to manage annotation state, selection, undo, and CRUD operations.
 */
export function useAnnotations(initialAnnotations = []) {
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);

  const addAnnotation = useCallback((newAnnot) => {
    const id = newAnnot.id || `annot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const annotWithId = { ...newAnnot, id };
    setAnnotations(prev => [...prev, annotWithId]);
    return annotWithId;
  }, []);

  const removeAnnotation = useCallback((id) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    setSelectedAnnotationId(curr => (curr === id ? null : curr));
  }, []);

  const updateAnnotation = useCallback((id, updates) => {
    setAnnotations(prev => prev.map(a => (a.id === id ? { ...a, ...updates } : a)));
  }, []);

  const handleUndo = useCallback(() => {
    setAnnotations(prev => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
  }, []);

  const notesList = useMemo(() => {
    return annotations.filter(a => a.type === 'note' || a.type === 'highlight');
  }, [annotations]);

  return {
    annotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    addAnnotation,
    removeAnnotation,
    updateAnnotation,
    handleUndo,
    notesList,
  };
}
