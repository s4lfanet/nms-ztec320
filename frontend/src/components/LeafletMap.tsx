import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

// Standard OpenStreetMap tiles — free, no API key. CartoDB's free dark basemap
// (formerly used here) started requiring a registered API key; this avoids that
// dependency entirely. Dark look comes from a CSS invert filter (.map-tiles-dark
// in index.css) applied only to this tile layer's own pane, not to markers/popups.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * LeafletMap — reusable interactive Leaflet map component.
 * Dynamically loads Leaflet CSS + JS from CDN.
 *
 * Props:
 *  - markers: Array<{ type, id, name, lat, lng, status?, ... }>
 *  - lines: Array<{ from_lat, from_lng, to_lat, to_lng, from_type, to_type, label }>
 *  - height: CSS height string (default '500px')
 *  - onMarkerClick?: (marker) => void
 *  - autoFit?: boolean — auto-fit bounds to markers (default true)
 *  - refreshKey?: string — when changed, re-render markers/lines (for realtime updates)
 */
export interface MapMarker {
  type: string;
  id: number;
  name: string;
  lat: number;
  lng: number;
  status?: string;
  serial?: string;
  olt_name?: string;
  onu_id_str?: string;
  rx_power?: number | null;
  tx_power?: number | null;
  onu_rx_power?: number | null;
  // Infrastructure fields (OTB/ODC/ODP/JC)
  subtype?: string;
  model?: string;
  location?: string;
  description?: string;
  splitter_model?: string;
  total_cores?: number;
  used_cores?: number;
  total_ports?: number;
  used_ports?: number;
  feed_source?: string;
  parent_name?: string;
  odc_core_number?: number | null;
  splice_count?: number;
  parent_type?: string;
  // ONU customer fields
  distance?: number | null;
  pppoe?: string;
  actual_type?: string;
  technician?: string;
  odp_name?: string;
  odp_port?: number;
  customer_name?: string;
  customer_phone?: string;
  [key: string]: unknown;
}

export interface MapLine {
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  from_type: string;
  to_type: string;
  from_id?: number;
  to_id?: number;
  label: string;
}

let leafletLoaded = false;
let leafletLoading: Promise<void> | null = null;

function loadLeaflet(): Promise<void> {
  if (leafletLoaded) return Promise.resolve();
  if (leafletLoading) return leafletLoading;

  leafletLoading = new Promise<void>((resolve, reject) => {
    // Load CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load MarkerCluster CSS
    const link2 = document.createElement('link');
    link2.rel = 'stylesheet';
    link2.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
    document.head.appendChild(link2);

    const link3 = document.createElement('link');
    link3.rel = 'stylesheet';
    link3.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
    document.head.appendChild(link3);

    // Load JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      // Load MarkerCluster plugin after Leaflet loads
      const script2 = document.createElement('script');
      script2.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
      script2.onload = () => { leafletLoaded = true; resolve(); };
      script2.onerror = () => { leafletLoaded = true; resolve(); }; // Continue without clustering
      document.head.appendChild(script2);
    };
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });

  return leafletLoading;
}

const MARKER_COLORS: Record<string, string> = {
  otb: '#3b82f6',
  jc: '#a855f7',
  odc: '#f59e0b',
  odp: '#22c55e',
  onu: '#06b6d4',
};

const MARKER_LABELS: Record<string, string> = {
  otb: 'OTB/ODF',
  jc: 'JC',
  odc: 'ODC',
  odp: 'ODP',
  onu: 'ONU',
};

const ONU_STATUS_COLORS: Record<string, string> = {
  online: '#22c55e',
  offline: '#64748b',
  los: '#ef4444',
  dyinggasp: '#f59e0b',
  unregister: '#e2e8f0',
};

function getMarkerColor(marker: MapMarker): string {
  if (marker.type === 'onu') {
    return ONU_STATUS_COLORS[(marker.status || 'offline').toLowerCase()] || '#64748b';
  }
  return MARKER_COLORS[marker.type] || '#64748b';
}

function createDivIcon(color: string, type: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'custom-map-marker';
  div.style.cssText = `
    width: 14px; height: 14px; border-radius: 50%;
    background: ${color}; border: 2px solid white;
    box-shadow: 0 0 4px rgba(0,0,0,0.4);
    cursor: pointer;
  `;

  if (type === 'onu') {
    div.style.width = '10px';
    div.style.height = '10px';
    div.style.borderRadius = '50';
  }

  return div;
}

// ─── Rich popup builder — type-specific sections for each FTTH element ───
function esc(s: unknown): string {
  if (s == null || s === '') return '';
  return String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}

