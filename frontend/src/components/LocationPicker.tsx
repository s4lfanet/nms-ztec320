import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Crosshair, X, Check } from 'lucide-react';
import { toast } from './Toast';

// Load Leaflet from CDN dynamically
let leafletLoaded = false;
function loadLeaflet(): Promise<void> {
  if (leafletLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    // CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    // JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => { leafletLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load map'));
    document.head.appendChild(script);
  });
}

interface LocationPickerProps {
  latitude: string | number | null;
  longitude: string | number | null;
  onChange: (lat: string, lng: string) => void;
}

export function LocationPicker({ latitude, longitude, onChange }: LocationPickerProps) {
  const [showMap, setShowMap] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const detectGPS = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported by this browser');
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6));
        setDetecting(false);
        toast.success('Location detected');
      },
      (err) => {
        setDetecting(false);
        toast.error(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-2 gap-2">
          <div className="relative">
            <input
              className="input-field text-xs"
              style={{ paddingLeft: '2.25rem' }}
              type="text"
              inputMode="decimal"
              value={latitude ?? ''}
              onChange={e => onChange(e.target.value, String(longitude ?? ''))}
              onBlur={() => { const v = parseFloat(String(latitude)); if (latitude && !isNaN(v)) onChange(v.toFixed(6), String(longitude ?? '')); }}
              placeholder="Latitude"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx3 text-xs pointer-events-none">Lat</span>
          </div>
          <div className="relative">
            <input
              className="input-field text-xs"
              style={{ paddingLeft: '2.25rem' }}
              type="text"
              inputMode="decimal"
              value={longitude ?? ''}
              onChange={e => onChange(String(latitude ?? ''), e.target.value)}
              onBlur={() => { const v = parseFloat(String(longitude)); if (longitude && !isNaN(v)) onChange(String(latitude ?? ''), v.toFixed(6)); }}
              placeholder="Longitude"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx3 text-xs pointer-events-none">Lng</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={detectGPS}
          disabled={detecting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          {detecting ? (
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          ) : (
            <Crosshair size={14} />
          )}
          {detecting ? 'Detecting...' : 'Detect GPS'}
        </button>
        <button
          type="button"
          onClick={() => setShowMap(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass text-tx2 text-xs font-medium hover:bg-glass/70 transition-colors"
        >
          <MapPin size={14} /> Pick on Map
        </button>
        {latitude && longitude && (
          <span className="text-xs text-success flex items-center gap-1 ml-auto">
            <Check size={12} /> Location set
          </span>
        )}
      </div>
      {showMap && (
        <MapModal
          lat={latitude ? parseFloat(String(latitude)) : null}
          lng={longitude ? parseFloat(String(longitude)) : null}
          onPick={(lat, lng) => { onChange(lat, lng); setShowMap(false); }}
          onClose={() => setShowMap(false)}
        />
      )}
    </div>
  );
}

// ─── Map Modal with Leaflet ───
function MapModal({ lat, lng, onPick, onClose }: {
  lat: number | null; lng: number | null;
  onPick: (lat: string, lng: string) => void;
  onClose: () => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const initMap = useCallback(async () => {
    try {
      await loadLeaflet();
      setReady(true);
    } catch (e) {
      setError('Failed to load map. Check your internet connection.');
    }
  }, []);

  useEffect(() => {
    initMap();
  }, [initMap]);

  useEffect(() => {
    if (!ready || !mapRef.current || !(window as any).L) return;
    const L = (window as any).L;
    const center: [number, number] = lat && lng ? [lat, lng] : [-6.2, 106.8];
    const map = L.map(mapRef.current).setView(center, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    if (lat && lng) {
      markerRef.current = L.marker([lat, lng]).addTo(map);
    }

    map.on('click', (e: any) => {
      const { lat: clickedLat, lng: clickedLng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([clickedLat, clickedLng]);
      } else {
        markerRef.current = L.marker([clickedLat, clickedLng]).addTo(map);
      }
    });

    mapInstance.current = map;
    setTimeout(() => map.invalidateSize(), 100);

    return () => { map.remove(); mapInstance.current = null; };
  }, [ready, lat, lng]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !mapInstance.current) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const { lat: sLat, lon: sLng } = data[0];
        const L = (window as any).L;
        const map = mapInstance.current;
        map.setView([parseFloat(sLat), parseFloat(sLng)], 16);
        if (markerRef.current) {
          markerRef.current.setLatLng([sLat, sLng]);
        } else {
          markerRef.current = L.marker([sLat, sLng]).addTo(map);
        }
      } else {
        toast.error('Location not found');
      }
    } catch {
      toast.error('Search failed');
    }
    setSearching(false);
  };

  const handleConfirm = () => {
    if (markerRef.current) {
      const ll = markerRef.current.getLatLng();
      onPick(ll.lat.toFixed(6), ll.lng.toFixed(6));
    } else {
      toast.warning('Click on the map to set a location first');
    }
  };

  const handleDetectGPS = () => {
    if (!navigator.geolocation || !mapInstance.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const L = (window as any).L;
        const map = mapInstance.current;
        const { latitude: gLat, longitude: gLng } = pos.coords;
        map.setView([gLat, gLng], 16);
        if (markerRef.current) {
          markerRef.current.setLatLng([gLat, gLng]);
        } else {
          markerRef.current = L.marker([gLat, gLng]).addTo(map);
        }
        toast.success('GPS location detected');
      },
      (err) => toast.error(`GPS error: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="modal-overlay" />
        <div className="relative glass-card w-full max-w-2xl p-6 text-center">
          <p className="text-danger text-sm mb-3">{error}</p>
          <button onClick={onClose} className="btn-cancel text-sm">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-overlay" />
      <div className="relative glass-card w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="px-4 py-3 border-b border-brd flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin size={16} /> Pick Location on Map</h3>
          <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button>
        </div>
        {/* Search bar */}
        <div className="px-4 py-2 border-b border-brd flex items-center gap-2">
          <input
            className="input-field flex-1 text-xs"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search address or place..."
          />
          <button onClick={handleSearch} disabled={searching} className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 disabled:opacity-50">
            {searching ? '...' : 'Search'}
          </button>
          <button onClick={handleDetectGPS} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-glass text-tx2 text-xs font-medium hover:bg-glass/70">
            <Crosshair size={12} /> GPS
          </button>
        </div>
        {/* Map */}
        <div className="relative flex-1 min-h-[300px]">
          {!ready && <div className="absolute inset-0 flex items-center justify-center text-tx3 text-sm">Loading map...</div>}
          <div ref={mapRef} className="w-full h-full" style={{ minHeight: 300 }} />
        </div>
        {/* Footer */}
        <div className="px-4 py-3 border-t border-brd flex items-center justify-between">
          <p className="text-xs text-tx3">Click on map to place marker</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-cancel text-sm">Cancel</button>
            <button onClick={handleConfirm} className="btn-primary text-sm flex items-center gap-1.5"><Check size={14} /> Confirm Location</button>
          </div>
        </div>
      </div>
    </div>
  );
}
