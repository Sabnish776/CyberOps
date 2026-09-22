import React, { useState } from 'react';
import { X, Terminal, Monitor, Apple, Check, Copy, ShieldCheck, AlertTriangle, Info } from 'lucide-react';

interface VncSetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CodeBlock = ({ code, title = 'Terminal' }: { code: string, title?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      background: '#0a0f18',
      border: '1px solid var(--border-subtle)',
      borderRadius: '8px',
      overflow: 'hidden',
      marginTop: '1rem',
      marginBottom: '1rem',
      boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
          <span style={{ marginLeft: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{title}</span>
        </div>
        <button 
          onClick={handleCopy}
          style={{
            background: copied ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${copied ? 'var(--accent-emerald)' : 'var(--border-subtle)'}`,
            color: copied ? 'var(--accent-emerald)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            padding: '4px 8px',
            borderRadius: '4px',
            transition: 'all 0.2s'
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{
        padding: '1.25rem',
        margin: 0,
        overflowX: 'auto',
        color: '#e2e8f0',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.85rem',
        lineHeight: '1.5'
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const VncSetupGuideModal: React.FC<VncSetupGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'ubuntu' | 'windows' | 'macos' | 'termux'>('ubuntu');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 200 }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ width: '850px', maxWidth: '95vw', padding: 0, background: 'var(--bg-secondary)', overflow: 'hidden' }}
      >
        <div className="modal-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ background: 'rgba(168, 85, 247, 0.15)', color: 'var(--accent-purple)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                GUI CONFIGURATION
              </div>
            </div>
            <h2 style={{ fontSize: '1.25rem' }}>
              <Monitor size={22} color="var(--text-primary)" />
              <span style={{ color: 'var(--text-primary)' }}>Remote Desktop Setup Guide</span>
            </h2>
          </div>
          <button className="btn btn-outline btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
          <TabButton 
            active={activeTab === 'ubuntu'} 
            onClick={() => setActiveTab('ubuntu')}
            icon={<Terminal size={16} />}
            label="Ubuntu / Debian"
          />
          <TabButton 
            active={activeTab === 'windows'} 
            onClick={() => setActiveTab('windows')}
            icon={<Monitor size={16} />}
            label="Windows"
          />
          <TabButton 
            active={activeTab === 'macos'} 
            onClick={() => setActiveTab('macos')}
            icon={<Apple size={16} />}
            label="macOS"
          />
          <TabButton 
            active={activeTab === 'termux'} 
            onClick={() => setActiveTab('termux')}
            icon={<Terminal size={16} />}
            label="Termux (Android)"
          />
        </div>

        <div style={{ padding: '2rem', maxHeight: '60vh', overflowY: 'auto' }}>
          {activeTab === 'ubuntu' && (
            <div className="setup-guide-content fade-in">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
                <ShieldCheck size={28} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: '4px' }} />
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Ubuntu / Debian / Linux Mint</h3>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    These distributions have excellent native support for Desktop Environments. Run this script in your server's terminal to cleanly install and start a secure XFCE4 desktop.
                  </p>
                </div>
              </div>
              
              <CodeBlock 
                title="bash - install_vnc.sh"
                code={`# 1. Install the XFCE4 desktop and TigerVNC
sudo apt update
sudo apt install -y xfce4 xfce4-goodies tigervnc-standalone-server

# 2. Kill any old VNC sessions and clear old configs
vncserver -kill :0 2>/dev/null
rm -rf ~/.vnc

# 3. Create a fresh VNC configuration directory
mkdir -p ~/.vnc

# 4. Write the exact startup script needed to launch XFCE4
cat << 'EOF' > ~/.vnc/xstartup
#!/bin/sh
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
exec dbus-launch xfce4-session
EOF

# 5. Make the script executable
chmod +x ~/.vnc/xstartup

# 6. Start the VNC server on display :0 (port 5900) securely
vncserver :0 -SecurityTypes None -geometry 1280x720 -depth 24 -localhost yes`}
              />

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginTop: '2rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                <AlertTriangle size={20} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Restarting / Troubleshooting</h4>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>If the server gets stuck or you get a black screen, kill the stuck display and restart it on a new port:</p>
                  
                  <CodeBlock 
                    title="bash"
                    code={`# 1. Kill any existing VNC servers
vncserver -kill :* 2>/dev/null

# 2. Start a fresh, secure VNC server on display :1 (port 5901)
vncserver :1 -SecurityTypes None -geometry 1280x720 -depth 24 -localhost yes`}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'termux' && (
            <div className="setup-guide-content fade-in">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
                <Info size={28} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: '4px' }} />
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Termux (Android)</h3>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    Termux is fully capable of running a Linux Desktop Environment (like XFCE4) natively on Android via the x11-repo.
                  </p>
                </div>
              </div>

              <CodeBlock 
                title="bash - termux_x11.sh"
                code={`# 1. Install the X11 repository, XFCE4 desktop, and TigerVNC
pkg install x11-repo
pkg install tigervnc xfce4

# 2. Setup your VNC Password (you will need this to connect!)
vncpasswd

# 3. Create the startup script with the specific Termux shell and DBUS config
mkdir -p ~/.vnc
cat << 'EOF' > ~/.vnc/xstartup
#!/data/data/com.termux/files/usr/bin/sh
export DISPLAY=:1
dbus-launch xfce4-session &
EOF

# 4. Make the script executable
chmod +x ~/.vnc/xstartup

# 5. Start the VNC server on a clean display
vncserver -localhost :1 -geometry 1280x720 -depth 24`}
              />

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginTop: '2rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                <AlertTriangle size={20} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Restarting / Troubleshooting</h4>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>If you already installed VNC but get a black screen or it gets stuck on connecting, you need to overwrite the setup and restart it cleanly:</p>
                  
                  <CodeBlock 
                    title="bash"
                    code={`# 1. Overwrite the startup script with the hardcoded Display and DBUS
cat << 'EOF' > ~/.vnc/xstartup
#!/data/data/com.termux/files/usr/bin/sh
export DISPLAY=:1
dbus-launch xfce4-session &
EOF

# 2. Make it executable
chmod +x ~/.vnc/xstartup

# 3. Kill the old session and wipe locks
pkill -9 Xvnc
rm -rf $PREFIX/tmp/.X*

# 4. Start the server explicitly on Display 1
vncserver -localhost :1 -geometry 1280x720 -depth 24`}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'windows' && (
            <div className="setup-guide-content fade-in">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
                <ShieldCheck size={28} color="var(--accent-purple)" style={{ flexShrink: 0, marginTop: '4px' }} />
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Windows Desktop</h3>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    Windows has a full GUI by default, but we need to install a VNC Server to securely tunnel it through our SSH connection. Run this script in an <strong>Administrator PowerShell</strong> session on your Windows server.
                  </p>
                </div>
              </div>
              
              <CodeBlock 
                title="powershell - admin"
                code={`# 1. Download the TightVNC Installer
Invoke-WebRequest -Uri "https://www.tightvnc.com/download/2.8.81/tightvnc-2.8.81-gpl-setup-64bit.msi" -OutFile "tightvnc.msi"

# 2. Silently install it AND WAIT for it to finish
Start-Process -FilePath "msiexec.exe" -ArgumentList "/i tightvnc.msi /quiet /norestart ADDLOCAL=Server SERVER_REGISTER_AS_SERVICE=1 SERVER_ADD_FIREWALL_EXCEPTION=1" -Wait -NoNewWindow

# 3. Create the registry keys if they don't exist, then set the values
if (-not (Test-Path "HKLM:\\Software\\TightVNC\\Server")) {
    New-Item -Path "HKLM:\\Software\\TightVNC\\Server" -Force
}

# Allow Loopback connections (Crucial for Devkit SSH Tunnel)
New-ItemProperty -Path "HKLM:\\Software\\TightVNC\\Server" -Name "AllowLoopback" -Value 1 -PropertyType DWord -Force

# Disable VNC Password (Secure since the SSH connection itself acts as the authentication layer)
New-ItemProperty -Path "HKLM:\\Software\\TightVNC\\Server" -Name "UseVncAuthentication" -Value 0 -PropertyType DWord -Force

# 4. Restart the service to apply changes
Restart-Service "tvnserver"

# 5. Cleanup the installer
Remove-Item "tightvnc.msi"`}
              />
            </div>
          )}

          {activeTab === 'macos' && (
            <div className="setup-guide-content fade-in">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
                <Apple size={28} color="var(--text-primary)" style={{ flexShrink: 0, marginTop: '4px' }} />
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Apple macOS</h3>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    macOS comes with a built-in VNC server! It is perfectly compatible with the CyberOps Command Center without needing to download anything.
                  </p>
                </div>
              </div>
              
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.03)', 
                border: '1px solid var(--border-subtle)', 
                borderRadius: '8px', 
                padding: '1.5rem',
                marginBottom: '1rem'
              }}>
                <ol style={{ 
                  margin: 0, 
                  paddingLeft: '1.2rem', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '1rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.95rem'
                }}>
                  <li>Open <strong style={{ color: 'var(--accent-cyan)' }}>System Settings</strong> (or System Preferences).</li>
                  <li>Go to <strong style={{ color: 'var(--accent-cyan)' }}>General &gt; Sharing</strong>.</li>
                  <li>Turn on <strong style={{ color: 'var(--accent-cyan)' }}>Screen Sharing</strong>.</li>
                  <li>Click the <strong>( i )</strong> info icon next to Screen Sharing.</li>
                  <li>Click <strong style={{ color: 'var(--accent-cyan)' }}>Computer Settings...</strong></li>
                  <li>Check the box for <strong>"VNC viewers may control screen with password"</strong> and enter a simple password (e.g., <code style={{ background: 'var(--bg-card)', padding: '2px 6px', borderRadius: '4px' }}>1234</code>).</li>
                  <li>Click OK and ensure Screen Sharing is active. It automatically listens on port 5900.</li>
                </ol>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px' }}>
                <Info size={20} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Note:</strong> macOS requires VNC authentication by default. You will be prompted to enter this password when connecting through CyberOps.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
  <button 
    onClick={onClick}
    style={{ 
      flex: 1, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      gap: '10px',
      padding: '1.25rem 1rem',
      background: active ? 'rgba(255,255,255,0.03)' : 'transparent',
      border: 'none',
      borderBottom: active ? '2px solid var(--accent-purple)' : '2px solid transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      transition: 'all 0.2s',
      fontSize: '0.95rem'
    }}
  >
    {icon}
    <span>{label}</span>
  </button>
);
