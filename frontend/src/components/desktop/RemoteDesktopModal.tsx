import React, { useEffect, useRef, useState } from 'react';
import { X, Monitor, AlertCircle, RefreshCw, Maximize, Keyboard } from 'lucide-react';
import { ServerProfile } from '../../types';
import { VncSetupGuideModal } from './VncSetupGuideModal';
import { RemoteDesktopView, RemoteDesktopViewRef } from './RemoteDesktopView';

interface RemoteDesktopModalProps {
  server: ServerProfile | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RemoteDesktopModal: React.FC<RemoteDesktopModalProps> = ({
  server,
  isOpen,
  onClose
}) => {
  const [isSetupGuideOpen, setIsSetupGuideOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectState, setConnectState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  const modalRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<RemoteDesktopViewRef>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (modalRef.current?.requestFullscreen) {
        modalRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  if (!isOpen || !server) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
      <div 
        ref={modalRef}
        className="modal-content large" 
        onClick={(e) => e.stopPropagation()}
        style={{ 
          width: isFullscreen ? '100vw' : '95vw', 
          height: isFullscreen ? '100vh' : '95vh', 
          maxWidth: isFullscreen ? '100vw' : '1920px',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: isFullscreen ? 0 : undefined,
          backgroundColor: 'var(--bg-secondary)'
        }}
      >
        <div 
          className="modal-header" 
          style={{ 
            padding: '1rem 1.5rem', 
            borderBottom: '1px solid var(--border-subtle)',
            display: isFullscreen ? 'none' : 'flex'
          }}
        >
          <h2>
            <Monitor size={20} color="var(--accent-purple)" />
            <span>Remote Desktop: {server.name}</span>
          </h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-outline btn-icon" onClick={() => viewRef.current?.sendCtrlAltDel()} title="Send Ctrl+Alt+Del">
              <Keyboard size={18} />
            </button>
            <button className="btn btn-outline btn-icon" onClick={toggleFullscreen} title="Fullscreen">
              <Maximize size={18} />
            </button>
            <button className="btn btn-outline btn-icon" onClick={() => viewRef.current?.reconnect()} title="Reconnect">
              <RefreshCw size={18} className={connectState === 'connecting' ? 'spinning' : ''} />
            </button>
            <button className="btn btn-outline btn-icon" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Notice Area */}
        <div style={{ 
          padding: '10px 1.5rem', 
          background: 'rgba(239, 68, 68, 0.1)', 
          borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
          display: isFullscreen ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <AlertCircle size={18} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Notice:</strong> The GUI mode requires your Linux server to have a Desktop Environment (e.g., XFCE4) and a VNC server (e.g., x11vnc) running on port 5900. If the connection fails, please ensure they are installed and running.
            </div>
          </div>
          <button 
            className="btn btn-sm btn-outline" 
            onClick={() => setIsSetupGuideOpen(true)}
            style={{ flexShrink: 0 }}
          >
            Setup Guide
          </button>
        </div>

        {/* Desktop Canvas Container */}
        <div 
          style={{ 
            flex: 1, 
            position: 'relative',
            background: '#000',
            overflow: 'hidden'
          }}
        >
          <RemoteDesktopView 
            ref={viewRef}
            server={server} 
            autoConnect={true} 
            onConnectStateChange={(state) => setConnectState(state)}
          />
        </div>
      </div>

      <VncSetupGuideModal 
        isOpen={isSetupGuideOpen} 
        onClose={() => setIsSetupGuideOpen(false)} 
      />
    </div>
  );
};
