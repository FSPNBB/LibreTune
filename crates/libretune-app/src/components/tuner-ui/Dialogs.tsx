import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Check, FileText, Flame, Wrench } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Dialog, Button } from '../common';
import './Dialogs.css';

// =============================================================================
// Dialog Types
// =============================================================================

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TuneInfo {
  path: string | null;
  signature: string;
  modified: boolean;
  has_tune: boolean;
}

interface BuildInfo {
  version: string;
  build_id: string;
}

// =============================================================================
// Save Dialog
// =============================================================================

interface SaveDialogProps extends DialogProps {
  onSaved?: (path: string) => void;
  autoBurnOnClose?: boolean;
}

export function SaveDialog({ isOpen, onClose, onSaved, autoBurnOnClose }: SaveDialogProps) {
  const [tuneInfo, setTuneInfo] = useState<TuneInfo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showBurnConfirm, setShowBurnConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      invoke<TuneInfo>('get_tune_info')
        .then(setTuneInfo)
        .catch((e) => setError(String(e)));
    }
  }, [isOpen]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const path = await invoke<string>('save_tune', { path: null });
      onSaved?.(path);

      // Auto-burn on close with confirmation
      if (autoBurnOnClose) {
        setShowBurnConfirm(true);
      } else {
        onClose();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSaving(false);
    }
  }, [onClose, onSaved, autoBurnOnClose]);

  // Handle burn after save with confirmation
  const handleBurnConfirm = useCallback(async () => {
    setShowBurnConfirm(false);
    try {
      await invoke('burn_to_ecu');
      onClose();
    } catch (e) {
      setError(String(e));
    }
  }, [onClose]);

  const handleBurnCancel = useCallback(() => {
    setShowBurnConfirm(false);
    onClose();
  }, [onClose]);

  const handleSaveAs = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const selected = await save({
        title: 'Save Tune As',
        filters: [
          { name: 'MSQ Tune File', extensions: ['msq'] },
          { name: 'JSON Tune File', extensions: ['json'] },
        ],
        defaultPath: tuneInfo?.path || undefined,
      });
      
      if (selected) {
        const path = await invoke<string>('save_tune_as', { path: selected });
        onSaved?.(path);
        onClose();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSaving(false);
    }
  }, [onClose, onSaved, tuneInfo]);

  if (!isOpen && !showBurnConfirm) return null;

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={onClose}
        title="Save Tune"
        size="md"
        closeOnBackdrop={!isSaving}
      >
        <Dialog.Body>
          {error && <div className="dialog-error">{error}</div>}

          <div className="dialog-info">
            <p><strong>ECU:</strong> {tuneInfo?.signature || 'Unknown'}</p>
            {tuneInfo?.path && (
              <p><strong>Current File:</strong> {tuneInfo.path.split('/').pop()}</p>
            )}
            {tuneInfo?.modified && (
              <p className="dialog-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} /> Tune has unsaved changes
              </p>
            )}
          </div>

          <div className="dialog-help">
            <p>Save your tune to a file for backup or transfer.</p>
            <p><strong>MSQ format</strong> is compatible with other ECU tuning software.</p>
          </div>
        </Dialog.Body>

        <Dialog.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button variant="secondary" onClick={handleSaveAs} disabled={isSaving}>Save As...</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving || !tuneInfo?.path}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </Dialog.Footer>
      </Dialog>

      {showBurnConfirm && (
        <Dialog
          open
          onClose={handleBurnCancel}
          title="Burn Tune to ECU?"
          size="sm"
        >
          <Dialog.Body>
            <p>Tune saved successfully. Would you like to burn it to the ECU now?</p>
            <p className="dialog-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> This will write to ECU memory and may take several seconds.
            </p>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="secondary" onClick={handleBurnCancel}>Cancel</Button>
            <Button variant="primary" onClick={handleBurnConfirm}>Burn to ECU</Button>
          </Dialog.Footer>
        </Dialog>
      )}
    </>
  );
}

// =============================================================================
// Load Dialog
// =============================================================================

interface LoadDialogProps extends DialogProps {
  onLoaded?: (tuneInfo: TuneInfo) => void;
}

