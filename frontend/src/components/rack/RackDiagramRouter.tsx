/**
 * RackDiagramRouter — dispatches to vendor-specific rack diagram component.
 * ZTE C320 uses the chassis endpoint (RackDiagram), other ZTE models use ZteRackDiagram,
 * and non-ZTE vendors (HiOSO, HSGQ, VSOL, C-Data, BDCOM, Huawei, FiberHome, etc.)
 * use StandaloneEponRackDiagram.
 */

import React from 'react';
import type { RackMetrics } from '../../types/rack';
import { RackDiagram as ZteC320RackDiagram } from '../RackDiagram';

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
const StandaloneEponRackDiagram = React.lazy(() => import('./StandaloneEponRackDiagram'));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-32 text-tx3 text-sm gap-2">
      <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      Memuat rack diagram...
    </div>
  );
}

export function RackDiagramRouter({
  oltId,
  oltVendor = 'zte',
  oltModel,
  oltName,
  oltIp,
  isOnline,
  lastSync,
  onPortClick,
  onMetrics,
}: RackDiagramRouterProps) {
  const vendor = (oltVendor || 'zte').toLowerCase();
  const model = (oltModel || '').toUpperCase();

  if (vendor !== 'zte') {
    return (
      <React.Suspense fallback={<LoadingFallback />}>
        <StandaloneEponRackDiagram
          oltId={oltId}
          onPortClick={onPortClick}
          onMetrics={onMetrics}
        />
      </React.Suspense>
    );
  }

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
