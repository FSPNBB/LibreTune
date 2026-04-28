/**
 * Dashboard Designer Mode
 * 
 * Provides interactive editing capabilities for dashboard layouts:
 * - Drag gauges to reposition
 * - Resize handles on corners and edges
 * - Property editor panel for gauge configuration
 * - Snap-to-grid alignment
 * - Multi-select with shift-click
 * - Copy/paste gauges
 * - Undo/redo support
 */

import { useCallback, useRef } from 'react';
import { DashFile, DashComponent, isGauge, isIndicator } from './dashTypes';
import PropertyEditor from './designer/PropertyEditor';
import DesignerToolbar from './designer/DesignerToolbar';
import { useDesignerHistory } from './designer/useDesignerHistory';
import { useDesignerDragResize, ResizeHandle } from './designer/useDesignerDragResize';
import { useDesignerKeyboard } from './designer/useDesignerKeyboard';
import { useDesignerDrop } from './designer/useDesignerDrop';
import './DashboardDesigner.css';

interface ChannelInfo {
  name: string;
  label?: string | null;
  units: string;
  scale: number;
  translate: number;
}

interface DashboardDesignerProps {
  dashFile: DashFile;
  onDashFileChange: (file: DashFile) => void;
  selectedGaugeId: string | null;
  onSelectGauge: (id: string | null) => void;
  onContextMenu: (e: React.MouseEvent, gaugeId: string | null) => void;
  gridSnap: number; // Grid snap size in percentage (e.g., 5 = 5%)
  onGridSnapChange: (snap: number) => void;
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
  onSave: () => void;
  onExit: () => void;
  channelInfoMap?: Record<string, ChannelInfo>; // INI channel metadata for gauge creation
}