function popupRow(label: string, value: unknown, opts?: { color?: string; bold?: boolean }): string {
  const v = value == null || value === '' ? '' : String(value);
  if (!v) return '';
  const color = opts?.color ? `color:${opts.color};` : '';
  const bold = opts?.bold ? 'font-weight:600;' : '';
  return `<div style="display:flex;justify-content:space-between;gap:8px;padding:1px 0;${color}${bold}"><span style="color:var(--text-3);flex-shrink:0">${label}</span><span style="text-align:right">${esc(v)}</span></div>`;
}

function popupSection(title: string, rows: string[]): string {
  const visible = rows.filter(r => r);
  if (visible.length === 0) return '';
  return `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(128,128,128,0.2)"><div style="font-size:9px;text-transform:uppercase;color:var(--text-3);letter-spacing:0.5px;margin-bottom:2px">${title}</div>${visible.join('')}</div>`;
}

function buildPopupHtml(m: MapMarker): string {
  const typeLabel = MARKER_LABELS[m.type] || m.type;
  const statusColor = m.status ? (ONU_STATUS_COLORS[m.status.toLowerCase()] || '#64748b') : '';
  let html = `<div style="font-size:12px;min-width:200px;max-width:280px">`;
  // Header
  html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">`;
  html += `<div style="width:10px;height:10px;border-radius:50%;background:${getMarkerColor(m)};flex-shrink:0"></div>`;
  html += `<strong style="font-size:13px">${esc(m.name)}</strong>`;
  html += `</div>`;
  html += `<div style="font-size:10px;color:var(--text-3);margin-bottom:2px">${typeLabel}`;
  if (m.subtype) html += ` · ${esc(m.subtype).toUpperCase()}`;
  if (m.status) html += ` · <span style="color:${statusColor};font-weight:600">● ${esc(m.status)}</span>`;
  html += `</div>`;

  if (m.type === 'onu') {
    // ONU / Customer popup
    const optical: string[] = [
      popupRow('OLT RX', m.rx_power != null ? `${m.rx_power} dBm` : '', { color: 'var(--text-2)' }),
      popupRow('ONU RX', m.onu_rx_power != null ? `${m.onu_rx_power} dBm` : '', { color: 'var(--text-2)' }),
      popupRow('ONU TX', m.tx_power != null ? `${m.tx_power} dBm` : '', { color: 'var(--text-2)' }),
      popupRow('Distance', m.distance != null ? `${m.distance} m` : '', { color: 'var(--text-2)' }),
    ];
    const identity: string[] = [
      popupRow('Serial', m.serial),
      popupRow('OLT', m.olt_name),
      popupRow('Port', m.onu_id_str),
      popupRow('Model', m.actual_type),
    ];
    const customer: string[] = [
      popupRow('Customer', m.customer_name, { bold: true }),
      popupRow('Phone', m.customer_phone),
      popupRow('ODP', m.odp_name),
      popupRow('ODP Port', m.odp_port ? `Port ${m.odp_port}` : ''),
      popupRow('PPPoE', m.pppoe),
      popupRow('Technician', m.technician),
      popupRow('Description', m.description),
    ];
    html += popupSection('Optical', optical);
    html += popupSection('Identity', identity);
    html += popupSection('Customer', customer);
  } else if (m.type === 'otb') {
    const util = m.total_cores && m.total_cores > 0 ? `${m.used_cores ?? 0}/${m.total_cores} cores` : '';
    const infra: string[] = [
      popupRow('OLT', m.olt_name),
      popupRow('PON Port', m.pon_port),
      popupRow('Model', m.model),
      popupRow('Location', m.location),
      popupRow('Cores', util, { color: 'var(--text-2)', bold: true }),
    ];
    html += popupSection('Details', infra);
    if (m.description) html += popupSection('Notes', [popupRow('', m.description)]);
  } else if (m.type === 'odc') {
    const util = m.total_cores && m.total_cores > 0 ? `${m.used_cores ?? 0}/${m.total_cores} cores` : '';
    const feedLabel = m.feed_source === 'jc' ? 'From JC' : 'From OTB';
    const coreLabel = m.odc_core_number ? `Core ${m.odc_core_number}` : '';
    const infra: string[] = [
      popupRow(feedLabel, m.parent_name),
      popupRow('Core', coreLabel),
      popupRow('Splitter', m.splitter_model),
      popupRow('Model', m.model),
      popupRow('Location', m.location),
      popupRow('Cores', util, { color: 'var(--text-2)', bold: true }),
    ];
    html += popupSection('Details', infra);
    if (m.description) html += popupSection('Notes', [popupRow('', m.description)]);
  } else if (m.type === 'odp') {
    const util = m.total_ports && m.total_ports > 0 ? `${m.used_ports ?? 0}/${m.total_ports} ports` : '';
    const feedLabel = m.feed_source === 'jc' ? 'From JC' : m.feed_source === 'odp' ? 'From ODP' : 'From ODC';
    const infra: string[] = [
      popupRow(feedLabel, m.parent_name),
      popupRow('Splitter', m.splitter_model),
      popupRow('Model', m.model),
      popupRow('Location', m.location),
      popupRow('Ports', util, { color: 'var(--text-2)', bold: true }),
    ];
    html += popupSection('Details', infra);
    if (m.description) html += popupSection('Notes', [popupRow('', m.description)]);
  } else if (m.type === 'jc') {
    const infra: string[] = [
      popupRow('Type', m.subtype ? esc(m.subtype).toUpperCase() : ''),
      popupRow('From', m.parent_name ? `${esc(m.parent_type || '').toUpperCase()}: ${m.parent_name}` : ''),
      popupRow('Splices', m.splice_count != null ? m.splice_count : ''),
      popupRow('Cores', m.total_cores),
      popupRow('Location', m.location),
    ];
    html += popupSection('Details', infra);
    if (m.description) html += popupSection('Notes', [popupRow('', m.description)]);
  }

  // Coordinates footer
  html += `<div style="margin-top:4px;padding-top:3px;border-top:1px solid rgba(128,128,128,0.15);font-size:9px;color:var(--text-3)">${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}</div>`;
  html += `</div>`;
  return html;
}

