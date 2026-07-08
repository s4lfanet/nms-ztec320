import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Map as MapIcon, TreePine, Plus, Edit2, Trash2, ChevronDown, ChevronRight,
  Server, Box, Network, Split, X, MapPin, Link2, Unlink, Phone, Download, Upload, Cable
} from 'lucide-react';
import { api, type FTTHItem, type FTTHOtb, type FTTHOdc, type FTTHOdp, type FTTHOdpPort, type FTTHAvailableOnu, type FTTHPonPort } from '../lib/api';
import { cn } from '../lib/utils';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import { LocationPicker } from '../components/LocationPicker';
import { useHasPerm } from '../hooks/useHasPerm';

type Tab = 'tree' | 'map' | 'otb' | 'odc' | 'odp' | 'pon';
type ModalType = 'otb' | 'odc' | 'odp' | 'port' | 'pon' | null;

export function FtthInfrastructure() {
  const [searchParams] = useSearchParams();
  const hasPerm = useHasPerm();
  const canEdit = hasPerm('settings_ip_olts');
  const initialTab = (searchParams.get('tab') as Tab) || 'tree';
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    const urlTab = (searchParams.get('tab') as Tab) || 'tree';
    setTab(urlTab);
  }, [searchParams]);
  const [modal, setModal] = useState<ModalType>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [parentCtx, setParentCtx] = useState<any>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedOdp, setSelectedOdp] = useState<FTTHOdp | null>(null);
  const qc = useQueryClient();

  const { data: treeData, isLoading } = useQuery({
    queryKey: ['ftth-tree'],
    queryFn: api.ftthTree,
  });

  const { data: mapData } = useQuery({
    queryKey: ['ftth-map'],
    queryFn: api.ftthMap,
    enabled: tab === 'map',
  });

  const { data: otbList } = useQuery({ queryKey: ['ftth-otb'], queryFn: api.ftthOtbList });
  const { data: odcList } = useQuery({ queryKey: ['ftth-odc'], queryFn: () => api.ftthOdcList() });
  const { data: odpList } = useQuery({ queryKey: ['ftth-odp'], queryFn: () => api.ftthOdpList() });
  const { data: odpPorts } = useQuery({
    queryKey: ['ftth-odp-ports', selectedOdp?.id],
    queryFn: () => api.ftthOdpPorts(selectedOdp!.id),
    enabled: !!selectedOdp,
  });
  const { data: availableOnus } = useQuery({ queryKey: ['ftth-onus'], queryFn: () => api.ftthAvailableOnus() });
  const { data: ponList } = useQuery({ queryKey: ['ftth-pon'], queryFn: api.ftthPonList });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['ftth-tree'] });
    qc.invalidateQueries({ queryKey: ['ftth-map'] });
    qc.invalidateQueries({ queryKey: ['ftth-otb'] });
    qc.invalidateQueries({ queryKey: ['ftth-odc'] });
    qc.invalidateQueries({ queryKey: ['ftth-odp'] });
    qc.invalidateQueries({ queryKey: ['ftth-odp-ports'] });
    qc.invalidateQueries({ queryKey: ['ftth-pon'] });
  }, [qc]);

  const delMut = useMutation({
    mutationFn: async ({ type, id }: { type: ModalType; id: number }) => {
      if (type === 'otb') return api.ftthOtbDelete(id);
      if (type === 'odc') return api.ftthOdcDelete(id);
      if (type === 'odp') return api.ftthOdpDelete(id);
      if (type === 'pon') return api.ftthPonDelete(id);
    },
    onSuccess: () => { toast.success('Deleted'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleExpand = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  const openAdd = (type: ModalType, parent?: any) => {
    setEditItem(null);
    setParentCtx(parent || null);
    setModal(type);
  };
  const openEdit = (type: ModalType, item: any) => {
    setEditItem(item);
    setParentCtx(null);
    setModal(type);
  };

  const handleDelete = async (type: ModalType, id: number, name: string) => {
    const ok = await confirm({ title: `Delete ${name}`, message: `Are you sure you want to delete "${name}"? This will also delete all child items.`, confirmLabel: 'Delete', variant: 'danger' });
    if (ok) delMut.mutate({ type, id });
  };

  const tree = treeData?.tree || [];

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2"><Network size={20} /> FTTH Infrastructure</h1>
          <p className="text-tx2 text-xs md:text-sm mt-1">Manage OTB/ODF → ODC → ODP → ONU chain with map coordinates</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-glass rounded-lg p-0.5 overflow-x-auto scrollbar-thin max-w-full">
            <button onClick={() => setTab('tree')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'tree' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><TreePine size={14} /> Tree</button>
            <button onClick={() => setTab('pon')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'pon' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><Cable size={14} /> PON</button>
            <button onClick={() => setTab('otb')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'otb' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><Server size={14} /> OTB</button>
            <button onClick={() => setTab('odc')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'odc' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><Box size={14} /> ODC</button>
            <button onClick={() => setTab('odp')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'odp' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><Split size={14} /> ODP</button>
            <button onClick={() => setTab('map')} className={cn('px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0', tab === 'map' ? 'bg-accent text-white' : 'text-tx3 hover:text-tx1')}><MapIcon size={14} /> Map</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && tab === 'tree' && <button onClick={() => openAdd('otb')} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm"><Plus size={14} /> Add OTB</button>}
            {canEdit && tab === 'pon' && <button onClick={() => openAdd('pon')} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm"><Plus size={14} /> Add PON</button>}
            {canEdit && tab === 'otb' && <button onClick={() => openAdd('otb')} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm"><Plus size={14} /> Add OTB</button>}
            {canEdit && tab === 'odc' && <button onClick={() => openAdd('odc')} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm"><Plus size={14} /> Add ODC</button>}
            {canEdit && tab === 'odp' && <button onClick={() => openAdd('odp')} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm"><Plus size={14} /> Add ODP</button>}
            <button onClick={() => window.open(api.ftthExport(), '_blank')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-glass text-tx2 text-xs md:text-sm hover:text-tx1 transition-colors" title="Export CSV"><Download size={13} /> Export</button>
            {canEdit && <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-glass text-tx2 text-xs md:text-sm hover:text-tx1 transition-colors cursor-pointer" title="Import CSV">
              <Upload size={13} /> Import
              <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try { const r = await api.ftthImport(file); toast.success(`Imported: ${JSON.stringify(r.imported)}`); invalidate(); }
                catch (err: any) { toast.error(err.message); }
                e.target.value = '';
              }} />
            </label>}
          </div>
        </div>
      </div>

      {/* Tree View */}
      {tab === 'tree' && (
        <div className="space-y-2">
          {isLoading && <div className="text-center py-8 text-tx3 text-sm">Loading...</div>}
          {!isLoading && tree.length === 0 && (
            <div className="glass-card p-8 text-center">
              <Server size={40} className="mx-auto text-tx3 mb-3" />
              <p className="text-tx3 text-sm mb-3">No OTB/ODF added yet</p>
              {canEdit && <button onClick={() => openAdd('otb')} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus size={16} /> Add First OTB/ODF</button>}
            </div>
          )}
          {tree.map(otb => (
            <OtbNode key={otb.id} otb={otb} expanded={expanded} toggleExpand={toggleExpand} canEdit={canEdit}
              onAddOdc={() => openAdd('odc', otb)} onEditOtb={() => openEdit('otb', otb)}
              onDeleteOtb={() => handleDelete('otb', otb.id, otb.name)}
              onAddOdp={(odc) => openAdd('odp', odc)} onEditOdc={(odc) => openEdit('odc', odc)}
              onDeleteOdc={(odc) => handleDelete('odc', odc.id, odc.name)}
              onEditOdp={(odp) => { setSelectedOdp(odp); }} onDeleteOdp={(odp) => handleDelete('odp', odp.id, odp.name)}
            />
          ))}
        </div>
      )}

      {/* PON List View */}
      {tab === 'pon' && (
        <div className="space-y-2">
          {(ponList?.items || []).length === 0 && (
            <div className="glass-card p-8 text-center"><Cable size={40} className="mx-auto text-tx3 mb-3" /><p className="text-tx3 text-sm mb-3">No PON ports added yet</p>{canEdit && <button onClick={() => openAdd('pon')} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus size={16} /> Add First PON</button>}</div>
          )}
          {(ponList?.items || []).map(p => (
            <div key={p.id} className="glass-card p-3 flex items-center gap-3 hover:bg-glass/50 transition-colors">
              <Cable size={18} className="text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{p.pon_name || `PON ${p.frame}/${p.slot}/${p.port}`}</div>
                <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap">
                  {p.olt_name && <span>• OLT: {p.olt_name}</span>}
                  <span>• Frame {p.frame} / Slot {p.slot} / Port {p.port}</span>
                  {p.otb_name && <span>• → OTB: {p.otb_name} (Core {p.otb_core_number})</span>}
                  {p.description && <span>• {p.description}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {canEdit && <button onClick={() => openEdit('pon', p)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                {canEdit && <button onClick={() => handleDelete('pon', p.id, p.pon_name || 'PON')} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* OTB/ODF List View */}
      {tab === 'otb' && (
        <div className="space-y-2">
          {(otbList?.items || []).length === 0 && (
            <div className="glass-card p-8 text-center"><Server size={40} className="mx-auto text-tx3 mb-3" /><p className="text-tx3 text-sm mb-3">No OTB/ODF added yet</p>{canEdit && <button onClick={() => openAdd('otb')} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus size={16} /> Add First OTB/ODF</button>}</div>
          )}
          {(otbList?.items || []).map(o => (
            <div key={o.id} className="glass-card p-3 flex items-center gap-3 hover:bg-glass/50 transition-colors">
              <Server size={18} className="text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{o.name}</div>
                <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap">
                  <span className="uppercase">{o.type}</span>
                  {o.olt_name && <span>• OLT: {o.olt_name}</span>}
                  {o.pon_port && <span>• PON: {o.pon_port}</span>}
                  <span>• {o.total_cores} cores</span>
                  <span>• {o.odc_count} ODCs</span>
                  {o.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {o.latitude.toFixed(4)}, {o.longitude?.toFixed(4)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {canEdit && <button onClick={() => openEdit('otb', o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                {canEdit && <button onClick={() => handleDelete('otb', o.id, o.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ODC List View */}
      {tab === 'odc' && (
        <div className="space-y-2">
          {(odcList?.items || []).length === 0 && (
            <div className="glass-card p-8 text-center"><Box size={40} className="mx-auto text-tx3 mb-3" /><p className="text-tx3 text-sm mb-3">No ODC added yet</p>{canEdit && <button onClick={() => openAdd('odc')} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus size={16} /> Add First ODC</button>}</div>
          )}
          {(odcList?.items || []).map(o => (
            <div key={o.id} className="glass-card p-3 flex items-center gap-3 hover:bg-glass/50 transition-colors">
              <Box size={18} className="text-warning flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{o.name}</div>
                <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap">
                  {o.otb_name && <span>• From: {o.otb_name} (Core {o.otb_core_number})</span>}
                  {o.splitter_model && <span>• Splitter: {o.splitter_model}</span>}
                  <span>• {o.total_cores} cores</span>
                  <span>• {o.odp_count} ODPs</span>
                  {o.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {o.latitude.toFixed(4)}, {o.longitude?.toFixed(4)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {canEdit && <button onClick={() => openEdit('odc', o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                {canEdit && <button onClick={() => handleDelete('odc', o.id, o.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ODP List View */}
      {tab === 'odp' && (
        <div className="space-y-2">
          {(odpList?.items || []).length === 0 && (
            <div className="glass-card p-8 text-center"><Split size={40} className="mx-auto text-tx3 mb-3" /><p className="text-tx3 text-sm mb-3">No ODP added yet</p>{canEdit && <button onClick={() => openAdd('odp')} className="btn-primary inline-flex items-center gap-1.5 text-sm"><Plus size={16} /> Add First ODP</button>}</div>
          )}
          {(odpList?.items || []).map(o => (
            <div key={o.id} className="glass-card p-3 flex items-center gap-3 hover:bg-glass/50 transition-colors">
              <Split size={18} className="text-success flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{o.name}</div>
                <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap">
                  {o.odc_name && <span>• From: {o.odc_name} (Core {o.odc_core_number})</span>}
                  {o.splitter_model && <span>• Splitter: {o.splitter_model}</span>}
                  <span>• {o.used_ports}/{o.total_ports} ports used</span>
                  {o.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {o.latitude.toFixed(4)}, {o.longitude?.toFixed(4)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {canEdit && <button onClick={() => setSelectedOdp(o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Manage Ports"><Network size={15} /></button>}
                {canEdit && <button onClick={() => openEdit('odp', o)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                {canEdit && <button onClick={() => handleDelete('odp', o.id, o.name)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Map View */}
      {tab === 'map' && <MapView markers={mapData?.markers || []} lines={mapData?.lines || []} />}

      {/* ODP Port Panel */}
      {selectedOdp && (
        <OdpPortPanel
          odp={selectedOdp}
          ports={odpPorts?.ports || []}
          availableOnus={availableOnus?.onus || []}
          onClose={() => setSelectedOdp(null)}
          onUpdated={() => { invalidate(); }}
        />
      )}

      {/* Modals */}
      {modal === 'otb' && <OtbModal item={editItem} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {modal === 'odc' && <OdcModal item={editItem} parent={parentCtx} otbList={otbList?.items || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {modal === 'odp' && <OdpModal item={editItem} parent={parentCtx} odcList={odcList?.items || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
      {modal === 'pon' && <PonModal item={editItem} otbList={otbList?.items || []} onClose={() => setModal(null)} onSaved={() => { invalidate(); setModal(null); }} />}
    </div>
  );
}

// ─── OTB Tree Node ───
function OtbNode({ otb, expanded, toggleExpand, canEdit, onAddOdc, onEditOtb, onDeleteOtb, onAddOdp, onEditOdc, onDeleteOdc, onEditOdp, onDeleteOdp }: {
  otb: FTTHItem; expanded: Record<string, boolean>; toggleExpand: (k: string) => void; canEdit: boolean;
  onAddOdc: () => void; onEditOtb: () => void; onDeleteOtb: () => void;
  onAddOdp: (odc: any) => void; onEditOdc: (odc: any) => void; onDeleteOdc: (odc: any) => void;
  onEditOdp: (odp: any) => void; onDeleteOdp: (odp: any) => void;
}) {
  const key = `otb-${otb.id}`;
  const isOpen = expanded[key] ?? false;
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 hover:bg-glass/50 transition-colors">
        <button onClick={() => toggleExpand(key)} className="p-1 rounded hover:bg-glass">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <Server size={18} className="text-accent" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{otb.name}</div>
          <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap">
            <span className="uppercase">{otb.type}</span>
            {otb.olt_name && <span>• OLT: {otb.olt_name}</span>}
            {otb.pon_port && <span>• PON: {otb.pon_port}</span>}
            <span>• {otb.total_cores} cores</span>
            <span>• {otb.odc_count} ODCs</span>
            {otb.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {otb.latitude.toFixed(4)}, {otb.longitude?.toFixed(4)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canEdit && <button onClick={onAddOdc} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Add ODC"><Plus size={15} /></button>}
          {canEdit && <button onClick={onEditOtb} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
          {canEdit && <button onClick={onDeleteOtb} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
        </div>
      </div>
      {isOpen && (
        <div className="ml-4 md:ml-6 border-l border-brd/50">
          {otb.odcs.length === 0 && <div className="p-3 text-xs text-tx3">No ODCs. Click + to add one.</div>}
          {otb.odcs.map(odc => {
            const odcKey = `odc-${odc.id}`;
            const odcOpen = expanded[odcKey] ?? false;
            return (
              <div key={odc.id}>
                <div className="flex items-center gap-2 p-2.5 hover:bg-glass/50 transition-colors border-t border-brd/30">
                  <button onClick={() => toggleExpand(odcKey)} className="p-1 rounded hover:bg-glass">
                    {odcOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <Box size={16} className="text-warning" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{odc.name}</div>
                    <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap">
                      <span>Core {odc.otb_core_number} from {odc.otb_name}</span>
                      {odc.splitter_model && <span>• Splitter: {odc.splitter_model}</span>}
                      <span>• {odc.odp_count} ODPs</span>
                      {odc.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {odc.latitude.toFixed(4)}, {odc.longitude?.toFixed(4)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && <button onClick={() => onAddOdp(odc)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Add ODP"><Plus size={15} /></button>}
                    {canEdit && <button onClick={() => onEditOdc(odc)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={15} /></button>}
                    {canEdit && <button onClick={() => onDeleteOdc(odc)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
                  </div>
                </div>
                {odcOpen && (
                  <div className="ml-4 md:ml-6 border-l border-brd/50">
                    {odc.odps.length === 0 && <div className="p-2.5 text-xs text-tx3">No ODPs. Click + to add one.</div>}
                    {odc.odps.map(odp => (
                      <div key={odp.id} className="flex items-center gap-2 p-2.5 hover:bg-glass/50 transition-colors border-t border-brd/30">
                        <Split size={16} className="text-success" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{odp.name}</div>
                          <div className="text-xs text-tx3 flex items-center gap-2 flex-wrap">
                            <span>Core {odp.odc_core_number} from {odp.odc_name}</span>
                            {odp.splitter_model && <span>• Splitter: {odp.splitter_model}</span>}
                            <span>• {odp.used_ports}/{odp.total_ports} ports used</span>
                            {odp.latitude && <span className="flex items-center gap-0.5"><MapPin size={10} /> {odp.latitude.toFixed(4)}, {odp.longitude?.toFixed(4)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {canEdit && <button onClick={() => onEditOdp(odp)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Manage Ports"><Network size={15} /></button>}
                          {canEdit && <button onClick={() => onDeleteOdp(odp)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-danger" title="Delete"><Trash2 size={15} /></button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Map View (simple visual, no external map lib) ───
function MapView({ markers, lines }: { markers: any[]; lines: any[] }) {
  if (markers.length === 0) {
    return <div className="glass-card p-8 text-center"><MapIcon size={40} className="mx-auto text-tx3 mb-3" /><p className="text-tx3 text-sm">No coordinates set. Add latitude/longitude to OTB/ODF, ODC, or ODP to see them on map.</p></div>;
  }
  const lats = markers.map(m => m.lat);
  const lngs = markers.map(m => m.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const padLat = (maxLat - minLat) * 0.15 || 0.01;
  const padLng = (maxLng - minLng) * 0.15 || 0.01;
  const rangeLat = (maxLat - minLat) + padLat * 2 || 0.02;
  const rangeLng = (maxLng - minLng) + padLng * 2 || 0.02;
  const W = 800, H = 500;
  const project = (lat: number, lng: number) => ({
    x: ((lng - minLng + padLng) / rangeLng) * W,
    y: H - ((lat - minLat + padLat) / rangeLat) * H,
  });
  const colors: Record<string, string> = { otb: '#3b82f6', odc: '#f59e0b', odp: '#22c55e' };
  const labels: Record<string, string> = { otb: 'OTB/ODF', odc: 'ODC', odp: 'ODP' };
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-4 mb-3">
        {Object.entries(labels).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5 text-xs"><div className="w-3 h-3 rounded-full" style={{ background: colors[k] }} /><span className="text-tx3">{v}</span></div>
        ))}
      </div>
      <div className="relative w-full overflow-x-auto rounded-lg bg-[var(--bg-primary)] border border-brd">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 600 }}>
          {lines.map((l, i) => {
            const from = project(l.from_lat, l.from_lng);
            const to = project(l.to_lat, l.to_lng);
            const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2;
            return <g key={i}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#475569" strokeWidth="1.5" strokeDasharray="4 2" /><text x={midX} y={midY} fill="#64748b" fontSize="9" textAnchor="middle">{l.label}</text></g>;
          })}
          {markers.map((m, i) => {
            const p = project(m.lat, m.lng);
            return <g key={i}><circle cx={p.x} cy={p.y} r="8" fill={colors[m.type]} stroke="white" strokeWidth="1.5" /><title>{m.name}</title><text x={p.x} y={p.y - 12} fill="#e2e8f0" fontSize="10" textAnchor="middle">{m.name}</text></g>;
          })}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
        {markers.map((m, i) => (
          <div key={i} className="p-2 rounded bg-glass text-xs flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colors[m.type] }} />
            <div className="min-w-0"><div className="font-medium truncate">{m.name}</div><div className="text-tx3">{m.lat.toFixed(4)}, {m.lng.toFixed(4)}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ODP Port Panel ───
function OdpPortPanel({ odp, ports, availableOnus, onClose, onUpdated }: {
  odp: FTTHOdp; ports: FTTHOdpPort[]; availableOnus: FTTHAvailableOnu[]; onClose: () => void; onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const [editingPort, setEditingPort] = useState<FTTHOdpPort | null>(null);
  const [showLink, setShowLink] = useState<number | null>(null);

  const saveMut = useMutation({
    mutationFn: (data: Partial<FTTHOdpPort> & { id: number }) => api.ftthOdpPortUpdate(data.id, data),
    onSuccess: () => { toast.success('Port updated'); qc.invalidateQueries({ queryKey: ['ftth-odp-ports', odp.id] }); qc.invalidateQueries({ queryKey: ['ftth-tree'] }); setEditingPort(null); setShowLink(null); onUpdated(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlink = (port: FTTHOdpPort) => {
    saveMut.mutate({ id: port.id, onu_id: null, customer_name: '', customer_phone: '' });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4">
      <div className="glass-card w-full max-w-3xl max-h-[90vh] md:max-h-[85vh] flex flex-col rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-brd flex items-center justify-between sticky top-0 bg-surface z-10 rounded-t-2xl md:rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold flex items-center gap-2 truncate"><Split size={16} /> {odp.name} — Port Management</h2>
            <p className="text-xs text-tx3 mt-0.5 truncate">{odp.splitter_model} • {odp.used_ports}/{odp.total_ports} used • Core {odp.odc_core_number} from {odp.odc_name}</p>
          </div>
          <button onClick={onClose} className="text-tx3 hover:text-tx1 flex-shrink-0"><X size={18} /></button>
        </div>
        <div className="p-3 md:p-4 overflow-y-auto flex-1">
          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead><tr className="border-b border-brd">
              <th className="px-2 py-2 text-left text-xs text-tx3 uppercase">Port</th>
              <th className="px-2 py-2 text-left text-xs text-tx3 uppercase">Status</th>
              <th className="px-2 py-2 text-left text-xs text-tx3 uppercase">Customer</th>
              <th className="px-2 py-2 text-left text-xs text-tx3 uppercase">ONU</th>
              <th className="px-2 py-2 text-right text-xs text-tx3 uppercase">Actions</th>
            </tr></thead>
            <tbody>
              {ports.map(p => (
                <tr key={p.id} className="border-b border-brd/50 hover:bg-glass/30">
                  <td className="px-2 py-2.5 font-medium">Port {p.port_number}</td>
                  <td className="px-2 py-2.5"><span className={cn('px-2 py-0.5 rounded text-xs font-medium', p.status === 'used' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{p.status}</span></td>
                  <td className="px-2 py-2.5">
                    {p.customer_name ? <div><div className="font-medium text-xs">{p.customer_name}</div>{p.customer_phone && <div className="text-tx3 text-xs flex items-center gap-1"><Phone size={10} /> {p.customer_phone}</div>}</div> : <span className="text-tx3 text-xs">—</span>}
                  </td>
                  <td className="px-2 py-2.5">
                    {p.onu_id ? <div><div className="font-medium text-xs">{p.onu_name}</div><div className="text-tx3 text-xs">{p.onu_serial} • {p.onu_id_str}</div></div> : <span className="text-tx3 text-xs">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {p.onu_id ? (
                        <button onClick={() => unlink(p)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-warning" title="Unlink ONU"><Unlink size={14} /></button>
                      ) : (
                        <button onClick={() => setShowLink(p.id)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-accent" title="Link ONU"><Link2 size={14} /></button>
                      )}
                      <button onClick={() => setEditingPort(p)} className="p-1.5 rounded hover:bg-glass text-tx3 hover:text-tx1" title="Edit"><Edit2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-brd/50">
            {ports.map(p => (
              <div key={p.id} className="py-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">Port {p.port_number}</span>
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', p.status === 'used' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>{p.status}</span>
                </div>
                {p.customer_name && (
                  <div className="text-xs">
                    <span className="text-tx3">Customer:</span> <span className="font-medium">{p.customer_name}</span>
                    {p.customer_phone && <span className="text-tx3 flex items-center gap-1 mt-0.5"><Phone size={10} /> {p.customer_phone}</span>}
                  </div>
                )}
                {p.onu_id && (
                  <div className="text-xs">
                    <span className="text-tx3">ONU:</span> <span className="font-medium">{p.onu_name}</span>
                    <div className="text-tx3">{p.onu_serial} • {p.onu_id_str}</div>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  {p.onu_id ? (
                    <button onClick={() => unlink(p)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-glass text-xs text-tx2 hover:text-warning transition-colors"><Unlink size={12} /> Unlink</button>
                  ) : (
                    <button onClick={() => setShowLink(p.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-glass text-xs text-tx2 hover:text-accent transition-colors"><Link2 size={12} /> Link</button>
                  )}
                  <button onClick={() => setEditingPort(p)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-glass text-xs text-tx2 hover:text-tx1 transition-colors ml-auto"><Edit2 size={12} /> Edit</button>
                </div>
              </div>
            ))}
          </div>

          {/* Edit port modal */}
          {editingPort && (
            <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4" onClick={() => setEditingPort(null)}>
              <div className="glass-card w-full max-w-md p-4 md:p-5 space-y-3 rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold">Edit Port {editingPort.port_number}</h3>
                <FormField label="Customer Name"><input className="input-field" defaultValue={editingPort.customer_name} onChange={e => editingPort.customer_name = e.target.value} /></FormField>
                <FormField label="Customer Phone"><input className="input-field" defaultValue={editingPort.customer_phone} onChange={e => editingPort.customer_phone = e.target.value} /></FormField>
                <FormField label="Description"><input className="input-field" defaultValue={editingPort.description} onChange={e => editingPort.description = e.target.value} /></FormField>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setEditingPort(null)} className="btn-cancel text-sm">Cancel</button>
                  <button onClick={() => saveMut.mutate({ id: editingPort.id, customer_name: editingPort.customer_name, customer_phone: editingPort.customer_phone, description: editingPort.description })} className="btn-primary text-sm">Save</button>
                </div>
              </div>
            </div>
          )}

          {/* Link ONU modal */}
          {showLink !== null && (
            <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4" onClick={() => setShowLink(null)}>
              <div className="glass-card w-full max-w-md p-4 md:p-5 space-y-3 rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-semibold">Link ONU to Port</h3>
                {availableOnus.length === 0 ? (
                  <p className="text-tx3 text-sm">No available ONUs. All ONUs are already linked to ODP ports.</p>
                ) : (
                  <select className="input-field" id="onu-select" defaultValue="">
                    <option value="" disabled>Select an ONU...</option>
                    {availableOnus.map(o => <option key={o.id} value={o.id}>{o.name} — {o.serial} ({o.onu_id_str})</option>)}
                  </select>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowLink(null)} className="btn-cancel text-sm">Cancel</button>
                  <button onClick={() => { const sel = document.getElementById('onu-select') as HTMLSelectElement; const val = sel?.value; if (val) saveMut.mutate({ id: showLink, onu_id: parseInt(val) }); }} className="btn-primary text-sm" disabled={availableOnus.length === 0}>Link</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Form Field helper ───
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-tx3 font-medium block mb-1">{label}</label>{children}</div>;
}

// ─── PON Modal ───
function PonModal({ item, otbList, onClose, onSaved }: { item: FTTHPonPort | null; otbList: FTTHOtb[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    olt_name: item?.olt_name || '', frame: item?.frame || 1, slot: item?.slot || 1,
    port: item?.port || 1, pon_name: item?.pon_name || '',
    otb_id: item?.otb_id || '', otb_core_number: item?.otb_core_number || 1,
    description: item?.description || '',
  });
  const mut = useMutation({
    mutationFn: (data: any) => item ? api.ftthPonUpdate(item.id, data) : api.ftthPonCreate(data),
    onSuccess: () => { toast.success(item ? 'Updated' : 'Created'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    const d: any = { ...form };
    d.otb_id = form.otb_id === '' ? null : parseInt(String(form.otb_id));
    d.frame = parseInt(String(form.frame));
    d.slot = parseInt(String(form.slot));
    d.port = parseInt(String(form.port));
    d.otb_core_number = parseInt(String(form.otb_core_number));
    mut.mutate(d);
  };
  return (
    <Modal title={item ? 'Edit PON Port' : 'Add PON Port'} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label="PON Name"><input className="input-field" value={form.pon_name} onChange={e => setForm({ ...form, pon_name: e.target.value })} placeholder="gpon-olt_1/1/1" /></FormField>
      <FormField label="OLT Name"><input className="input-field" value={form.olt_name} onChange={e => setForm({ ...form, olt_name: e.target.value })} placeholder="OLT-01" /></FormField>
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <FormField label="Frame"><input className="input-field" type="number" value={form.frame} onChange={e => setForm({ ...form, frame: parseInt(e.target.value) || 1 })} /></FormField>
        <FormField label="Slot"><input className="input-field" type="number" value={form.slot} onChange={e => setForm({ ...form, slot: parseInt(e.target.value) || 1 })} /></FormField>
        <FormField label="Port"><input className="input-field" type="number" value={form.port} onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 1 })} /></FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="OTB/ODF (connected core)"><select className="input-field" value={form.otb_id} onChange={e => setForm({ ...form, otb_id: e.target.value })}><option value="">— None —</option>{otbList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></FormField>
        <FormField label="Core Number in OTB"><input className="input-field" type="number" value={form.otb_core_number} onChange={e => setForm({ ...form, otb_core_number: parseInt(e.target.value) || 1 })} /></FormField>
      </div>
      <FormField label="Description"><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── OTB Modal ───
function OtbModal({ item, onClose, onSaved }: { item: FTTHOtb | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: item?.name || '', type: item?.type || 'otb', model: item?.model || '',
    location: item?.location || '', latitude: item?.latitude || '', longitude: item?.longitude || '',
    total_cores: item?.total_cores || 12,
    description: item?.description || '',
  });
  const mut = useMutation({
    mutationFn: (data: any) => item ? api.ftthOtbUpdate(item.id, data) : api.ftthOtbCreate(data),
    onSuccess: () => { toast.success(item ? 'Updated' : 'Created'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    const d: any = { ...form };
    d.latitude = form.latitude === '' ? null : parseFloat(String(form.latitude));
    d.longitude = form.longitude === '' ? null : parseFloat(String(form.longitude));
    d.total_cores = parseInt(String(form.total_cores));
    mut.mutate(d);
  };
  return (
    <Modal title={item ? 'Edit OTB/ODF' : 'Add OTB/ODF'} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label="Name"><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="OTB-01" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Type"><select className="input-field" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="otb">OTB</option><option value="odf">ODF</option></select></FormField>
        <FormField label="Model"><input className="input-field" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="e.g. 12 port" /></FormField>
      </div>
      <FormField label="Location"><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Server room, rack 1" /></FormField>
      <FormField label="Coordinates (GPS / Map)">
        <LocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })}
        />
      </FormField>
      <FormField label="Total Cores"><input className="input-field" type="number" value={form.total_cores} onChange={e => setForm({ ...form, total_cores: parseInt(e.target.value) || 0 })} /></FormField>
      <FormField label="Description"><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── ODC Modal ───
function OdcModal({ item, parent, otbList, onClose, onSaved }: { item: FTTHOdc | null; parent: any; otbList: FTTHOtb[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: item?.name || '', model: item?.model || '',
    location: item?.location || '', latitude: item?.latitude || '', longitude: item?.longitude || '',
    otb_id: item?.otb_id || parent?.id || '', otb_core_number: item?.otb_core_number || 1,
    total_cores: item?.total_cores || 8, splitter_model: item?.splitter_model || '',
    description: item?.description || '',
  });
  const mut = useMutation({
    mutationFn: (data: any) => item ? api.ftthOdcUpdate(item.id, data) : api.ftthOdcCreate(data),
    onSuccess: () => { toast.success(item ? 'Updated' : 'Created'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    const d: any = { ...form };
    d.latitude = form.latitude === '' ? null : parseFloat(String(form.latitude));
    d.longitude = form.longitude === '' ? null : parseFloat(String(form.longitude));
    d.otb_id = form.otb_id === '' ? null : parseInt(String(form.otb_id));
    d.otb_core_number = parseInt(String(form.otb_core_number));
    d.total_cores = parseInt(String(form.total_cores));
    mut.mutate(d);
  };
  return (
    <Modal title={item ? 'Edit ODC' : 'Add ODC'} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label="Name"><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ODC-01" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Model"><input className="input-field" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></FormField>
        <FormField label="Splitter Model"><input className="input-field" value={form.splitter_model} onChange={e => setForm({ ...form, splitter_model: e.target.value })} placeholder="1:8, 1:16" /></FormField>
      </div>
      <FormField label="Location"><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Street address or landmark" /></FormField>
      <FormField label="Coordinates (GPS / Map)">
        <LocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })}
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="OTB/ODF"><select className="input-field" value={form.otb_id} onChange={e => setForm({ ...form, otb_id: e.target.value })}><option value="">— None —</option>{otbList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></FormField>
        <FormField label="Core from OTB"><input className="input-field" type="number" value={form.otb_core_number} onChange={e => setForm({ ...form, otb_core_number: parseInt(e.target.value) || 1 })} /></FormField>
        <FormField label="Total Cores"><input className="input-field" type="number" value={form.total_cores} onChange={e => setForm({ ...form, total_cores: parseInt(e.target.value) || 0 })} /></FormField>
      </div>
      <FormField label="Description"><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── ODP Modal ───
function OdpModal({ item, parent, odcList, onClose, onSaved }: { item: FTTHOdp | null; parent: any; odcList: FTTHOdc[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: item?.name || '', model: item?.model || '',
    location: item?.location || '', latitude: item?.latitude || '', longitude: item?.longitude || '',
    odc_id: item?.odc_id || parent?.id || '', odc_core_number: item?.odc_core_number || 1,
    total_ports: item?.total_ports || 8, splitter_model: item?.splitter_model || '',
    description: item?.description || '',
  });
  const mut = useMutation({
    mutationFn: (data: any) => item ? api.ftthOdpUpdate(item.id, data) : api.ftthOdpCreate(data),
    onSuccess: () => { toast.success(item ? 'Updated' : 'Created'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    const d: any = { ...form };
    d.latitude = form.latitude === '' ? null : parseFloat(String(form.latitude));
    d.longitude = form.longitude === '' ? null : parseFloat(String(form.longitude));
    d.odc_id = form.odc_id === '' ? null : parseInt(String(form.odc_id));
    d.odc_core_number = parseInt(String(form.odc_core_number));
    d.total_ports = parseInt(String(form.total_ports));
    mut.mutate(d);
  };
  return (
    <Modal title={item ? 'Edit ODP' : 'Add ODP'} onClose={onClose} onSubmit={submit} loading={mut.isPending}>
      <FormField label="Name"><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ODP-01" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Model"><input className="input-field" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></FormField>
        <FormField label="Splitter Model"><input className="input-field" value={form.splitter_model} onChange={e => setForm({ ...form, splitter_model: e.target.value })} placeholder="1:4, 1:8, 1:16, 1:32" /></FormField>
      </div>
      <FormField label="Location"><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Pole number, address" /></FormField>
      <FormField label="Coordinates (GPS / Map)">
        <LocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })}
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="ODC"><select className="input-field" value={form.odc_id} onChange={e => setForm({ ...form, odc_id: e.target.value })}><option value="">— None —</option>{odcList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></FormField>
        <FormField label="Core from ODC"><input className="input-field" type="number" value={form.odc_core_number} onChange={e => setForm({ ...form, odc_core_number: parseInt(e.target.value) || 1 })} /></FormField>
        <FormField label="Total Ports"><input className="input-field" type="number" value={form.total_ports} onChange={e => setForm({ ...form, total_ports: parseInt(e.target.value) || 0 })} /></FormField>
      </div>
      <FormField label="Description"><textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
    </Modal>
  );
}

// ─── Generic Modal wrapper ───
function Modal({ title, onClose, onSubmit, loading, children }: { title: string; onClose: () => void; onSubmit: () => void; loading: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4">
      <div className="glass-card w-full max-w-lg max-h-[90vh] md:max-h-[85vh] flex flex-col rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-fade-in">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-brd flex items-center justify-between sticky top-0 bg-surface z-10 rounded-t-2xl md:rounded-t-2xl">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={18} /></button>
        </div>
        <div className="p-4 md:p-5 overflow-y-auto flex-1 space-y-3">{children}</div>
        <div className="px-4 md:px-5 py-3 border-t border-brd flex justify-end gap-2 sticky bottom-0 bg-surface rounded-b-2xl md:rounded-b-2xl">
          <button onClick={onClose} className="btn-cancel text-sm">Cancel</button>
          <button onClick={onSubmit} disabled={loading} className="btn-primary text-sm flex items-center gap-1.5">{loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>} Save</button>
        </div>
      </div>
    </div>
  );
}
