# FTTH Module Audit & Development Roadmap

## Overview

Comprehensive audit and enhancement of the FTTH infrastructure module to ensure real-time data consistency, improved visualization, and flexible fiber path mapping.

---

## Current State (Pre-Audit)

| Feature | Status | Notes |
|---------|--------|-------|
| FTTH Tree (OTB→ODC→ODP→ONU) | ✅ Exists | Hierarchy view with expand/collapse |
| OTB/ODC/ODP CRUD | ✅ Exists | Full create/edit/delete with location picker |
| PON Port management | ✅ Exists | Links OLT PON → OTB core |
| ODP Port → ONU linking | ✅ Exists | Manual linking via available ONU list |
| FTTH Map (Leaflet) | ✅ Exists | Markers + connection lines, 30s polling |
| WebSocket realtime | ✅ Partial | `onu_change` event triggers map refresh |
| ONU status on map | ⚠️ Partial | Online/LOS/DyingGasp/Offline — missing Unregister |
| FTTH Overview stats | ❌ Missing | No aggregate statistics dashboard |
| Port usage visualization | ❌ Missing | No used/available bars on cards |
| Connection status indicators | ❌ Missing | No active/inactive on nodes |
| Path highlighting | ❌ Missing | No OLT→customer end-to-end highlight |
| Marker clustering | ❌ Missing | All markers render individually |
| Node click details | ⚠️ Basic | Popup shows name + status only |
| Manual fiber routing | ❌ Missing | No polyline drawing |
| Auto routing | ❌ Missing | No OSRM/road-following |
| PON port bandwidth | ❌ Missing | No utilization/overload indicators |
| Orphan validation | ❌ Missing | No check for unlinked nodes |
| Per-OLT/PON breakdown | ❌ Missing | No drill-down from stats |

---

## Phase 1: FTTH Overview & Realtime Stats

**Goal:** New "Overview" tab with live aggregate statistics and drill-down filtering.

### Changes

#### Backend (`app.py`)
- New endpoint: `GET /api/ftth/stats` — returns aggregate ONU status counts (total, online, offline, los, dyinggasp, unregister) with breakdowns per OLT and per PON port
- Query joins ONU table with OLT for tenant filtering
- Includes ODP port usage summary (total ports, used, available)
- Includes orphan count (ONUs without ODP port, ODPs without ODC, ODCs without OTB)

#### Frontend (`FtthInfrastructure.tsx`)
- New `overview` tab added as default (before `tree`)
- `OverviewTab` component with:
  - 6 stat cards: Total ONU, Online, Offline, LOS, Dying Gasp, Unregister
  - Each card clickable → filters tree/list view by status
  - Per-OLT breakdown section (collapsible cards with per-OLT ONU status counts)
  - Per-PON Port breakdown section (table with ONU counts per PON, port status)
  - Infrastructure summary: OTB count, ODC count, ODP count, total ports, used ports
  - Orphan alert banner if unlinked nodes detected
- WebSocket integration: `onu_change` and `sync_complete` events trigger stats refetch
- Polling: 30s interval when Overview tab active

#### Files Modified
| File | Change |
|------|--------|
| `app.py` | Add `/api/ftth/stats` endpoint |
| `frontend/src/lib/api.ts` | Add `ftthStats` API function + types |
| `frontend/src/pages/FtthInfrastructure.tsx` | Add Overview tab, `OverviewTab` component |

---

## Phase 2: Port Usage Visualization & Connection Status

**Goal:** Visual port usage bars and connection status on all infrastructure cards.

### Changes

#### Backend (`app.py`)
- Enhance `_otb_to_dict()`: add `used_cores` (count of ODCs linked), `available_cores`
- Enhance `_odc_to_dict()`: add `used_cores` (count of ODPs linked), `available_cores`
- Enhance `_odp_to_dict()`: already has `used_ports` — add `available_ports`
- New endpoint: `GET /api/ftth/orphans` — returns lists of orphaned nodes (ODP without ODC, ODC without OTB, ONU without ODP port)