export function LeafletMap({
  markers,
  lines,
  fiberPaths = [],
  height = '500px',
  onMarkerClick,
  autoFit = true,
  refreshKey,
  drawMode = false,
  onDrawComplete,
}: {
  markers: MapMarker[];
  lines: MapLine[];
  fiberPaths?: Array<{ id: number; from_type: string; from_id: number; to_type: string; to_id: number; coordinates: [number, number][]; path_type: string }>;
  height?: string;
  onMarkerClick?: (marker: MapMarker) => void;
  autoFit?: boolean;
  refreshKey?: string;
  drawMode?: boolean;
  onDrawComplete?: (coords: [number, number][]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);
  const highlightRef = useRef<any>(null);
  const pathLayerRef = useRef<any>(null);
  const drawLayerRef = useRef<any>(null);
  const drawPointsRef = useRef<[number, number][]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);

  // Load Leaflet
  useEffect(() => {
    loadLeaflet().then(() => setLoaded(true)).catch(e => setError(e.message));
  }, []);

  // Initialize map
  useEffect(() => {
    if (!loaded || !containerRef.current || mapRef.current) return;
    const L = (window as any).L;

    mapRef.current = L.map(containerRef.current, {
      center: [-2.5, 118],
      zoom: 5,
      scrollWheelZoom: true,
    });

    tileLayerRef.current = L.tileLayer(TILE_URL, {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
      className: 'map-tiles-dark',
    }).addTo(mapRef.current);

    layerRef.current = L.layerGroup().addTo(mapRef.current);
    highlightRef.current = L.layerGroup().addTo(mapRef.current);
    pathLayerRef.current = L.layerGroup().addTo(mapRef.current);
    drawLayerRef.current = L.layerGroup().addTo(mapRef.current);

    // Initialize marker cluster if plugin is available
    if (L.markerClusterGroup) {
      clusterRef.current = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
      });
      mapRef.current.addLayer(clusterRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
        clusterRef.current = null;
        highlightRef.current = null;
        pathLayerRef.current = null;
        drawLayerRef.current = null;
      }
    };
  }, [loaded]);

  // Highlight full path for a marker (BFS along connected lines)
  function highlightPath(marker: MapMarker, lines: MapLine[]) {
    if (!highlightRef.current || !layerRef.current) return;
    const L = (window as any).L;
    highlightRef.current.clearLayers();

    const startKey = `${marker.type}:${marker.id}`;
    const visited = new Set<string>([startKey]);
    const queue = [startKey];
    const highlightedLines: MapLine[] = [];

    while (queue.length > 0) {
      const key = queue.shift()!;
      for (const line of lines) {
        const fromKey = line.from_id != null ? `${line.from_type}:${line.from_id}` : '';
        const toKey = line.to_id != null ? `${line.to_type}:${line.to_id}` : '';
        if (fromKey === key && !visited.has(toKey)) {
          visited.add(toKey);
          queue.push(toKey);
          highlightedLines.push(line);
        } else if (toKey === key && !visited.has(fromKey)) {
          visited.add(fromKey);
          queue.push(fromKey);
          highlightedLines.push(line);
        } else if (fromKey === key || toKey === key) {
          // Already visited neighbor but this line is part of the path
          if (!highlightedLines.includes(line)) highlightedLines.push(line);
        }
      }
    }

    // Draw highlighted lines on top
    for (const line of highlightedLines) {
      L.polyline(
        [[line.from_lat, line.from_lng], [line.to_lat, line.to_lng]],
        { color: '#fbbf24', weight: 4, opacity: 0.9 }
      ).addTo(highlightRef.current);
    }
  }

  // Update markers + lines when data changes
  useEffect(() => {
    if (!loaded || !mapRef.current || !layerRef.current) return;
    const L = (window as any).L;
    const layer = layerRef.current;
    layer.clearLayers();
    if (clusterRef.current) clusterRef.current.clearLayers();
    if (highlightRef.current) highlightRef.current.clearLayers();

    // Draw lines (base layer, dimmed)
    for (const line of lines) {
      L.polyline(
        [[line.from_lat, line.from_lng], [line.to_lat, line.to_lng]],
        {
          color: line.to_type === 'onu' ? '#06b6d4' : '#64748b',
          weight: line.to_type === 'onu' ? 1.5 : 2,
          opacity: 0.5,
          dashArray: '4 3',
        }
      ).addTo(layer);
    }

    // Draw markers — use cluster for ONUs, direct layer for infrastructure
    const validMarkers: MapMarker[] = [];
    for (const m of markers) {
      if (m.lat == null || m.lng == null) continue;
      validMarkers.push(m);

      const color = getMarkerColor(m);
      const icon = L.divIcon({
        html: createDivIcon(color, m.type).outerHTML,
        className: '',
        iconSize: m.type === 'onu' ? [10, 10] : [14, 14],
        iconAnchor: m.type === 'onu' ? [5, 5] : [7, 7],
      });

      const marker = L.marker([m.lat, m.lng], { icon });

      // Build detailed popup HTML — type-specific sections
      const popupHtml = buildPopupHtml(m);
      marker.bindPopup(popupHtml);

      // Click: highlight path + notify parent
      marker.on('click', () => {
        setSelectedMarker(m);
        highlightPath(m, lines);
        if (onMarkerClick) onMarkerClick(m);
      });

      // Add ONUs to cluster, infrastructure directly to layer
      if (clusterRef.current && m.type === 'onu') {
        clusterRef.current.addLayer(marker);
      } else {
        marker.addTo(layer);
      }
    }

    // Auto-fit bounds
    if (autoFit && validMarkers.length > 0) {
      const bounds = L.latLngBounds(validMarkers.map(m => [m.lat, m.lng] as [number, number]));
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [loaded, markers, lines, refreshKey, onMarkerClick, autoFit]);

  // Render saved fiber paths
  useEffect(() => {
    if (!loaded || !pathLayerRef.current) return;
    const L = (window as any).L;
    pathLayerRef.current.clearLayers();
    for (const path of fiberPaths) {
      if (!path.coordinates || path.coordinates.length < 2) continue;
      L.polyline(path.coordinates, {
        color: path.path_type === 'auto' ? '#3b82f6' : '#fbbf24',
        weight: 3,
        opacity: 0.8,
      }).addTo(pathLayerRef.current);
    }
  }, [loaded, fiberPaths]);

  // Draw mode: click to add waypoints
  useEffect(() => {
    if (!loaded || !mapRef.current || !drawLayerRef.current) return;
    const L = (window as any).L;
    const map = mapRef.current;
    const drawLayer = drawLayerRef.current;

    if (!drawMode) {
      drawLayer.clearLayers();
      drawPointsRef.current = [];
      setDrawPoints([]);
      map.off('click');
      return;
    }

    const handleClick = (e: any) => {
      const latlng = e.latlng;
      drawPointsRef.current.push([latlng.lat, latlng.lng]);
      setDrawPoints([...drawPointsRef.current]);
      drawLayer.clearLayers();
      // Draw polyline so far
      if (drawPointsRef.current.length >= 2) {
        L.polyline(drawPointsRef.current, { color: '#fbbf24', weight: 3, opacity: 0.7, dashArray: '5 5' }).addTo(drawLayer);
      }
      // Draw markers at each point
      for (const [lat, lng] of drawPointsRef.current) {
        L.circleMarker([lat, lng], { radius: 5, color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: 1 }).addTo(drawLayer);
      }
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [loaded, drawMode]);

  // Save drawn path
  function saveDrawnPath() {
    if (onDrawComplete && drawPointsRef.current.length >= 2) {
      onDrawComplete(drawPointsRef.current);
    }
    drawPointsRef.current = [];
    setDrawPoints([]);
    if (drawLayerRef.current) drawLayerRef.current.clearLayers();
  }

  // Clear drawn path
  function clearDrawnPath() {
    drawPointsRef.current = [];
    setDrawPoints([]);
    if (drawLayerRef.current) drawLayerRef.current.clearLayers();
  }

  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-danger text-sm">Failed to load map: {error}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="animate-pulse text-tx3 text-sm">Loading map...</div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        {Object.entries(MARKER_LABELS).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded-full" style={{ background: MARKER_COLORS[k] }} />
            <span className="text-tx3">{v}</span>
          </div>
        ))}
        {/* ONU status legend */}
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-success" />
          <span className="text-tx3">Online</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-tx3" />
          <span className="text-tx3">Offline</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-danger" />
          <span className="text-tx3">LOS</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-warning" />
          <span className="text-tx3">Dying Gasp</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-offline)', border: '1px solid var(--text-3)' }} />
          <span className="text-tx3">Unregister</span>
        </div>
        {selectedMarker && (
          <div className="flex items-center gap-1.5 text-xs ml-auto">
            <div className="w-3 h-1 rounded-full bg-warning" />
            <span className="text-tx3">Highlighted Path</span>
            <button onClick={() => { setSelectedMarker(null); if (highlightRef.current) highlightRef.current.clearLayers(); }} className="text-tx3 hover:text-tx1 ml-1">✕</button>
          </div>
        )}
      </div>

      {/* Map container */}
      <div
        ref={containerRef}
        style={{ height, width: '100%' }}
        className={cn('rounded-lg border border-brd overflow-hidden', drawMode && 'cursor-crosshair')}
      />

      {/* Draw mode controls */}
      {drawMode && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-warning font-medium">Draw Mode: Click on map to add waypoints</span>
          <span className="text-xs text-tx3">{drawPoints.length} points</span>
          <button onClick={saveDrawnPath} disabled={drawPoints.length < 2} className="px-2 py-1 rounded bg-success text-tx1 text-xs font-medium disabled:opacity-50">Save Path</button>
          <button onClick={clearDrawnPath} disabled={drawPoints.length === 0} className="px-2 py-1 rounded bg-glass text-tx2 text-xs font-medium disabled:opacity-50">Clear</button>
        </div>
      )}

      {/* Marker list */}
      {markers.length > 0 && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
          {markers.map((m, i) => {
            const sub: string[] = [];
            if (m.type === 'onu') {
              if (m.status) sub.push(m.status);
              if (m.olt_name) sub.push(m.olt_name);
              if (m.odp_name) sub.push(`ODP: ${m.odp_name}${m.odp_port ? `/${m.odp_port}` : ''}`);
            } else if (m.type === 'otb') {
              if (m.olt_name) sub.push(m.olt_name);
              if (m.pon_port) sub.push(m.pon_port);
              if (m.total_cores) sub.push(`${m.used_cores ?? 0}/${m.total_cores} cores`);
            } else if (m.type === 'odc') {
              if (m.parent_name) sub.push(`← ${m.parent_name}`);
              if (m.splitter_model) sub.push(m.splitter_model);
              if (m.total_cores) sub.push(`${m.used_cores ?? 0}/${m.total_cores} cores`);
            } else if (m.type === 'odp') {
              if (m.parent_name) sub.push(`← ${m.parent_name}`);
              if (m.splitter_model) sub.push(m.splitter_model);
              if (m.total_ports) sub.push(`${m.used_ports ?? 0}/${m.total_ports} ports`);
            } else if (m.type === 'jc') {
              if (m.subtype) sub.push(m.subtype);
              if (m.splice_count != null) sub.push(`${m.splice_count} splices`);
              if (m.parent_name) sub.push(`← ${m.parent_name}`);
            }
            return (
              <div key={i} className="p-2 rounded bg-glass text-xs flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: getMarkerColor(m) }} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{m.name}</div>
                  <div className="text-tx3 truncate">
                    {MARKER_LABELS[m.type] || m.type}
                    {sub.length > 0 && ` · ${sub.join(' · ')}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
