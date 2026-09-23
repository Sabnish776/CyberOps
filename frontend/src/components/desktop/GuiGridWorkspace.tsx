import React, { useState, useRef } from 'react';
import { ServerProfile } from '../../types';
import { Monitor, Maximize, Keyboard, Power, Activity, Terminal, BookOpen, Command } from 'lucide-react';
import { RemoteDesktopView, RemoteDesktopViewRef } from './RemoteDesktopView';
import { VncSetupGuideModal } from './VncSetupGuideModal';
import SimpleKeyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';

interface GuiGridWorkspaceProps {
  servers: ServerProfile[];
  isVisible: boolean;
}

export const GuiGridWorkspace: React.FC<GuiGridWorkspaceProps> = ({ servers, isVisible }) => {
  const [isSetupGuideOpen, setIsSetupGuideOpen] = useState(false);

  return (
    <div className="gui-grid-workspace" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <div className="dashboard-header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="dashboard-headline">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Monitor size={24} color="var(--accent-purple)" />
              <span>GUI Control Center</span>
            </h1>
          </div>
          <p>Live Desktop Environment feeds. Click to establish a secure VNC tunnel to your servers.</p>
        </div>
        <button 
          className="btn btn-outline btn-sm" 
          onClick={() => setIsSetupGuideOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <BookOpen size={16} />
          <span>Setup Guide</span>
        </button>
      </div>

      {servers.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            background: 'var(--bg-card)',
            borderRadius: '16px',
            border: '1px dashed var(--border-subtle)'
          }}
        >
          <Monitor size={44} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No Servers Available</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Add servers from the Dashboard to see them here.
          </p>
        </div>
      ) : (
        <div 
          className="gui-grid" 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))', 
            gap: '1.5rem' 
          }}
        >
          {servers.map((server) => (
            <GuiCard key={server.id} server={server} />
          ))}
        </div>
      )}

      <VncSetupGuideModal 
        isOpen={isSetupGuideOpen} 
        onClose={() => setIsSetupGuideOpen(false)} 
      />
    </div>
  );
};

const GuiCard: React.FC<{ server: ServerProfile }> = ({ server }) => {
  const [active, setActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [keyboardLayout, setKeyboardLayout] = useState('default');
  const cardRef = useRef<HTMLDivElement>(null);
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

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (cardRef.current?.requestFullscreen) {
        cardRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  // Sync fullscreen state if user presses ESC
  React.useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Tell noVNC to resize its canvas whenever the keyboard toggles
  React.useEffect(() => {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  }, [showKeyboard]);

  return (
    <div 
      ref={cardRef}
      style={{
        background: 'var(--bg-card)',
        border: active ? '1px solid var(--accent-purple)' : '1px solid var(--border-subtle)',
        borderRadius: isFullscreen ? '0' : '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '350px',
        boxShadow: active ? '0 0 20px rgba(168, 85, 247, 0.15)' : 'none',
        transition: 'all 0.3s ease',
        ...(isFullscreen ? {
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          width: '100vw',
          height: '100vh',
          background: 'var(--bg-secondary)'
        } : {})
      }}
    >
      <div 
        style={{ 
          padding: '0.8rem 1rem', 
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(8px)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div 
            style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: active ? 'var(--accent-emerald)' : 'var(--text-muted)',
              boxShadow: active ? '0 0 10px var(--accent-emerald)' : 'none'
            }} 
          />
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
            {server.name}
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {server.username}@{server.hostname}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {active && (
            <>
              <button 
                className={`btn btn-icon ${showKeyboard ? 'btn-primary' : 'btn-outline'}`} 
                onClick={() => setShowKeyboard(!showKeyboard)} 
                title="Toggle Virtual Keyboard"
                style={{ padding: '6px' }}
              >
                <Keyboard size={14} />
              </button>
              <button 
                className="btn btn-outline btn-icon" 
                onClick={() => viewRef.current?.sendCtrlAltDel()} 
                title="Send Ctrl+Alt+Del"
                style={{ padding: '6px' }}
              >
                <Command size={14} />
              </button>
            </>
          )}
          <button 
            className="btn btn-outline btn-icon" 
            onClick={handleToggleFullscreen} 
            title="Toggle Fullscreen"
            style={{ padding: '6px' }}
          >
            <Maximize size={14} />
          </button>
          <button 
            className={`btn btn-icon ${active ? 'btn-danger' : 'btn-primary'}`} 
            onClick={() => {
              if (active) {
                viewRef.current?.disconnect();
                setActive(false);
              } else {
                setActive(true);
              }
            }} 
            title={active ? "Disconnect" : "Connect"}
            style={{ padding: '6px' }}
          >
            <Power size={14} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#0a0f18' }}>
        {!active ? (
          <div 
            style={{ 
              position: 'absolute', 
              top: 0, left: 0, right: 0, bottom: 0, 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '1rem'
            }}
          >
            <Terminal size={48} color="rgba(255, 255, 255, 0.05)" />
            <button 
              className="btn btn-primary" 
              onClick={() => setActive(true)}
              style={{ padding: '10px 24px', fontSize: '1rem', gap: '8px' }}
            >
              <Activity size={18} />
              <span>Connect GUI Feed</span>
            </button>
          </div>
        ) : (
          <RemoteDesktopView 
            ref={viewRef}
            server={server}
            autoConnect={true}
          />
        )}
      </div>

      {active && showKeyboard && (
        <div style={{ 
          background: 'var(--bg-card)', 
          padding: '0.5rem', 
          borderTop: '1px solid var(--border-subtle)' 
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
  );
};
