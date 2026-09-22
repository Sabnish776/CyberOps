import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { ServerProfile } from '../../types';
import { api } from '../../api/client';
import { CyberPopup } from '../common/CyberPopup';
// @ts-ignore
import RFB from '@novnc/novnc';

export interface RemoteDesktopViewRef {
  sendCtrlAltDel: () => void;
  reconnect: () => void;
  disconnect: () => void;
}

interface RemoteDesktopViewProps {
  server: ServerProfile;
  autoConnect?: boolean;
  onConnectStateChange?: (state: 'disconnected' | 'connecting' | 'connected' | 'error', errorMsg?: string) => void;
}

export const RemoteDesktopView = forwardRef<RemoteDesktopViewRef, RemoteDesktopViewProps>(({ 
  server, 
  autoConnect = true,
  onConnectStateChange 
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [vncPassword, setVncPassword] = useState('');

  const reportState = (state: 'disconnected' | 'connecting' | 'connected' | 'error', errorMsg?: string) => {
    if (state === 'connecting') setConnecting(true);
    else setConnecting(false);
    
    if (state === 'connected') setIsConnected(true);
    else setIsConnected(false);
    
    if (state === 'error' && errorMsg) setError(errorMsg);
    else setError(null);

    if (onConnectStateChange) onConnectStateChange(state, errorMsg);
  };

  useImperativeHandle(ref, () => ({
    sendCtrlAltDel: () => {
      if (rfbRef.current) {
        rfbRef.current.sendCtrlAltDel();
      }
    },
    reconnect: connectVnc,
    disconnect: disconnectVnc
  }));

  useEffect(() => {
    if (autoConnect) {
      connectVnc();
    } else {
      reportState('disconnected');
    }
    return () => disconnectVnc();
  }, [server.id, autoConnect]);

  const disconnectVnc = () => {
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect();
      } catch (e) {}
      rfbRef.current = null;
    }
    if (connecting || isConnected) {
       reportState('disconnected');
    }
  };

  const connectVnc = async () => {
    if (!containerRef.current) return;
    
    reportState('connecting');
    disconnectVnc();

    try {
      const response = await api.servers.connect(server.id);
      const sessionId = response.sessionId;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let host = window.location.host;
      const meta = import.meta as any;
      if (meta.env && meta.env.VITE_API_URL) {
        const apiUrl = new URL(meta.env.VITE_API_URL);
        host = apiUrl.host;
      }
      const wsUrl = `${protocol}//${host}/ws/desktop/${sessionId}`;

      const rfb = new RFB(containerRef.current, wsUrl, {
        wsProtocols: ['binary'],
      });

      rfb.addEventListener('connect', () => {
        reportState('connected');
      });

      rfb.addEventListener('credentialsrequired', () => {
        setShowPasswordPrompt(true);
      });

      rfb.addEventListener('disconnect', (e: any) => {
        if (e.detail.clean === false && !error) {
          reportState('error', 'Connection to remote desktop dropped.');
        } else {
          reportState('disconnected');
        }
      });

      rfb.scaleViewport = true;
      rfb.resizeSession = false; 

      rfbRef.current = rfb;
      
    } catch (err: any) {
      reportState('error', err.message || 'Failed to establish Remote Desktop connection');
    }
  };

  return (
    <div 
      style={{ 
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#000',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {connecting && !showPasswordPrompt && (
        <div style={{ position: 'absolute', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', zIndex: 10 }}>
          <RefreshCw size={32} className="spinning" />
          <span>Connecting...</span>
        </div>
      )}
      
      {error && !connecting && (
        <div style={{ position: 'absolute', color: 'var(--accent-red)', background: 'rgba(15, 23, 42, 0.9)', padding: '1rem', borderRadius: '8px', zIndex: 10, textAlign: 'center' }}>
          <div style={{ marginBottom: '8px' }}>{error}</div>
          <button className="btn btn-sm btn-outline" onClick={connectVnc}>Try Again</button>
        </div>
      )}

      {/* The actual NoVNC rendering surface */}
      <div 
        ref={containerRef} 
        style={{ 
          width: '100%', 
          height: '100%',
          display: (error && !isConnected) ? 'none' : 'block'
        }} 
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
              Please enter the VNC password for {server.name}.
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
          disconnectVnc();
          reportState('error', 'VNC connection cancelled (password required).');
        }}
      />
    </div>
  );
});
