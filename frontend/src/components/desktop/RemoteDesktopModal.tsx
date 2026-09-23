import React, { useEffect, useRef, useState } from 'react';
import { X, Monitor, AlertCircle, RefreshCw, Maximize, Keyboard, Command } from 'lucide-react';
import { ServerProfile } from '../../types';
import { VncSetupGuideModal } from './VncSetupGuideModal';
import { RemoteDesktopView, RemoteDesktopViewRef } from './RemoteDesktopView';
import SimpleKeyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';

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
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [keyboardLayout, setKeyboardLayout] = useState('default');
  const [connectState, setConnectState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  const modalRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<RemoteDesktopViewRef>(null);

  const handleKeyPress = (button: string) => {
    if (button === '{shift}' || button === '{lock}') {
      setKeyboardLayout(keyboardLayout === 'default' ? 'shift' : 'default');
      return;
    }

    if (!viewRef.current) return;

    let keysym = 0;
    if (button.length === 1) {
      keysym = button.charCodeAt(0);
    } else {
      switch (button) {
        case '{bksp}': keysym = 0xFF08; break;
        case '{tab}': keysym = 0xFF09; break;
        case '{enter}': keysym = 0xFF0D; break;
        case '{escape}': keysym = 0xFF1B; break;
        case '{space}': keysym = 0x0020; break;
      }
    }

    if (keysym) {
      viewRef.current.sendKey(keysym, true);
      viewRef.current.sendKey(keysym, false);
    }
  };

  // Tell noVNC to resize its canvas whenever the keyboard toggles
  useEffect(() => {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  }, [showKeyboard]);

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
            <button 
              className={`btn btn-icon ${showKeyboard ? 'btn-primary' : 'btn-outline'}`} 
              onClick={() => setShowKeyboard(!showKeyboard)} 
              title="Toggle Virtual Keyboard"
            >
              <Keyboard size={18} />
            </button>
            <button className="btn btn-outline btn-icon" onClick={() => viewRef.current?.sendCtrlAltDel()} title="Send Ctrl+Alt+Del">
              <Command size={18} />
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
            minHeight: 0,
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

        {showKeyboard && (
          <div style={{ 
            background: 'var(--bg-card)', 
            padding: '0.5rem', 
            borderTop: '1px solid var(--border-subtle)',
            flexShrink: 0
          }}>
            <SimpleKeyboard
              layoutName={keyboardLayout}
              onKeyPress={handleKeyPress}
              theme="hg-theme-default hg-layout-default myTheme"
              display={{
                '{bksp}': 'backspace',
                '{enter}': 'enter',
                '{shift}': 'shift',
                '{s}': 'shift',
                '{tab}': 'tab',
                '{lock}': 'caps',
                '{accept}': 'Submit',
                '{space}': ' ',
                '{escape}': 'esc'
              }}
            />
          </div>
        )}
      </div>

      <VncSetupGuideModal 
        isOpen={isSetupGuideOpen} 
        onClose={() => setIsSetupGuideOpen(false)} 
      />
    </div>
  );
};
