import React, { useEffect, useRef, useState } from 'react';
import { X, Monitor, AlertCircle, RefreshCw } from 'lucide-react';
import { ServerProfile } from '../../types';
import { api } from '../../api/client';
import { authStorage } from '../../api/client';
import { VncSetupGuideModal } from './VncSetupGuideModal';
import { CyberPopup } from '../common/CyberPopup';
// @ts-ignore
import RFB from '@novnc/novnc';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSetupGuideOpen, setIsSetupGuideOpen] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [vncPassword, setVncPassword] = useState('');

  useEffect(() => {
    if (isOpen && server) {
      connectVnc();
    } else {
      disconnectVnc();
    }
    
    return () => {
      disconnectVnc();
    };
  }, [isOpen, server]);

  const disconnectVnc = () => {
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect();
      } catch (e) {}
      rfbRef.current = null;
    }
  };

  const connectVnc = async () => {
    if (!server || !containerRef.current) return;
    
    setConnecting(true);
    setError(null);
    disconnectVnc();

    try {
      // 1. Get an SSH session token via our existing connect endpoint
      const response = await api.servers.connect(server.id);
      const sessionId = response.sessionId;

      // 2. Build WebSocket URL for the desktop proxy
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let host = window.location.host;
      const meta = import.meta as any;
      if (meta.env && meta.env.VITE_API_URL) {
        const apiUrl = new URL(meta.env.VITE_API_URL);
        host = apiUrl.host;
      }
      const wsUrl = `${protocol}//${host}/ws/desktop/${sessionId}`;

      // 3. Connect NoVNC
      const rfb = new RFB(containerRef.current, wsUrl, {
        wsProtocols: ['binary'], // ensure binary mode
      });

      rfb.addEventListener('connect', () => {
        setConnecting(false);
      });

      rfb.addEventListener('credentialsrequired', () => {
        setShowPasswordPrompt(true);
      });

      rfb.addEventListener('disconnect', (e: any) => {
        setConnecting(false);
        if (e.detail.clean === false && !error) {
          setError('Connection to remote desktop dropped.');
        }
      });

      rfb.scaleViewport = true;
      rfb.resizeSession = true;

      rfbRef.current = rfb;
      
    } catch (err: any) {
      setConnecting(false);
      setError(err.message || 'Failed to establish Remote Desktop connection');
    }
  };

  if (!isOpen || !server) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
      <div 
        className="modal-content large" 
        onClick={(e) => e.stopPropagation()}
        style={{ 
          width: '95vw', 
          height: '95vh', 
          maxWidth: '1920px',
          display: 'flex',
          flexDirection: 'column',
          padding: 0
        }}
      >
        <div className="modal-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <h2>
            <Monitor size={20} color="var(--accent-purple)" />
            <span>Remote Desktop: {server.name}</span>
          </h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-outline btn-icon" onClick={connectVnc} title="Reconnect">
              <RefreshCw size={18} className={connecting ? 'spinning' : ''} />
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
          display: 'flex',
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
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {connecting && (
            <div style={{ position: 'absolute', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <RefreshCw size={32} className="spinning" />
              <span>Connecting to {server.name}...</span>
            </div>
          )}
          
          {error && !connecting && (
            <div style={{ position: 'absolute', color: 'var(--accent-red)', background: 'rgba(15, 23, 42, 0.9)', padding: '1rem', borderRadius: '8px', zIndex: 10 }}>
              {error}
            </div>
          )}

          <div 
            ref={containerRef} 
            style={{ 
              width: '100%', 
              height: '100%',
              display: error ? 'none' : 'block'
            }} 
          />
        </div>
      </div>

      <VncSetupGuideModal 
        isOpen={isSetupGuideOpen} 
        onClose={() => setIsSetupGuideOpen(false)} 
      />

      <CyberPopup
        isOpen={showPasswordPrompt}
        title="VNC Authentication Required"
        badgeText="SECURE CONNECTION"
        variant="warning"
        confirmText="Connect"
        message={
          <div style={{ marginTop: '10px' }}>
            <p style={{ marginBottom: '15px', color: 'var(--text-secondary)' }}>
              Please enter the VNC password for this server.
            </p>
            <input
              type="password"
              value={vncPassword}
              onChange={(e) => setVncPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: 'white',
                fontFamily: 'monospace',
                fontSize: '1rem',
                outline: 'none'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (rfbRef.current && vncPassword) {
                    rfbRef.current.sendCredentials({ password: vncPassword });
                    setShowPasswordPrompt(false);
                    setVncPassword('');
                  }
                }
              }}
            />
          </div>
        }
        onConfirm={() => {
          if (rfbRef.current && vncPassword) {
            rfbRef.current.sendCredentials({ password: vncPassword });
            setShowPasswordPrompt(false);
            setVncPassword('');
          }
        }}
        onCancel={() => {
          setShowPasswordPrompt(false);
          setVncPassword('');
          if (rfbRef.current) {
            rfbRef.current.disconnect();
          }
          setConnecting(false);
          setError('VNC connection cancelled (password required).');
        }}
      />
    </div>
  );
};