#### Frontend (`FtthInfrastructure.tsx`)
- OTB cards: progress bar showing cores used vs total, connection status badge (Active if has ODCs)
- ODC cards: progress bar showing cores used vs total, connection status badge
- ODP cards: progress bar showing ports used vs total, status badge (Active if has linked ONUs)
- Tree view: same bars inline on each node
- Orphan warning banner with count + "View orphans" button that filters to show only orphaned items
- Color-coded utilization: green (<70%), amber (70-90%), red (>90%)

#### Files Modified
| File | Change |
|------|--------|
| `app.py` | Enhance dict functions, add orphan endpoint |
| `frontend/src/lib/api.ts` | Update types with usage fields |
| `frontend/src/pages/FtthInfrastructure.tsx` | Add usage bars, status badges, orphan detection |

---

## Phase 3: Enhanced FTTH Map

**Goal:** Full ONU status colors, node click details, marker clustering, path highlighting.

### Changes

#### Backend (`app.py`)
- Enhance `/api/ftth/map`: add `rx_power`, `tx_power`, `olt_name`, `pon_port`, `onu_id_str` to ONU markers
- Add `unregister` status to ONU markers (ONUs with status `unregister` or no status)
- Add OLT markers (from OLT table with coordinates if available)

#### Frontend
- **`LeafletMap.tsx`**:
  - Add `unregister` status color (white/light gray)
  - Add marker clustering via `leaflet.markercluster` plugin (loaded from CDN)
  - Node click → detailed popup with: name, status, RX/TX power, PON port, OLT name, serial
  - Line click → highlight end-to-end path (all connected segments)
  - "Highlight path" mode: click a node → highlights full chain OLT→OTB→ODC→ODP→ONU
  - Legend updated with all 5 ONU status colors
  - Performance: only render markers in viewport when >500 ONUs

- **`FtthInfrastructure.tsx`**:
  - Map tab: add filter controls (status filter, OLT filter, search)
  - Map refetch on WebSocket `onu_change` event (already exists, verify working)
  - Map refetch interval reduced to 15s when active

#### Files Modified
| File | Change |
|------|--------|
| `app.py` | Enhance map endpoint with more ONU data |
| `frontend/src/components/LeafletMap.tsx` | Clustering, detailed popups, path highlighting, unregister color |
| `frontend/src/pages/FtthInfrastructure.tsx` | Map filters, status filter integration |

---

## Phase 4: Manual Fiber Routing

**Goal:** Users can draw, edit, and save fiber path polylines on the map.

### Changes

#### Backend
- New model: `FTTHFiberPath` — stores polyline coordinates between two nodes
  - `id`, `from_type` (otb/odc/odp/onu), `from_id`, `to_type`, `to_id`
  - `coordinates` (JSON array of [lat,lng] points)
  - `path_type` (manual/auto), `created_at`, `updated_at`
- New endpoints:
  - `GET /api/ftth/paths` — all saved fiber paths
  - `POST /api/ftth/paths` — save new path
  - `PUT /api/ftth/paths/<id>` — update path coordinates
  - `DELETE /api/ftth/paths/<id>` — delete path

#### Frontend
- **`LeafletMap.tsx`**:
  - "Draw Mode" toggle button
  - Click on map to add waypoints → builds polyline
  - Drag existing waypoints to edit
  - Save button → POST coordinates to backend
  - Existing saved paths loaded and rendered as solid lines
  - Auto-generated straight lines (current behavior) shown as dashed when manual path exists

- **`FtthInfrastructure.tsx`**:
  - Map tab: "Draw Fiber Path" button when canEdit
  - Path management panel: list saved paths, delete, redraw

#### Files Modified
| File | Change |
|------|--------|
| `models.py` | Add `FTTHFiberPath` model |
| `app.py` | CRUD endpoints for fiber paths |
| `frontend/src/lib/api.ts` | Path API functions + types |
| `frontend/src/components/LeafletMap.tsx` | Drawing mode, polyline editing, path rendering |
| `frontend/src/pages/FtthInfrastructure.tsx` | Path management UI |

