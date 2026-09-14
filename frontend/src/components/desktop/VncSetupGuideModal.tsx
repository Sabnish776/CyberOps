import React, { useState } from 'react';
import { X, Terminal, Monitor, Apple, Command } from 'lucide-react';

interface VncSetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VncSetupGuideModal: React.FC<VncSetupGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'ubuntu' | 'windows' | 'macos' | 'termux'>('ubuntu');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 200 }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ width: '800px', maxWidth: '95vw', padding: 0 }}
      >
        <div className="modal-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <h2>
            <Terminal size={20} color="var(--accent-purple)" />
            <span>Remote Desktop Setup Guide</span>
          </h2>
          <button className="btn btn-outline btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
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

        <div style={{ padding: '1.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
          {activeTab === 'ubuntu' && (
            <div className="setup-guide-content">
              <h3>Ubuntu / Debian / Linux Mint</h3>
              <p>These distributions have excellent native support for Desktop Environments. Run this script in your server's terminal to cleanly install and start a secure XFCE4 desktop:</p>
              <pre className="code-block">
{`# 1. Install the XFCE4 desktop and TigerVNC
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
exec startxfce4
EOF

# 5. Make the script executable
chmod +x ~/.vnc/xstartup

# 6. Start the VNC server on display :0 (port 5900) securely
vncserver :0 -SecurityTypes None -geometry 1280x720 -depth 24 -localhost yes`}
              </pre>

              <h4 style={{ marginTop: '1rem', color: 'var(--text-primary)' }}>Restarting / Troubleshooting</h4>
              <p style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>If the server gets stuck or you get a black screen, kill the stuck display and restart it on a new port:</p>
              <pre className="code-block">
{`# 1. Kill any existing VNC servers
vncserver -kill :* 2>/dev/null

# 2. Start a fresh, secure VNC server on display :1 (port 5901)
vncserver :1 -SecurityTypes None -geometry 1280x720 -depth 24 -localhost yes`}
              </pre>
            </div>
          )}

          {activeTab === 'termux' && (
            <div className="setup-guide-content">
              <h3>Termux (Android)</h3>
              <p>Termux is fully capable of running a Linux Desktop Environment (like XFCE4) natively on Android via the x11-repo.</p>
              <pre className="code-block">
{`# 1. Install the X11 repository, XFCE4 desktop, and TigerVNC
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
vncserver -localhost :1`}
              </pre>

              <h4 style={{ marginTop: '1rem', color: 'var(--text-primary)' }}>Restarting / Troubleshooting</h4>
              <p style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>If you already installed VNC but get a black screen or it gets stuck on connecting, you need to overwrite the setup and restart it cleanly:</p>
              <pre className="code-block">
{`# 1. Overwrite the startup script with the hardcoded Display and DBUS
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
vncserver -localhost :1`}
              </pre>
            </div>
          )}

          {activeTab === 'windows' && (
            <div className="setup-guide-content">
              <h3>Windows Desktop</h3>
              <p>Windows has a full GUI by default, but we need to install a VNC Server to securely tunnel it through our SSH connection. Run this script in an <strong>Administrator PowerShell</strong> session on your Windows server to automatically install and configure TightVNC:</p>
              
              <pre className="code-block">
{`# 1. Download the TightVNC Installer
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
              </pre>
            </div>
          )}

          {activeTab === 'macos' && (
            <div className="setup-guide-content">
              <h3>Apple macOS</h3>
              <p>macOS comes with a built-in VNC server! It is perfectly compatible with the SSH Workspace Manager without needing to download anything.</p>
              
              <ol style={{ marginLeft: '1.5rem', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <li>Open <strong>System Settings</strong> (or System Preferences).</li>
                <li>Go to <strong>General &gt; Sharing</strong>.</li>
                <li>Turn on <strong>Screen Sharing</strong>.</li>
                <li>Click the <strong>( i )</strong> info icon next to Screen Sharing.</li>
                <li>Click <strong>Computer Settings...</strong></li>
                <li>Check the box for <strong>"VNC viewers may control screen with password"</strong> and enter a simple password (e.g., <code>1234</code>).</li>
                <li>Click OK and ensure Screen Sharing is active. It automatically listens on port 5900.</li>
              </ol>
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px' }}>
                <strong>Note:</strong> macOS requires VNC authentication by default. You will be prompted to enter this password when connecting.
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
      gap: '8px',
      padding: '1rem',
      background: 'transparent',
      border: 'none',
      borderBottom: active ? '2px solid var(--accent-purple)' : '2px solid transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      transition: 'all 0.2s'
    }}
  >
    {icon}
    <span>{label}</span>
  </button>
);
