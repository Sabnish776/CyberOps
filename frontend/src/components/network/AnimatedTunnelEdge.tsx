import React from 'react';
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';

export const AnimatedTunnelEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data
}: EdgeProps) => {
  const { edgeColorOverride } = (data || {}) as {
    edgeColorOverride?: string;
  };

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Determine color: override wins, then default
  const edgeColor = edgeColorOverride || '#00f0ff';

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        strokeWidth: 2.5,
        stroke: edgeColor,
        filter: `drop-shadow(0 0 4px ${edgeColor})`,
        animation: 'dashdraw 1s linear infinite'
      }}
      className="react-flow__edge-path animated-cyber-edge"
    />
  );
};
