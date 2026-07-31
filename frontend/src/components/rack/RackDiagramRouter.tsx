/**
 * RackDiagramRouter — dispatches to ZTE rack diagram component.
 * ZTE C320 uses the chassis endpoint (RackDiagram), other ZTE models use ZteRackDiagram.
 */

import React from 'react';
import type { RackMetrics } from '../../types/rack';

interface RackDiagramRouterProps {
  oltId: string;
  oltVendor?: string;
  oltModel?: string;
  oltName?: string;
  oltIp?: string;
  isOnline?: boolean;
  lastSync?: string | null;
  onPortClick?: (slot: number, port: number) => void;
  onMetrics?: (m: RackMetrics) => void;
}

const ZteRackDiagram = React.lazy(() => import('./ZteRackDiagram'));

// ZTE C320 uses the existing RackDiagram component (chassis endpoint)
import { RackDiagram as ZteC320RackDiagram } from '../RackDiagram';

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-32 text-tx3 text-sm gap-2">
      <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      Memuat rack diagram...
    </div>
  );
}

export function RackDiagramRouter({
  oltId,
  oltModel,
  oltName,
  oltIp,
  isOnline,
  lastSync,
  onPortClick,
  onMetrics,
}: RackDiagramRouterProps) {
  const model = (oltModel || '').toUpperCase();

  // ZTE C320 uses the existing RackDiagram component (chassis endpoint)
  // C300 and other ZTE models use ZteRackDiagram (rack endpoint with proper C300 chassis layout)
  if (model.includes('C320') || !model) {
    return (
      <ZteC320RackDiagram
        oltId={parseInt(oltId, 10)}
        oltName={oltName}
        oltIp={oltIp}
        isOnline={isOnline}
        lastSync={lastSync}
      />
    );
  }

  return (
    <React.Suspense fallback={<LoadingFallback />}>
      <ZteRackDiagram
        oltId={oltId}
        onPortClick={onPortClick}
        onMetrics={onMetrics}
      />
    </React.Suspense>
  );
}
