import type { FTTHItem, FTTHOdcTree, FTTHJcTree, FTTHOdpTree } from './api';

export interface FlatOdpPortOption {
  id: number;
  label: string;
}

/** Walk a /api/ftth/tree response — including any JC (joint closure) hops
 * between OTB/ODC/ODP — and collect every ODP port that's available (or
 * matches `keepPortId`, so an already-assigned port stays selectable when
 * editing that same ONU/ODP). */
export function collectOdpPortOptions(tree: FTTHItem[] | undefined | null, keepPortId?: number | null): FlatOdpPortOption[] {
  const options: FlatOdpPortOption[] = [];

  function visitOdp(odp: FTTHOdpTree) {
    for (const port of odp.ports || []) {
      if (port.status === 'available' || port.id === keepPortId) {
        options.push({ id: port.id, label: `${odp.name} — Port ${port.port_number}` });
      }
    }
  }

  function visitOdc(odc: FTTHOdcTree) {
    for (const odp of odc.odps || []) visitOdp(odp);
    for (const jc of odc.jcs || []) visitJc(jc);
  }

  function visitJc(jc: FTTHJcTree) {
    for (const odc of jc.odcs || []) visitOdc(odc);
    for (const odp of jc.odps || []) visitOdp(odp);
    for (const child of jc.jcs || []) visitJc(child);
  }

  for (const otb of tree || []) {
    for (const odc of otb.odcs || []) visitOdc(odc);
    for (const jc of otb.jcs || []) visitJc(jc);
  }

  return options;
}
