/**
 * useColumnResize - Custom hook for drag-to-resize table columns
 *
 * Manages column widths in component state, handles mouse drag events
 * for resizing, and persists widths to localStorage.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { TABLE_COLUMNS } from '../lib/task-constants';
import type { ColumnId } from '../lib/task-constants';
import { getStoredColumnWidths, setStoredColumnWidths } from '../lib/task-utils';

interface DragState {
  columnId: ColumnId;
  startX: number;
  startWidth: number;
}

export function useColumnResize() {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    getStoredColumnWidths()
  );
  const dragStateRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const getMinWidth = useCallback((columnId: ColumnId): number => {
    const col = TABLE_COLUMNS.find((c) => c.id === columnId);
    return col?.minWidth ?? 50;
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, columnId: ColumnId) => {
      e.preventDefault();
      e.stopPropagation();

      const startWidth = columnWidths[columnId] ?? 100;
      dragStateRef.current = {
        columnId,
        startX: e.clientX,
        startWidth,
      };
      setIsDragging(true);
    },
    [columnWidths]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;

      const diff = e.clientX - drag.startX;
      const minWidth = getMinWidth(drag.columnId);
      const newWidth = Math.max(minWidth, drag.startWidth + diff);

      setColumnWidths((prev) => ({
        ...prev,
        [drag.columnId]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      if (dragStateRef.current) {
        // Persist the final column widths to localStorage
        setColumnWidths((prev) => {
          setStoredColumnWidths(prev);
          return prev;
        });
      }
      dragStateRef.current = null;
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, getMinWidth]);

  const resetColumnWidths = useCallback(() => {
    const defaults = Object.fromEntries(
      TABLE_COLUMNS.map((col) => [col.id, col.defaultWidth])
    );
    setColumnWidths(defaults);
    setStoredColumnWidths(defaults);
  }, []);

  return {
    columnWidths,
    isDragging,
    handleMouseDown,
    resetColumnWidths,
  };
}
