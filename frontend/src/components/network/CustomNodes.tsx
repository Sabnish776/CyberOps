import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Monitor, Server as ServerIcon } from 'lucide-react';

/**
 * LocalNode – the glowing central "LOCAL MACHINE" hub.
 * Has multiple target handles spread along the top edge so that
 * tunnel lines from different servers (or multiple tunnels from one server)
 * land at visually distinct positions instead of stacking on top of each other.
 */
export const LocalNode = ({ data }: { data: any }) => {
  const handleCount = data.handleCount || 5; // default 5 spread handles

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(8,15,30,0.98) 100%)',
      border: '2px solid var(--accent-cyan)',
      borderRadius: '12px',
      padding: '16px 28px',
      minWidth: '220px',
      boxShadow: '0 0 20px rgba(0,240,255,0.25), inset 0 0 30px rgba(0,240,255,0.05)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      position: 'relative'
    }}>
      {/* Single centralized handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-0"
        style={{
          background: 'var(--accent-cyan)',
          width: '10px',
          height: '10px',
          top: '-5px',
          opacity: 0.8
        }}
      />
      <Monitor size={28} color="var(--accent-cyan)" />
      <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', letterSpacing: '1.5px', fontSize: '0.9rem' }}>LOCAL MACHINE</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', opacity: 0.8 }}>127.0.0.1</div>
    </div>
  );
};

/**
 * ServerNode – remote server nodes arranged around the local hub.
 * Has multiple source handles spread along the bottom so each tunnel
 * uses a different exit point on the box.
 */
export const ServerNode = ({ data }: { data: any }) => {
  const { server } = data;
  const handleCount = data.handleCount || 3;

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(8,15,30,0.98) 100%)',
      border: '1px solid var(--accent-emerald)',
      borderRadius: '10px',
      padding: '14px 16px',
      minWidth: '180px',
      boxShadow: '0 0 12px rgba(16,185,129,0.15), 0 4px 12px rgba(0,0,0,0.4)',
      position: 'relative'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px', marginBottom: '8px' }}>
        <ServerIcon size={16} color="var(--accent-emerald)" />
        <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{server.name}</span>
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {server.host}
      </div>

      {/* Single centralized handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-0"
        style={{
          background: 'var(--accent-emerald)',
          width: '10px',
          height: '10px',
          bottom: '-5px',
          opacity: 0.8
        }}
      />
    </div>
  );
};

/**
 * WaypointNode – a small, draggable dot placed at the midpoint of each tunnel.
 * Dragging this repositions the tunnel path visually.
 * Shows the port mapping label and the tunnel's color.
 */
export const WaypointNode = ({ data }: { data: any }) => {
  const { tunnel, edgeColor = '#00f0ff' } = data;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      cursor: 'grab'
    }}>
      {/* Incoming handle (from server) */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: edgeColor, width: '6px', height: '6px', opacity: 0.5 }}
      />

      {/* Port label badge */}
      <div style={{
        background: 'rgba(8, 15, 30, 0.92)',
        border: `1px solid ${edgeColor}`,
        borderRadius: '6px',
        color: '#fff',
        fontSize: '10px',
        padding: '4px 10px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        boxShadow: `0 0 8px ${edgeColor}40`,
        fontWeight: 'bold',
        letterSpacing: '0.5px',
        whiteSpace: 'nowrap'
      }}>
        :{tunnel?.remotePort} ➜ :{tunnel?.localPort}
      </div>

      {/* Outgoing handle (to local machine) */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: edgeColor, width: '6px', height: '6px', opacity: 0.5 }}
      />
    </div>
  );
};