export function LoadDialog({ isOpen, onClose, onLoaded }: LoadDialogProps) {
  const [tuneFiles, setTuneFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      invoke<string[]>('list_tune_files')
        .then(setTuneFiles)
        .catch((e) => setError(String(e)));
    }
  }, [isOpen]);

  const handleLoad = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await invoke<TuneInfo>('load_tune', { path });
      onLoaded?.(info);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [onClose, onLoaded]);

  const handleBrowse = useCallback(async () => {
    try {
      const selected = await open({
        title: 'Open Tune File',
        multiple: false,
        filters: [
          { name: 'Tune Files', extensions: ['msq', 'json'] },
          { name: 'MSQ Tune File', extensions: ['msq'] },
          { name: 'JSON Tune File', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      
      if (selected && typeof selected === 'string') {
        await handleLoad(selected);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [handleLoad]);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Load Tune"
      size="lg"
      closeOnBackdrop={!isLoading}
    >
      <Dialog.Body>
        {error && <div className="dialog-error">{error}</div>}

        <div className="dialog-file-list">
          <div className="dialog-file-header">
            <span>Recent Tune Files</span>
            <Button variant="secondary" onClick={handleBrowse}>Browse...</Button>
          </div>

          {tuneFiles.length === 0 ? (
            <div className="dialog-empty">No tune files found in projects folder</div>
          ) : (
            <div className="dialog-files">
              {tuneFiles.map((file) => (
                <div
                  key={file}
                  className={`dialog-file-item ${selectedFile === file ? 'selected' : ''}`}
                  onClick={() => setSelectedFile(file)}
                  onDoubleClick={() => handleLoad(file)}
                >
                  <span className="dialog-file-icon"><FileText size={14} /></span>
                  <div className="dialog-file-info">
                    <span className="dialog-file-name">{file.split('/').pop()}</span>
                    <span className="dialog-file-path">{file}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog.Body>

      <Dialog.Footer>
        <Button variant="secondary" onClick={onClose} disabled={isLoading}>Cancel</Button>
        <Button
          variant="primary"
          onClick={() => selectedFile && handleLoad(selectedFile)}
          disabled={isLoading || !selectedFile}
        >
          {isLoading ? 'Loading...' : 'Load'}
        </Button>
      </Dialog.Footer>
    </Dialog>
  );
}

// =============================================================================
// Burn Dialog
// =============================================================================

interface BurnDialogProps extends DialogProps {
  connected: boolean;
  onBurned?: () => void;
}

export function BurnDialog({ isOpen, onClose, connected, onBurned }: BurnDialogProps) {
  const [isBurning, setIsBurning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleBurn = useCallback(async () => {
    setIsBurning(true);
    setError(null);
    setSuccess(false);
    
    try {
      await invoke('burn_to_ecu');
      setSuccess(true);
      onBurned?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsBurning(false);
    }
  }, [onClose, onBurned]);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Burn to ECU"
      size="md"
      closeOnBackdrop={!isBurning}
    >
      <Dialog.Body>
        {error && <div className="dialog-error">{error}</div>}
        {success && <div className="dialog-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check size={14} /> Burn completed successfully!</div>}

        {!connected ? (
          <div className="dialog-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> Not connected to ECU. Please connect first.
          </div>
        ) : (
          <div className="dialog-info">
            <p>This will write all changes from ECU RAM to flash memory.</p>
            <p><strong>Warning:</strong> This operation cannot be undone.</p>
            <p>Make sure your tune is tested before burning.</p>
          </div>
        )}
      </Dialog.Body>

      <Dialog.Footer>
        <Button variant="secondary" onClick={onClose} disabled={isBurning}>Cancel</Button>
        <Button
          variant="danger"
          onClick={handleBurn}
          disabled={isBurning || !connected}
        >
          {isBurning ? 'Burning...' : <><Flame size={14} /> Burn to ECU</>}
        </Button>
      </Dialog.Footer>
    </Dialog>
  );
}

// =============================================================================
// New Tune Dialog
// =============================================================================

interface NewTuneDialogProps extends DialogProps {
  onCreated?: () => void;
}

export function NewTuneDialog({ isOpen, onClose, onCreated }: NewTuneDialogProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    try {
      await invoke('new_tune');
      onCreated?.();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsCreating(false);
    }
  }, [onClose, onCreated]);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="New Tune"
      size="sm"
      closeOnBackdrop={!isCreating}
    >
      <Dialog.Body>
        {error && <div className="dialog-error">{error}</div>}

        <div className="dialog-info">
          <p>Create a new tune file for the currently loaded ECU definition.</p>
          <p>Any unsaved changes to the current tune will be lost.</p>
        </div>
      </Dialog.Body>

      <Dialog.Footer>
        <Button variant="secondary" onClick={onClose} disabled={isCreating}>Cancel</Button>
        <Button variant="primary" onClick={handleCreate} disabled={isCreating}>
          {isCreating ? 'Creating...' : 'Create New Tune'}
        </Button>
      </Dialog.Footer>
    </Dialog>
  );
}

// =============================================================================
// Settings Dialog
// =============================================================================

// SettingsDialog has been extracted to ./dialogs/SettingsDialog.tsx
export { SettingsDialog } from './dialogs/SettingsDialog';

// =============================================================================
// About Dialog
// =============================================================================

export function AboutDialog({ isOpen, onClose }: DialogProps) {
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    invoke<BuildInfo>('get_build_info')
      .then(setBuildInfo)
      .catch(() => setBuildInfo(null));
  }, [isOpen]);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="About LibreTune"
      size="sm"
    >
      <Dialog.Body className="dialog-about">
        <div className="dialog-about-logo"><Wrench size={48} /></div>
        <h3>LibreTune</h3>
        <p className="dialog-version">
          Version {buildInfo?.version ?? 'unknown'}
        </p>
        <p className="dialog-build">
          Build {buildInfo?.build_id ?? 'unknown'}
        </p>

        <p>Open-source ECU tuning software compatible with standard INI definition files.</p>

        <div className="dialog-about-links">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); openUrl('https://github.com/RallyPat/LibreTune'); }}
          >
            GitHub
          </a>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); openUrl('https://github.com/RallyPat/LibreTune/tree/main/docs'); }}
          >
            Documentation
          </a>
        </div>

        <p className="dialog-license">
          Licensed under GPL-2.0
        </p>
      </Dialog.Body>

      <Dialog.Footer>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </Dialog.Footer>
    </Dialog>
  );
}


// ConnectionDialog has been extracted to ./dialogs/ConnectionDialog.tsx
export { ConnectionDialog } from './dialogs/ConnectionDialog';
