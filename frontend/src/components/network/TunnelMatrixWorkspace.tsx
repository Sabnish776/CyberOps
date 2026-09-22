import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './network.css';

import { usePopup } from '../../context/PopupContext';
import { ServerProfile } from '../../types';
import { api } from '../../api/client';
import { LocalNode, ServerNode, WaypointNode } from './CustomNodes';
import { AnimatedTunnelEdge } from './AnimatedTunnelEdge';
import { CyberPopup } from '../common/CyberPopup';

const nodeTypes = { localNode: LocalNode, serverNode: ServerNode, waypointNode: WaypointNode };
const edgeTypes = { animatedTunnel: AnimatedTunnelEdge };

const MIN_HANDLES = 5; // minimum handles per node, grows with tunnel count

// ──────────────────────────────────────────────────────────
// FitViewHelper — sits *inside* <ReactFlow> so it can call
// useReactFlow().  It fires fitView() whenever:
//   1. The flow initializes
//   2. The node list changes (server added / removed)
// ──────────────────────────────────────────────────────────
const FitViewHelper = ({ nodeCount, isVisible }: { nodeCount: number; isVisible: boolean }) => {
  const { fitView } = useReactFlow();

  // Fire fitView every time the tab becomes visible
  useEffect(() => {
    if (isVisible && nodeCount > 0) {
      const timer = setTimeout(() => fitView({ padding: 0.25, duration: 600 }), 250);
      return () => clearTimeout(timer);
    }
  }, [isVisible, nodeCount, fitView]);

  return null;
};

// ──────────────────────────────────────────────────────────
// Main workspace — wrapped in ReactFlowProvider
// ──────────────────────────────────────────────────────────
interface TunnelMatrixWorkspaceProps {
  servers: ServerProfile[];
  isVisible?: boolean;
}