export default function DashboardDesigner({
  dashFile,
  onDashFileChange,
  selectedGaugeId,
  onSelectGauge,
  onContextMenu,
  gridSnap,
  onGridSnapChange,
  showGrid,
  onShowGridChange,
  onSave,
  onExit,
  channelInfoMap = {},
}: DashboardDesignerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Undo/redo + clipboard + delete + selected component (extracted hook).
  const {
    selectedComponent,
    pushHistory,
    undo: handleUndo,
    redo: handleRedo,
    remove: handleDelete,
    copy: handleCopy,
    paste: handlePaste,
    canUndo,
    canRedo,
    hasClipboard,
  } = useDesignerHistory({ dashFile, selectedGaugeId, onDashFileChange, onSelectGauge });

  // Snap value to grid
  const snapToGrid = useCallback((value: number): number => {
    if (gridSnap <= 0) return value;
    return Math.round(value / (gridSnap / 100)) * (gridSnap / 100);
  }, [gridSnap]);

  // Drag/resize interactions extracted into a hook.
  const {
    dragState,
    resizeState,
    onGaugeMouseDown: handleGaugeMouseDown,
    onResizeMouseDown: handleResizeMouseDown,
  } = useDesignerDragResize({
    dashFile,
    containerRef,
    snapToGrid,
    pushHistory,
    onDashFileChange,
    onSelectGauge,
  });

  // Keyboard shortcuts
  const handleDeselect = useCallback(() => onSelectGauge(null), [onSelectGauge]);
  useDesignerKeyboard({
    onDelete: handleDelete,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onCopy: handleCopy,
    onPaste: handlePaste,
    onSave,
    onDeselect: handleDeselect,
  });

  // Drag-and-drop channel-to-canvas
  const { onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop } = useDesignerDrop({
    dashFile,
    gridSnap,
    snapToGrid,
    channelInfoMap,
    pushHistory,
    onDashFileChange,
  });

  // Render resize handles for selected gauge
  const renderResizeHandles = (gaugeId: string, component: DashComponent) => {
    if (selectedGaugeId !== gaugeId) return null;
    
    const handles: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    
    return handles.map(handle => (
      <div
        key={handle}
        className={`resize-handle resize-handle-${handle}`}
        onMouseDown={(e) => handleResizeMouseDown(e, handle, gaugeId, component)}
      />
    ));
  };

  return (
    <div className="dashboard-designer">
      <DesignerToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        hasClipboard={hasClipboard}
        hasSelection={!!selectedGaugeId}
        showGrid={showGrid}
        gridSnap={gridSnap}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDelete}
        onShowGridChange={onShowGridChange}
        onGridSnapChange={onGridSnapChange}
        onSave={onSave}
        onExit={onExit}
      />

      {/* Main designer area */}
      <div className="designer-content">
        {/* Canvas with gauges */}
        <div 
          ref={containerRef}
          className={`designer-canvas ${showGrid ? 'show-grid' : ''}`}
          style={{
            '--grid-size': `${gridSnap}%`,
          } as React.CSSProperties}
          onClick={() => onSelectGauge(null)}
          onContextMenu={(e) => onContextMenu(e, null)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {dashFile.gauge_cluster.components.map((component, index) => {
            let id: string, relX: number, relY: number, width: number, height: number;
            
            if (isGauge(component)) {
              const g = component.Gauge;
              id = g.id || `gauge-${index}`;
              relX = g.relative_x ?? 0;
              relY = g.relative_y ?? 0;
              width = g.relative_width ?? 0.25;
              height = g.relative_height ?? 0.25;
            } else if (isIndicator(component)) {
              const i = component.Indicator;
              id = i.id || `indicator-${index}`;
              relX = i.relative_x ?? 0;
              relY = i.relative_y ?? 0;
              width = i.relative_width ?? 0.1;
              height = i.relative_height ?? 0.05;
            } else {
              return null;
            }
            
            const isSelected = selectedGaugeId === id;
            const isDraggingThis = dragState.isDragging && dragState.gaugeId === id;
            const isResizingThis = resizeState.isResizing && resizeState.gaugeId === id;
            
            return (
              <div
                key={id}
                className={`designer-gauge ${isSelected ? 'selected' : ''} ${isDraggingThis ? 'dragging' : ''} ${isResizingThis ? 'resizing' : ''}`}
                style={{
                  left: `${relX * 100}%`,
                  top: `${relY * 100}%`,
                  width: `${width * 100}%`,
                  height: `${height * 100}%`,
                }}
                onMouseDown={(e) => handleGaugeMouseDown(e, id, component)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectGauge(id);
                }}
                onContextMenu={(e) => onContextMenu(e, id)}
              >
                <div className="gauge-preview">
                  {isGauge(component) && (
                    <span className="gauge-label">{component.Gauge.title || component.Gauge.output_channel}</span>
                  )}
                  {isIndicator(component) && (
                    <span className="gauge-label">{component.Indicator.on_text || component.Indicator.output_channel}</span>
                  )}
                </div>
                {renderResizeHandles(id, component)}
              </div>
            );
          })}
        </div>

        {/* Property editor panel */}
        <div className="designer-properties">
          <h3>Properties</h3>
          {selectedComponent ? (
            <PropertyEditor
              component={selectedComponent}
              onChange={(updated) => {
                const newComponents = dashFile.gauge_cluster.components.map(c => {
                  if (isGauge(c) && isGauge(updated) && c.Gauge.id === updated.Gauge.id) {
                    return updated;
                  }
                  if (isIndicator(c) && isIndicator(updated) && c.Indicator.id === updated.Indicator.id) {
                    return updated;
                  }
                  return c;
                });
                
                const newFile = {
                  ...dashFile,
                  gauge_cluster: { ...dashFile.gauge_cluster, components: newComponents },
                };
                pushHistory(newFile, 'Edit property');
                onDashFileChange(newFile);
              }}
            />
          ) : (
            <p className="no-selection">Select a gauge to edit its properties</p>
          )}
        </div>
      </div>
    </div>
  );
}
