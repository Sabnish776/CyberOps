import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { ServerProfile } from '../../types';
import { api, authStorage } from '../../api/client';
import { CyberPopup } from '../common/CyberPopup';
// @ts-ignore
import RFB from '@novnc/novnc';

export interface RemoteDesktopViewRef {
  sendCtrlAltDel: () => void;
  sendKey: (keysym: number, down: boolean) => void;
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
  const [vncUsername, setVncUsername] = useState(server.username || '');
  const [requiredCredentials, setRequiredCredentials] = useState<string[]>(['password']);
  const [authPreference, setAuthPreference] = useState<'ard' | 'vnc'>('ard');
  const [isMacServer, setIsMacServer] = useState(false);
  const isMacServerRef = useRef(false);
  const hasSecurityFailureRef = useRef(false);
  const currentSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    setVncUsername(server.username || '');
    setIsMacServer(false);
    isMacServerRef.current = false;
    setAuthPreference('ard');
  }, [server.id, server.username]);

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
    sendKey: (keysym: number, down: boolean) => {
      if (rfbRef.current) {
        rfbRef.current.sendKey(keysym, down);
      }
    },
    reconnect: () => connectVnc(),
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
    const sid = currentSessionIdRef.current;
    currentSessionIdRef.current = null;
    if (sid) {
      api.sessions.terminate(sid).catch(() => {});
    }
    if (connecting || isConnected) {
       reportState('disconnected');
    }
  };

  const connectVnc = async (forcedAuthMode?: 'ard' | 'vnc') => {
    if (!containerRef.current) return;
    
    const activeAuthMode = forcedAuthMode || authPreference;
    if (forcedAuthMode) {
      setAuthPreference(forcedAuthMode);
    }

    reportState('connecting');
    disconnectVnc();
    hasSecurityFailureRef.current = false;

    try {
      const response = await api.servers.connect(server.id);
      const sessionId = response.sessionId;
      currentSessionIdRef.current = sessionId;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let host = window.location.host;
      const envApiUrl = import.meta.env.VITE_API_URL;
      if (envApiUrl) {
        try {
          let cleanUrl = String(envApiUrl).trim();
          if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = `https://${cleanUrl}`;
          }
          const apiUrl = new URL(cleanUrl);
          host = apiUrl.host;
        } catch (e) {}
      }
      const token = authStorage.getToken();
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      const wsUrl = `${protocol}//${host}/ws/desktop/${sessionId}${tokenParam}`;

      const rfb = new RFB(containerRef.current, wsUrl, {
        wsProtocols: ['binary'],
      });

      const origIsSupported = rfb._isSupportedSecurityType.bind(rfb);
      rfb._isSupportedSecurityType = (type: number) => {
        if (type === 30) {
          isMacServerRef.current = true;
          setIsMacServer(true);
          if (activeAuthMode === 'vnc') {
            return false; // Bypass Apple Remote Desktop (ARD)
          }
        }
        return origIsSupported(type);
      };

      rfb.addEventListener('connect', () => {
        reportState('connected');
      });

      rfb.addEventListener('credentialsrequired', (e: any) => {
        const types: string[] = e?.detail?.types || ['password'];
        if (types.includes('username')) {
          isMacServerRef.current = true;
          setIsMacServer(true);
        }
        setRequiredCredentials(types);
        setShowPasswordPrompt(true);
      });

      rfb.addEventListener('securityfailure', (e: any) => {
        hasSecurityFailureRef.current = true;
        const reason = e?.detail?.reason
          ? `Authentication failed: ${e.detail.reason}`
          : 'Authentication failed. Please verify your credentials.';
        reportState('error', reason);
      });

      rfb.addEventListener('disconnect', (e: any) => {
        if (e.detail.clean === false && !hasSecurityFailureRef.current) {
          reportState('error', 'Connection to remote desktop dropped.');
        } else if (!hasSecurityFailureRef.current) {
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

  const submitCredentials = () => {
    if (!rfbRef.current) return;
    const creds: any = {};
    if (requiredCredentials.includes('username')) {
      creds.username = vncUsername.trim();
    }
    if (requiredCredentials.includes('password')) {
      creds.password = vncPassword;
    }
    if (requiredCredentials.includes('target')) {
      creds.target = '';
    }
    rfbRef.current.sendCredentials(creds);
    setShowPasswordPrompt(false);
    setVncPassword('');
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
        <div style={{ 
          position: 'absolute', 
          color: 'var(--accent-red)', 
          background: 'rgba(15, 23, 42, 0.96)', 
          padding: '1.25rem 1.5rem', 
          borderRadius: '8px', 
          border: '1px solid rgba(239, 68, 68, 0.3)',
          zIndex: 10, 
          textAlign: 'center',
          maxWidth: '460px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        }}>
          <div style={{ marginBottom: '10px', fontWeight: 600, fontSize: '0.95rem' }}>{error}</div>
          
          <div style={{ marginBottom: '14px', fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'left', lineHeight: '1.45' }}>
            {isMacServer ? (
              authPreference === 'ard' ? (
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Troubleshooting macOS Login:</div>
                  <div>• In Mac <strong>System Settings &gt; General &gt; Sharing &gt; Screen Sharing ( i )</strong>, set <em>"Allow access for"</em> to <strong>All users</strong> (or explicitly add your user).</div>
                  <div>• Enter your exact Mac short username (run <code>whoami</code> in Terminal) and local login password.</div>
                  <div style={{ marginTop: '6px', color: 'var(--accent-cyan)' }}>• Or switch to <strong>VNC Password Mode</strong> below if you set a password under Computer Settings.</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Troubleshooting VNC Password:</div>
                  <div>• In Mac <strong>Screen Sharing &gt; ( i ) &gt; Computer Settings...</strong>, ensure <em>"VNC viewers may control screen with password"</em> is enabled.</div>
                  <div style={{ marginTop: '6px', color: 'var(--accent-cyan)' }}>• Or switch to <strong>macOS Account Mode</strong> below.</div>
                </div>
              )
            ) : (
              <div>
                <div>• Please verify the VNC password is correct.</div>
                <div>• Ensure the VNC server is running on port 5900 (e.g. TigerVNC, TightVNC, or x11vnc).</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn btn-sm btn-outline" onClick={() => connectVnc()}>Try Again</button>
            {isMacServer && (
              <button 
                className="btn btn-sm btn-primary" 
                onClick={() => connectVnc(authPreference === 'ard' ? 'vnc' : 'ard')}
              >
                {authPreference === 'ard' ? 'Try VNC Password Mode' : 'Try macOS Account Mode'}
              </button>
            )}
          </div>
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
        title={requiredCredentials.includes('username') ? "Authentication Required" : "VNC Authentication Required"}
        badgeText="SECURE CONNECTION"
        variant="warning"
        confirmText="Connect"
        message={
          <div style={{ marginTop: '10px' }}>
            {/* Auth Mode Switcher (Shown ONLY when connecting to a Mac) */}
            {isMacServer && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', background: 'var(--bg-tertiary)', padding: '3px', borderRadius: '6px' }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    fontSize: '0.78rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: authPreference === 'ard' ? 'var(--accent-purple)' : 'transparent',
                    color: authPreference === 'ard' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: authPreference === 'ard' ? 600 : 400
                  }}
                  onClick={() => {
                    if (authPreference !== 'ard') {
                      setShowPasswordPrompt(false);
                      connectVnc('ard');
                    }
                  }}
                >
                  macOS Account (ARD)
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    fontSize: '0.78rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: authPreference === 'vnc' ? 'var(--accent-purple)' : 'transparent',
                    color: authPreference === 'vnc' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: authPreference === 'vnc' ? 600 : 400
                  }}
                  onClick={() => {
                    if (authPreference !== 'vnc') {
                      setShowPasswordPrompt(false);
                      connectVnc('vnc');
                    }
                  }}
                >
                  Standard VNC Password
                </button>
              </div>
            )}

            <p style={{ marginBottom: '15px', color: 'var(--text-secondary)' }}>
              {requiredCredentials.includes('username') ? (
                <span>
                  Please enter authentication credentials for <strong style={{ color: 'var(--text-primary)' }}>{server.name}</strong>.
                  <br />
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                    (macOS Screen Sharing uses Apple ARD authentication which requires your Mac user account name and login password)
                  </span>
                </span>
              ) : (
                <span>
                  Please enter the VNC password for <strong style={{ color: 'var(--text-primary)' }}>{server.name}</strong>.
                </span>
              )}
            </p>

            {requiredCredentials.includes('username') && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  macOS Account Username
                </label>
                <input
                  type="text"
                  value={vncUsername}
                  onChange={(e) => setVncUsername(e.target.value)}
                  placeholder="Username (e.g. your Mac short account name)"
                  autoFocus={!vncUsername}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    color: 'white',
                    fontFamily: 'monospace',
                    fontSize: '0.95rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitCredentials();
                    }
                  }}
                />
              </div>
            )}

            {requiredCredentials.includes('password') && (
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {requiredCredentials.includes('username') ? 'macOS Account Password' : 'VNC Password'}
                </label>
                <input
                  type="password"
                  value={vncPassword}
                  onChange={(e) => setVncPassword(e.target.value)}
                  placeholder="Password"
                  autoFocus={!!vncUsername || !requiredCredentials.includes('username')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    color: 'white',
                    fontFamily: 'monospace',
                    fontSize: '0.95rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitCredentials();
                    }
                  }}
                />
              </div>
            )}
          </div>
        }
        onConfirm={submitCredentials}
        onCancel={() => {
          setShowPasswordPrompt(false);
          setVncPassword('');
          disconnectVnc();
          reportState('error', 'VNC connection cancelled (authentication required).');
        }}
      />
    </div>
  );
});