const TunnelMatrixInner: React.FC<TunnelMatrixWorkspaceProps> = ({ servers, isVisible = false }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [tunnels, setTunnels] = useState<any[]>([]);
  const popup = usePopup();

  // Connection popup
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [serviceType, setServiceType] = useState('CUSTOM');
  const [remotePort, setRemotePort] = useState(8080);
  const [localPort, setLocalPort] = useState(8080);
  const [tunnelColor, setTunnelColor] = useState('#00f0ff');
  const [isCreating, setIsCreating] = useState(false);

  // Tunnel details popup
  const [selectedTunnel, setSelectedTunnel] = useState<any>(null);

  // ── Build nodes ──
  useEffect(() => {
    const n: Node[] = [];

    // Dynamic handle count: at least MIN_HANDLES, grows if more tunnels exist
    const activeTunnelCount = tunnels.filter(t => t.active).length;
    const handleCount = Math.max(MIN_HANDLES, activeTunnelCount + 2);

    // Local Machine at centre-bottom
    n.push({
      id: 'local',
      type: 'localNode',
      position: { x: 0, y: 350 },
      data: { handleCount },
    });

    // Servers in an arc above
    const count = servers.length;
    const arcRadius = Math.max(350, count * 100);

    servers.forEach((server, i) => {
      const angle = count === 1
        ? Math.PI / 2
        : Math.PI * 0.15 + (i * (Math.PI * 0.7) / (count - 1));
      const x = arcRadius * Math.cos(angle);
      const y = -arcRadius * Math.sin(angle);

      n.push({
        id: `server-${server.id}`,
        type: 'serverNode',
        position: { x, y },
        data: { server, handleCount },
      });
    });

    setNodes(n);
  }, [servers]);

  // ── Tunnel polling ──
  const loadTunnels = useCallback(async () => {
    try {
      setTunnels(await api.tunnels.listAll());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadTunnels();
    const id = setInterval(loadTunnels, 5000);
    return () => clearInterval(id);
  }, [loadTunnels]);

  // ── Build waypoint nodes + edges for each active tunnel ──
  useEffect(() => {
    const activeTunnels = tunnels.filter(t => t.active);
    const handleCount = Math.max(MIN_HANDLES, activeTunnels.length + 2);
    const serverHandleIndex: Record<string, number> = {};
    let localHandleIndex = 0;

    const tunnelEdges: Edge[] = [];

    setNodes(prevNodes => {
      const waypointNodes: Node[] = [];
      activeTunnels.forEach(tunnel => {
        const sourceId = `server-${tunnel.serverId}`;
        const waypointId = `wp-${tunnel.id}`;

        const sIdx = serverHandleIndex[sourceId] || 0;
        serverHandleIndex[sourceId] = sIdx + 1;
        const tIdx = localHandleIndex++;

        let edgeColor = tunnel.color || '#00f0ff';
        if (!tunnel.color) {
          switch (tunnel.serviceType?.toUpperCase()) {
            case 'POSTGRES': edgeColor = '#6495ED'; break;
            case 'REDIS':    edgeColor = '#ff4d4d'; break;
            case 'MYSQL':    edgeColor = '#f0a030'; break;
            case 'MONGODB':  edgeColor = '#47A248'; break;
            case 'HTTP':     edgeColor = '#e040fb'; break;
          }
        }

        const srcNode = prevNodes.find(n => n.id === sourceId);
        const tgtNode = prevNodes.find(n => n.id === 'local');
        const midX = srcNode && tgtNode
          ? (srcNode.position.x + tgtNode.position.x) / 2 + (sIdx - 1) * 60
          : sIdx * 80;
        const midY = srcNode && tgtNode
          ? (srcNode.position.y + tgtNode.position.y) / 2
          : 175;

        // If the waypoint already exists in prevNodes, preserve its position (so dragging works!), otherwise use computed midpoint
        const existingWp = prevNodes.find(n => n.id === waypointId);
        const position = existingWp ? existingWp.position : { x: midX, y: midY };

        waypointNodes.push({
          id: waypointId,
          type: 'waypointNode',
          position,
          data: { tunnel, edgeColor },
          draggable: true,
        });

        tunnelEdges.push({
          id: `e-${tunnel.id}-a`,
          source: sourceId,
          target: waypointId,
          sourceHandle: 'source-0',
          type: 'animatedTunnel',
          data: { edgeColorOverride: edgeColor },
        });

        tunnelEdges.push({
          id: `e-${tunnel.id}-b`,
          source: waypointId,
          target: 'local',
          targetHandle: 'target-0',
          type: 'animatedTunnel',
          data: { edgeColorOverride: edgeColor },
        });
      });

      const baseNodes = prevNodes.filter(n => !n.id.startsWith('wp-')).map(n => ({
        ...n,
        data: { ...n.data, handleCount }
      }));
      return [...baseNodes, ...waypointNodes];
    });

    setEdges(tunnelEdges);
  }, [tunnels]);

  // ── Flow callbacks ──
  const onNodesChange = useCallback(
    (c: NodeChange[]) => setNodes(nds => applyNodeChanges(c, nds)), []
  );
  const onEdgesChange = useCallback(
    (c: EdgeChange[]) => setEdges(eds => applyEdgeChanges(c, eds)), []
  );

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    // Tunnel data lives on the waypoint node. Find the waypoint from the edge.
    const wpId = edge.source.startsWith('wp-') ? edge.source : edge.target.startsWith('wp-') ? edge.target : null;
    if (wpId) {
      const wpNode = nodes.find(n => n.id === wpId);
      if (wpNode?.data?.tunnel) setSelectedTunnel(wpNode.data.tunnel);
    }
  }, [nodes]);

  const onConnect = useCallback((params: Connection) => {
    setServiceType('CUSTOM');
    setRemotePort(8080);
    setLocalPort(8080);
    setPendingConnection(params);
  }, []);

  // ── Port guessing ──
  const handleServiceTypeChange = (type: string) => {
    setServiceType(type);
    const portMap: Record<string, number> = {
      POSTGRES: 5432, MYSQL: 3306, REDIS: 6379, MONGODB: 27017, HTTP: 80
    };
    const colorMap: Record<string, string> = {
      POSTGRES: '#6495ED', MYSQL: '#f0a030', REDIS: '#ff4d4d', MONGODB: '#47A248', HTTP: '#e040fb', CUSTOM: '#00f0ff'
    };
    const port = portMap[type] || 8080;
    setRemotePort(port);
    setLocalPort(port);
    setTunnelColor(colorMap[type] || '#00f0ff');
  };

  // ── Create tunnel ──
  const createTunnel = async () => {
    if (!pendingConnection) return;
    setIsCreating(true);
    const serverId = pendingConnection.source!.replace('server-', '');
    try {
      await api.tunnels.create(parseInt(serverId), {
        name: `Mesh Tunnel: ${serviceType}`,
        serviceType,
        localPort,
        remotePort,
        remoteHost: '127.0.0.1',
        autoStart: true,
        color: tunnelColor
      });
      setPendingConnection(null);
      loadTunnels();
    } catch (e: any) {
      console.error('Failed to create tunnel', e);
      popup.alert({
        title: 'TUNNEL FAILED',
        message: e.message || 'Failed to create the tunnel configuration.',
        variant: 'danger',
        badgeText: 'NETWORK ERROR'
      });
    } finally {
      setIsCreating(false);
    }
  };

  // ── Render ──
  return (
    <div className="tunnel-matrix-canvas" style={{ width: '100%', height: '100%', position: 'relative' }}>

      {/* HUD bar */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 10,
        background: 'rgba(8,15,30,0.85)', backdropFilter: 'blur(8px)',
        padding: '10px 18px', borderRadius: '10px',
        border: '1px solid rgba(0,240,255,0.3)',
        color: '#fff', display: 'flex', gap: '16px', alignItems: 'center',
        fontSize: '0.82rem'
      }}>
        <span style={{ fontWeight: 700, color: 'var(--accent-cyan)', letterSpacing: '1px' }}>
          TUNNEL MATRIX
        </span>
        <span style={{ opacity: 0.6, fontStyle: 'italic' }}>
          Drag from Server ➜ Local Machine
        </span>
      </div>

      {nodes.length > 0 && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: 'animatedTunnel' }}
          connectionLineStyle={{ stroke: '#00f0ff', strokeWidth: 2, strokeDasharray: '6,6' }}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Lines}
            gap={60}
            lineWidth={1}
            color="rgba(0, 240, 255, 0.06)"
          />
          <Controls position="bottom-right" />
          <FitViewHelper nodeCount={nodes.length} isVisible={isVisible} />
        </ReactFlow>
      )}

      {/* Create Tunnel Popup */}
      <CyberPopup
        isOpen={!!pendingConnection}
        onCancel={() => setPendingConnection(null)}
        onConfirm={createTunnel}
        title="Establish Secure Tunnel"
        confirmText="Initialize Tunnel"
        cancelText="Cancel"
        loading={isCreating}
        loadingText="Initializing tunnel..."
        message={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <p style={{ color: 'var(--text-secondary)' }}>
              Configuring new SSH tunnel from{' '}
              <strong>{servers.find(s => `server-${s.id}` === pendingConnection?.source)?.name}</strong>{' '}
              to Local Machine.
            </p>
            <div className="form-group">
              <label>Service Type</label>
              <select className="form-control" value={serviceType} onChange={e => handleServiceTypeChange(e.target.value)}>
                <option value="CUSTOM">Custom Port (Manual)</option>
                <option value="POSTGRES">PostgreSQL (5432)</option>
                <option value="MYSQL">MySQL (3306)</option>
                <option value="REDIS">Redis (6379)</option>
                <option value="MONGODB">MongoDB (27017)</option>
                <option value="HTTP">HTTP Web (80)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Remote Port</label>
                <input type="text" className="form-control" value={remotePort} onChange={e => setRemotePort(Number(e.target.value) || 0)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Local Port</label>
                <input type="text" className="form-control" value={localPort} onChange={e => setLocalPort(Number(e.target.value) || 0)} />
              </div>
              <div className="form-group" style={{ width: '80px' }}>
                <label>Color</label>
                <input type="color" className="form-control" value={tunnelColor} onChange={e => setTunnelColor(e.target.value)} style={{ padding: '2px', height: '36px', cursor: 'pointer' }} />
              </div>
            </div>
          </div>
        }
      />

      {/* Tunnel Details Popup */}
      {selectedTunnel && (
        <CyberPopup
          isOpen
          variant="danger"
          onCancel={() => setSelectedTunnel(null)}
          onConfirm={async () => {
            try {
              await api.tunnels.delete(selectedTunnel.id);
              setSelectedTunnel(null);
              loadTunnels();
            } catch (err) {
              console.error('Failed to disconnect tunnel', err);
            }
          }}
          title={`Tunnel: ${selectedTunnel.name}`}
          confirmText="Disconnect Tunnel"
          cancelText="Close"
          message={
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ color: 'var(--text-secondary)' }}>Active SSH Port-Forwarding details:</p>
              <div style={{ background: 'rgba(0,0,0,0.4)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--accent-cyan)' }}>Service:</strong> {selectedTunnel.serviceType}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--accent-cyan)' }}>Host:</strong> {selectedTunnel.remoteHost}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--accent-emerald)' }}>Mapping:</strong> localhost:{selectedTunnel.localPort} ➜ remote:{selectedTunnel.remotePort}
                </div>
                <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>
                  <strong>CLI:</strong>
                  <code style={{ background: '#000', padding: '4px 8px', borderRadius: '4px', display: 'block', marginTop: '4px' }}>
                    ssh -L {selectedTunnel.localPort}:{selectedTunnel.remoteHost}:{selectedTunnel.remotePort} user@server
                  </code>
                </div>
              </div>
            </div>
          }
        />
      )}
    </div>
  );
};

// ── Exported wrapper with ReactFlowProvider ──
export const TunnelMatrixWorkspace: React.FC<TunnelMatrixWorkspaceProps> = (props) => (
  <ReactFlowProvider>
    <TunnelMatrixInner {...props} isVisible={props.isVisible} />
  </ReactFlowProvider>
);
