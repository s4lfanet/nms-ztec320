"""FTTH topology helpers shared by the FTTH routes and the alert monitor.

Downstream: "if this node breaks, which ONUs lose service" (impact).
Upstream:   "which nodes sit between this ONU and the OLT" (root-cause
correlation — see alerts._check_odp_outages).

Read-only: only queries the FTTH tables already filled in from the FTTH
menu. Nothing here talks to an OLT.
"""
from models import (db, ONU, FTTHOTB, FTTHJC, FTTHODC, FTTHODP, FTTHODPPort)

NODE_MODELS = {'otb': FTTHOTB, 'jc': FTTHJC, 'odc': FTTHODC, 'odp': FTTHODP}
_MAX_DEPTH = 25


def get_node(node_type, node_id):
    model = NODE_MODELS.get(node_type)
    if not model or not node_id:
        return None
    return db.session.get(model, node_id)


def collect_downstream_onus(node_type, node_id, _depth=0, _seen=None):
    """Recursively collect every ONU reachable downstream of a node (OTB,
    JC, ODC, or ODP) — used to answer "if this breaks, who's affected"."""
    if _seen is None:
        _seen = set()
    key = (node_type, node_id)
    if _depth > _MAX_DEPTH or key in _seen:
        return []
    _seen.add(key)
    onus = []
    if node_type == 'odp':
        for p in FTTHODPPort.query.filter_by(odp_id=node_id).all():
            if p.onu_id:
                onu = db.session.get(ONU, p.onu_id)
                if onu:
                    onus.append(onu)
        for child_odp in FTTHODP.query.filter_by(feed_source='odp').join(
                FTTHODPPort, FTTHODP.parent_odp_port_id == FTTHODPPort.id).filter(FTTHODPPort.odp_id == node_id).all():
            onus.extend(collect_downstream_onus('odp', child_odp.id, _depth + 1, _seen))
    elif node_type == 'odc':
        for odp in FTTHODP.query.filter_by(feed_source='odc', odc_id=node_id).all():
            onus.extend(collect_downstream_onus('odp', odp.id, _depth + 1, _seen))
        for jc in FTTHJC.query.filter_by(parent_type='odc', parent_id=node_id).all():
            onus.extend(collect_downstream_onus('jc', jc.id, _depth + 1, _seen))
    elif node_type == 'otb':
        for odc in FTTHODC.query.filter_by(feed_source='otb', otb_id=node_id).all():
            onus.extend(collect_downstream_onus('odc', odc.id, _depth + 1, _seen))
        for jc in FTTHJC.query.filter_by(parent_type='otb', parent_id=node_id).all():
            onus.extend(collect_downstream_onus('jc', jc.id, _depth + 1, _seen))
    elif node_type == 'jc':
        for otb in FTTHOTB.query.filter_by(feed_source='jc', jc_id=node_id).all():
            onus.extend(collect_downstream_onus('otb', otb.id, _depth + 1, _seen))
        for odc in FTTHODC.query.filter_by(feed_source='jc', jc_id=node_id).all():
            onus.extend(collect_downstream_onus('odc', odc.id, _depth + 1, _seen))
        for odp in FTTHODP.query.filter_by(feed_source='jc', jc_id=node_id).all():
            onus.extend(collect_downstream_onus('odp', odp.id, _depth + 1, _seen))
        for port in FTTHODPPort.query.filter_by(feed_source='jc', jc_id=node_id).all():
            if port.onu_id:
                onu = db.session.get(ONU, port.onu_id)
                if onu:
                    onus.append(onu)
        for child in FTTHJC.query.filter_by(parent_type='jc', parent_id=node_id).all():
            onus.extend(collect_downstream_onus('jc', child.id, _depth + 1, _seen))
    return onus


def parents_of(node_type, node):
    """Direct upstream node(s) of a node, as (type, id) pairs. Stops at the
    PON port — PON-wide outages are already batched per PON elsewhere."""
    out = []
    if node is None:
        return out
    if node_type == 'odp':
        src = node.feed_source or 'odc'
        if src == 'odc' and node.odc_id:
            out.append(('odc', node.odc_id))
        elif src == 'jc' and node.jc_id:
            out.append(('jc', node.jc_id))
        elif src == 'odp' and node.parent_odp_port_id:
            port = db.session.get(FTTHODPPort, node.parent_odp_port_id)
            if port and port.odp_id:
                out.append(('odp', port.odp_id))
    elif node_type == 'odc':
        src = node.feed_source or 'otb'
        if src == 'otb' and node.otb_id:
            out.append(('otb', node.otb_id))
        elif src == 'jc' and node.jc_id:
            out.append(('jc', node.jc_id))
    elif node_type == 'jc':
        pt, pid = node.parent_type, node.parent_id
        if pt in ('otb', 'odc', 'jc') and pid:
            out.append((pt, pid))
        elif pt == 'odp_port' and pid:
            port = db.session.get(FTTHODPPort, pid)
            if port and port.odp_id:
                out.append(('odp', port.odp_id))
    elif node_type == 'otb':
        if (node.feed_source or 'pon') == 'jc' and node.jc_id:
            out.append(('jc', node.jc_id))
    return out


def onu_leaf_nodes(onu):
    """The node(s) an ONU hangs off directly: its ODP, plus the JC when the
    ODP port is fed straight from a JC."""
    port = getattr(onu, 'odp_port', None)
    if not port or not port.odp_id:
        return []
    leaves = [('odp', port.odp_id)]
    if (port.feed_source or 'direct') == 'jc' and port.jc_id:
        leaves.append(('jc', port.jc_id))
    return leaves


def ancestors(node_type, node_id, cache=None):
    """All upstream nodes of a node (not including itself), cycle-safe."""
    if cache is not None and (node_type, node_id) in cache:
        return cache[(node_type, node_id)]
    seen = set()
    stack = [(node_type, node_id, 0)]
    while stack:
        t, i, depth = stack.pop()
        if depth > _MAX_DEPTH:
            continue
        for p in parents_of(t, get_node(t, i)):
            if p not in seen and p != (node_type, node_id):
                seen.add(p)
                stack.append((p[0], p[1], depth + 1))
    if cache is not None:
        cache[(node_type, node_id)] = seen
    return seen
