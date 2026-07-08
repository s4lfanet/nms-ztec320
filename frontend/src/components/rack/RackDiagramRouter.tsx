/**
 * RackDiagramRouter — dispatches to vendor-specific rack diagram component
 * based on the OLT's vendor field.
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

// Vendor-specific components (lazy loaded)
const ZteRackDiagram = React.lazy(() => import('./ZteRackDiagram'));
const HsgqRackDiagram = React.lazy(() => import('./HsgqRackDiagram'));
const RaisecomRackDiagram = React.lazy(() => import('./RaisecomRackDiagram'));
const StandaloneEponRackDiagram = React.lazy(() => import('./StandaloneEponRackDiagram'));

// Fallback for existing RackDiagram (ZTE C320 chassis endpoint)
import { RackDiagram as ZteC320RackDiagram } from '../RackDiagram';

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-32 text-gray-400 text-sm gap-2">
      <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
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

  // ZTE C320 uses the existing RackDiagram component (chassis endpoint)
  // C300 and other ZTE models use ZteRackDiagram (rack endpoint with proper C300 chassis layout)
  if (vendor === 'zte' && (model.includes('C320') || !model)) {
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

  // Map vendor to component
  const componentMap: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
    zte: ZteRackDiagram,
    hsgq: HsgqRackDiagram,
    raisecom: RaisecomRackDiagram,
    standalone_epon: StandaloneEponRackDiagram,
    bdcom: StandaloneEponRackDiagram,
    'c-data': StandaloneEponRackDiagram,
    cdata: StandaloneEponRackDiagram,
    vsol: StandaloneEponRackDiagram,
  };

  const Component = componentMap[vendor];

  if (!Component) {
    return (
      <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 p-5 text-sm text-yellow-700 dark:text-yellow-400">
        Rack diagram untuk vendor '{oltVendor}' belum didukung.
      </div>
    );
  }

  return (
    <React.Suspense fallback={<LoadingFallback />}>
      <Component
        oltId={oltId}
        onPortClick={onPortClick}
        onMetrics={onMetrics}
      />
    </React.Suspense>
  );
}
