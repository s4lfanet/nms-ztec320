/**
 * Shared hook for computing RackMetrics from RackData.
 * Unified computation across all vendors.
 */

import { useMemo } from 'react';
import type { RackData, RackMetrics } from '../types/rack';

export function useRackMetrics(data: RackData | null): RackMetrics | null {
  return useMemo(() => {
    if (!data) return null;

    const allPorts = data.slots.flatMap(s => s.ports);
    const ponPorts = allPorts.filter(p => !p.isUplink);
    const losTotal = ponPorts.reduce((sum, p) => sum + (p.los ?? 0), 0);
    const activeCards = data.slots.filter(s => s.isPresent && s.cardStatus === 'inservice').length;
    const fansActive = data.fans.filter(f => f.status === 'active').length;

    // Find PSU data (ZTE PRWH card has currentMa/voltageMv)
    const prwh = data.slots.find(s => s.slotIndex <= 1 && s.isPresent && s.currentMa != null);

    // Build port descriptions
    const portDescriptions: Record<string, string> = {};
    for (const slot of data.slots) {
      for (const port of slot.ports) {
        if (port.description) {
          portDescriptions[`${slot.slotIndex}/${port.portIndex}`] = port.description;
        }
      }
    }

    // All port keys
    const allPortKeys = Object.keys(portDescriptions).length > 0
      ? Object.keys(portDescriptions)
      : data.slots.flatMap(s => s.ports.map(p => `${s.slotIndex}/${p.portIndex}`));

    // PSU status
    const allPsusOk = data.psus.length > 0
      ? data.psus.every(p => p.status !== 'fault')
      : true;

    return {
      uptime: data.uptime,
      activeCards,
      fansActive,
      fansTotal: data.fans.length,
      losTotal,
      supplyCurrentMa: prwh?.currentMa ?? null,
      supplyVoltageMv: prwh?.voltageMv ?? null,
      psuStatus: data.psus.length > 0
        ? (allPsusOk ? 'normal' : 'fault')
        : 'unknown',
      portDescriptions,
      allPortKeys,
    };
  }, [data]);
}