---

## Phase 5: Auto Routing (Smart Path)

**Goal:** Auto-generate fiber paths following roads via OSRM or OpenStreetMap Routing API.

### Changes

#### Backend
- New endpoint: `POST /api/ftth/paths/auto` — accepts from/to coordinates, calls OSRM API, returns polyline coordinates
- Uses public OSRM demo server (or configurable self-hosted instance)
- Falls back to straight line if routing fails

#### Frontend
- **`LeafletMap.tsx`**:
  - "Auto Route" button: click two nodes → auto-generate road-following path
  - Loading indicator while routing API is called
  - Generated path is editable after creation (same as manual)
  - "Route via roads" vs "Straight line" toggle

#### Files Modified
| File | Change |
|------|--------|
| `app.py` | Auto-routing endpoint with OSRM integration |
| `frontend/src/lib/api.ts` | Auto-route API function |
| `frontend/src/components/LeafletMap.tsx` | Auto-route UI, loading state |
| `frontend/src/pages/FtthInfrastructure.tsx` | Auto-route button |

---

## Phase 6: PON Port Monitoring

**Goal:** PON port tab shows ONU count, bandwidth utilization, port status, and overload indicators.

### Changes

#### Backend
- Enhance `/api/ftth/pon`: join with `OLTPort` for admin_status, onu_count, onu_online
- New endpoint: `GET /api/ftth/pon/<id>/traffic` — recent traffic data for PON port (from TrafficLog if available)
- Overload detection: flag PON ports where onu_count > threshold or bandwidth > threshold

#### Frontend
- PON Port tab redesign:
  - Card grid with: port name, status (up/down), ONU count (online/total), utilization bar
  - Overload badge (red) when utilization > 80%
  - Click card → expand to show ONU list with status, RX power
  - Mini traffic sparkline if traffic data available
  - Filter by OLT, status, overload

#### Files Modified
| File | Change |
|------|--------|
| `app.py` | Enhance PON list, add traffic endpoint |
| `frontend/src/lib/api.ts` | Update PON types, add traffic API |
| `frontend/src/pages/FtthInfrastructure.tsx` | PON tab redesign with monitoring |

---

## Implementation Order

```
Phase 1 (Overview)  →  Phase 2 (Port Usage)  →  Phase 3 (Map Enhancement)
         ↓
Phase 4 (Manual Routing)  →  Phase 5 (Auto Routing)
         ↓
Phase 6 (PON Monitoring)
```

Each phase is independently deployable. Build verification after each phase.

---

## Data Consistency Audit (Cross-Phase)

All FTTH pages will use the same data source:
- ONU status comes from `ONU.status` field in SQLite (updated by sync)
- WebSocket `onu_change` event triggers refetch on all FTTH tabs
- No separate caching layer — React Query handles client-side cache invalidation
- Polling interval: 15-30s depending on tab activity

### ONU Status Values
| Status | Color | Description |
|--------|-------|-------------|
| `online` | 🟢 Green | ONU is online and operational |
| `offline` | ⚫ Dark Gray | ONU is registered but powered off |
| `los` | 🔴 Red | Loss of Signal — fiber cut or disconnect |
| `dyinggasp` | 🟠 Amber | ONU sent dying gasp — power failure |
| `unregister` | ⚪ White | ONU detected but not registered |

---

## Performance Considerations

- **Marker clustering**: Use `leaflet.markercluster` for >100 markers
- **Lazy loading**: Map markers load only when map tab is active (already implemented)
- **WebSocket over polling**: WebSocket events trigger immediate refresh; polling is fallback
- **Query optimization**: Backend uses single queries with joins instead of N+1 patterns
- **Database indexing**: Ensure `onu.olt_id`, `onu.status`, `ftth_odp_port.onu_id` are indexed
