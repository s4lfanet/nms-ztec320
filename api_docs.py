"""Flask API endpoint documentation — registered in FastAPI Swagger.

This module adds documentation-only routes to the FastAPI app for ALL
Flask API endpoints. These routes don't proxy to Flask — they exist
solely for Swagger/OpenAPI documentation. The actual implementation
remains in Flask (port 5000).

Usage: Imported and registered in api_async.py.
"""
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

# ---------------------------------------------------------------------------
# Pydantic models for request/response documentation
# ---------------------------------------------------------------------------

class OLTCreate(BaseModel):
    name: str
    ip_address: str
    vendor: str = "ZTE"
    model: str = "C320"
    snmp_community: str = "public"
    snmp_port: int = 161
    telnet_username: str = "zte"
    telnet_password: str = "zte"
    telnet_port: int = 23

class OLTUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    snmp_community: Optional[str] = None
    snmp_port: Optional[int] = None
    telnet_username: Optional[str] = None
    telnet_password: Optional[str] = None

class ONUUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    pppoe_username: Optional[str] = None
    pppoe_password: Optional[str] = None
    technician_id: Optional[int] = None
    odp_port_id: Optional[int] = None

class ONUAction(BaseModel):
    action: str  # reboot, reset, delete, clear-config, disable, enable, restore-factory, restore-wifi

class ONURegister(BaseModel):
    olt_id: int
    frame: int = 1
    slot: int = 1
    port: int
    onu_id: int
    serial_number: str
    onu_type: str = "All"
    vlan: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    template: Optional[str] = None
    technician_id: Optional[int] = None

class UserCreate(BaseModel):
    username: str
    password: str
    role_id: int
    sidebar_name: Optional[str] = None

class VLANRename(BaseModel):
    name: str

class PortToggle(BaseModel):
    enabled: bool

class PortConfig(BaseModel):
    speed: Optional[str] = None
    duplex: Optional[str] = None
    negotiation: Optional[bool] = None
    flowcontrol: Optional[bool] = None
    description: Optional[str] = None

class VLANTrunk(BaseModel):
    vlan_ids: str  # comma-separated
    mode: str = "trunk"

class TCONTAdd(BaseModel):
    name: str
    type_val: int
    max_bandwidth: Optional[str] = None

class TrafficAdd(BaseModel):
    name: str
    sir: Optional[str] = None
    pir: Optional[str] = None

class WANIPAdd(BaseModel):
    name: str
    ip_address: str
    netmask: str
    gateway: str
    dns1: Optional[str] = None
    dns2: Optional[str] = None

class ONUTypeAdd(BaseModel):
    type_name: str
    pon_type: str = "gpon"
    description: Optional[str] = None
    max_tcont: int = 8
    max_gem: int = 32

class ColumnConfig(BaseModel):
    column_name: str
    column_key: str
    visible_desktop: bool = True
    visible_mobile: bool = False

class SignalFilter(BaseModel):
    critical_threshold: float = -28.0
    good_threshold: float = -26.0

class RxColorRange(BaseModel):
    min: float
    max: float
    color: str
    label: str

class FTTHNode(BaseModel):
    name: str
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class TemplateCreate(BaseModel):
    name: str
    vendor: Optional[str] = None
    model: Optional[str] = None
    onu_type: Optional[str] = None
    tcont_profile: Optional[str] = None
    traffic_profile: Optional[str] = None
    vlan: Optional[int] = None

class TR069Create(BaseModel):
    name: str
    acs_url: str
    acs_username: Optional[str] = None
    acs_password: Optional[str] = None
    default_olt_id: Optional[int] = None
    vlan: Optional[int] = None

class AlertRuleCreate(BaseModel):
    rule_type: str
    thresholds: str  # JSON string

class ProvisionUnified(BaseModel):
    olt_id: int
    frame: int = 1
    slot: int = 1
    port: int
    onu_id: int
    serial: str
    onu_type: str
    tcont_profile: str
    services: str  # JSON array of service dicts
    use_veip: Optional[bool] = None
    traffic_profile: Optional[str] = None
    wifi_config: Optional[str] = None  # JSON
    tr069_config: Optional[str] = None  # JSON
    name: Optional[str] = None
    description: Optional[str] = None

class WanServiceEdit(BaseModel):
    mode: str = "Bridge / ONU Webpage"
    vlan: Optional[str] = None
    service_name: Optional[str] = None
    download_profile: Optional[str] = None
    upload_profile: Optional[str] = None
    status: str = "enable"
    pppoe_username: Optional[str] = None
    pppoe_password: Optional[str] = None
    wan_ip_mode: Optional[str] = None
    vlan_profile: Optional[str] = None

class ONUMove(BaseModel):
    new_card: int
    new_pon: int
    new_oid: int

class SystemConfigUpdate(BaseModel):
    alert_check_interval: Optional[int] = None
    maintenance_mode: Optional[bool] = None

class MaintenanceWindow(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: str
    end_time: str

class RoleCreate(BaseModel):
    name: str
    permissions: str  # JSON array

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None

class BotConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    api_url: Optional[str] = None
    api_token: Optional[str] = None
    phone_number: Optional[str] = None


# ---------------------------------------------------------------------------
# Register all Flask API documentation routes
# ---------------------------------------------------------------------------

def register_flask_api_docs(app: FastAPI):
    """Register documentation-only routes for all Flask API endpoints."""

    # ======================================================================
    # AUTH
    # ======================================================================
    @app.post("/api/auth/login", tags=["Auth"], summary="Login",
              description="Authenticate user. Returns user info and session cookie.")
    def auth_login(username: str, password: str):
        """Request body: {username, password}. Returns {user, token} on success."""
        pass

    @app.post("/api/auth/logout", tags=["Auth"], summary="Logout")
    def auth_logout():
        """Logout current user. Clears session."""
        pass

    @app.get("/api/auth/me", tags=["Auth"], summary="Get current user",
             description="Returns current authenticated user info including permissions.")
    def auth_me():
        pass

    # ======================================================================
    # DASHBOARD
    # ======================================================================
    @app.get("/api/dashboard", tags=["Dashboard"], summary="Dashboard data",
             description="Returns OLT list with stats (online/offline ONU counts, temperature, uptime). Cached 15s.")
    def dashboard():
        pass

    # ======================================================================
    # OLT MANAGEMENT
    # ======================================================================
    @app.get("/api/olts", tags=["OLT Management"], summary="List all OLTs")
    def list_olts():
        pass

    @app.post("/api/olt", tags=["OLT Management"], summary="Create OLT",
              description="Create new OLT device. Requires 'settings_ip_olts' permission.")
    def create_olt(body: OLTCreate):
        pass

    @app.get("/api/olt/{olt_id}", tags=["OLT Management"], summary="Get OLT detail")
    def get_olt(olt_id: int):
        pass

    @app.put("/api/olt/{olt_id}", tags=["OLT Management"], summary="Update OLT",
             description="Update OLT configuration. Requires 'settings_ip_olts' permission.")
    def update_olt(olt_id: int, body: OLTUpdate):
        pass

    @app.delete("/api/olt/{olt_id}", tags=["OLT Management"], summary="Delete OLT",
                description="Delete OLT and all related data (ONUs, cards, ports, etc).")
    def delete_olt(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/sync", tags=["OLT Management"], summary="Trigger sync",
              description="Start background SNMP+Telnet sync for the OLT. Progress available via /sync-status or WebSocket.")
    def sync_olt(olt_id: int):
        pass

    @app.post("/api/olt/sync-all", tags=["OLT Management"], summary="Sync all OLTs",
              description="Start background sync for all OLTs sequentially.")
    def sync_all():
        pass

    @app.get("/api/olt/{olt_id}/sync-status", tags=["OLT Management"], summary="Get sync progress",
             description="Poll sync progress. Returns {progress: 0-100, status, message}.")
    def sync_status(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/test-connection", tags=["OLT Management"], summary="Test connection",
              description="Test SNMP and Telnet connectivity to the OLT.")
    def test_connection(olt_id: int):
        pass

    @app.post("/api/olt/test-connection", tags=["OLT Management"], summary="Test connection (body-based)",
              description="Test SNMP/Telnet connectivity using OLT config from request body.")
    def test_connection_body():
        pass

    @app.post("/api/olt/{olt_id}/discover-slots", tags=["OLT Management"], summary="Discover slots",
              description="Real-time slot discovery via CLI 'show card' — no full sync needed.")
    def discover_slots(olt_id: int):
        pass

    @app.get("/api/olt/{olt_id}/chassis", tags=["OLT Management"], summary="Get chassis info",
             description="Returns chassis details: slots, cards, fan, PSU, temperature.")
    def get_chassis(olt_id: int):
        pass

    @app.get("/api/olt/{olt_id}/rack", tags=["OLT Management"], summary="Get rack diagram data",
             description="Returns normalized rack data for vendor-specific rack diagram rendering.")
    def get_rack(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/write-config", tags=["OLT Management"], summary="Save OLT config",
              description="Save OLT running-config to startup-config (write command). Requires 'settings_ip_olts'.")
    def olt_write_config(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/backup-config", tags=["OLT Management"], summary="Backup OLT config",
              description="Backup OLT running configuration via Telnet. Requires 'settings_ip_olts'.")
    def backup_config(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/refresh-signal", tags=["OLT Management"], summary="Refresh ONU signals",
              description="Fast SNMP-only refresh of RX/TX power and status for all ONUs on this OLT.")
    def refresh_signal(olt_id: int):
        pass

    @app.get("/api/olt/{olt_id}/pon-structure", tags=["OLT Management"], summary="Get PON structure",
             description="Return card/PON structure for Move ONU modal dropdowns.")
    def pon_structure(olt_id: int):
        pass

    # ======================================================================
    # ONU MANAGEMENT
    # ======================================================================
    @app.get("/api/all-onus", tags=["ONU Management"], summary="List all ONUs (paginated)",
             description="Server-side paginated ONU list with search and sort. Query params: olt, status, search, page, page_size, sort_by, sort_dir.")
    def list_all_onus():
        pass

    @app.get("/api/onu/{onu_id}", tags=["ONU Management"], summary="Get ONU detail")
    def get_onu(onu_id: int):
        pass

    @app.get("/api/onu/{onu_id}/detail", tags=["ONU Management"], summary="ONU detail (DB only)",
             description="Instant ONU detail from database (no Telnet). Fast response.")
    def onu_detail(onu_id: int):
        pass

    @app.get("/api/onu/{onu_id}/live-detail", tags=["ONU Management"], summary="ONU live detail (Telnet)",
             description="Live ONU data from OLT via Telnet. Slow (~10-15s). Includes optical power, TR069, VEIP, ACL.")
    def onu_live_detail(onu_id: int):
        pass

    @app.get("/api/onu/{onu_id}/live-info", tags=["ONU Management"], summary="ONU live info (Telnet)",
             description="Fetch live ONU data from OLT: detail-info, remote-onu equip, running-config.")
    def onu_live_info(onu_id: int):
        pass

    @app.get("/api/onu/{onu_id}/history", tags=["ONU Management"], summary="ONU event history")
    def onu_history(onu_id: int):
        pass

    @app.get("/api/onu/{onu_id}/traffic", tags=["ONU Management"], summary="ONU live traffic",
             description="Live traffic stats (3s polling). Returns downstream/upstream Kbps.")
    def onu_traffic(onu_id: int):
        pass

    @app.get("/api/onu/{onu_id}/running-config", tags=["ONU Management"], summary="ONU running config")
    def onu_running_config(onu_id: int):
        pass

    @app.post("/api/onu/{onu_id}/update", tags=["ONU Management"], summary="Update ONU",
              description="Update ONU name, description, PPPoE, technician, ODP port. Per-field permissions.")
    def update_onu(onu_id: int, body: ONUUpdate):
        pass

    @app.post("/api/onu/{onu_id}/update-field", tags=["ONU Management"], summary="Update single ONU field",
              description="Update a single ONU field with confirmation message. Inline editing support.")
    def update_onu_field(onu_id: int):
        pass

    @app.post("/api/onu/{onu_id}/action", tags=["ONU Management"], summary="ONU action",
              description="Execute ONU action: reboot, reset, delete, clear-config, disable, enable, restore-factory, restore-wifi.")
    def onu_action(onu_id: int, body: ONUAction):
        pass

    @app.post("/api/onu/{onu_id}/delete", tags=["ONU Management"], summary="Delete ONU",
              description="Deregister ONU from OLT and delete from DB. Requires 'delete_onu' permission.")
    def onu_delete(onu_id: int):
        pass

    @app.post("/api/onu/{onu_id}/get-status", tags=["ONU Management"], summary="Full Get Status",
              description="Collect full ONU status: interface info, optical power, history, MAC addresses.")
    def onu_get_status(onu_id: int):
        pass

    @app.post("/api/onu/{onu_id}/refresh-status", tags=["ONU Management"], summary="Refresh ONU status",
              description="Re-fetch ONU status from OLT and update DB.")
    def onu_refresh_status(onu_id: int):
        pass

    @app.post("/api/onu/{onu_id}/resync-config", tags=["ONU Management"], summary="Re-collect ONU config",
              description="Re-collect ONU configuration from OLT via Telnet.")
    def onu_resync(onu_id: int):
        pass

    @app.post("/api/onu/{onu_id}/save-config", tags=["ONU Management"], summary="Save ONU config to OLT",
              description="Push ONU configuration changes to OLT via Telnet CLI.")
    def onu_save_config(onu_id: int):
        pass

    @app.post("/api/onu/{onu_id}/migrate", tags=["ONU Management"], summary="Migrate ONU",
              description="Migrate single ONU to different PON port: deregister old, register new, update DB.")
    def onu_migrate(onu_id: int):
        pass

    @app.post("/api/onu/{onu_id}/move", tags=["ONU Management"], summary="Move ONU (DB only)",
              description="Move ONU to different card/PON/ID in DB only. Sync will reconcile with OLT.")
    def onu_move(onu_id: int, body: ONUMove):
        pass

    @app.post("/api/olt/{olt_id}/migrate-batch", tags=["ONU Management"], summary="Batch migrate ONUs",
              description="Migrate multiple ONUs to same PON port.")
    def onu_migrate_batch(olt_id: int):
        pass

    @app.post("/api/onu/{onu_id}/section-config", tags=["ONU Management"], summary="Update ONU section config",
              description="Update specific ONU config section (interface or pon-onu-mng) via Telnet.")
    def onu_section_config(onu_id: int):
        pass

    @app.post("/api/onu/{onu_id}/wan-service/{svc_idx}", tags=["ONU Management"], summary="Edit WAN service",
              description="Edit WAN service via Telnet. Modes: Bridge, PPPoE NAT, Wan-IP. Safe-replace with 63869 error handling.")
    def onu_wan_service_edit(onu_id: int, svc_idx: int, body: WanServiceEdit):
        pass

    @app.get("/api/onu/lookup/{olt_id}/{frame}/{port}/{onu_num}", tags=["ONU Management"], summary="Lookup ONU by R-Config path",
             description="Look up ONU DB id by R-Config URL path components.")
    def onu_lookup(olt_id: int, frame: int, port: int, onu_num: int):
        pass

    # ======================================================================
    # ONU REGISTRATION & PROVISIONING
    # ======================================================================
    @app.get("/api/olt/{olt_id}/unregistered-onus", tags=["ONU Registration"], summary="Scan unregistered ONUs",
             description="Discover unconfigured ONUs from OLT via Telnet (show pon onu uncfg).")
    def scan_unregistered(olt_id: int):
        pass

    @app.post("/api/scan-unconfigured", tags=["ONU Registration"], summary="Scan unconfigured ONUs (body-based)",
              description="Scan for unconfigured ONUs on specified OLT.")
    def scan_unconfigured():
        pass

    @app.get("/api/unregistered-count", tags=["ONU Registration"], summary="Count unregistered ONUs",
             description="Returns total count of unregistered ONUs across all OLTs for badge display.")
    def unregistered_count():
        pass

    @app.get("/api/olt/{olt_id}/next-onu-id", tags=["ONU Registration"], summary="Get next available ONU ID")
    def next_onu_id(olt_id: int):
        pass

    @app.post("/api/pre-register", tags=["ONU Registration"], summary="Register new ONU (template-based)",
              description="Pre-register ONU on ZTE OLT with template-based provisioning. Supports ZTE/Huawei/Fiberhome ONU templates.")
    def pre_register(body: ONURegister):
        pass

    @app.post("/api/provision/unified", tags=["ONU Registration"], summary="Unified ONU provisioning",
              description="Unified ONU registration with multi-service support. Works for all vendors. Safe-replace mode prevents error 63869.")
    def provision_unified(body: ProvisionUnified):
        pass

    @app.post("/api/provision/ont", tags=["ONU Registration"], summary="Provision ONT (legacy)",
              description="Legacy ONT provisioning endpoint. Use /api/provision/unified for new implementations.")
    def provision_ont():
        pass

    @app.get("/api/provision/vendors", tags=["ONU Registration"], summary="List supported vendors",
             description="Returns list of vendors supported by the adapter registry.")
    def provision_vendors():
        pass

    @app.get("/api/provision/status/{olt_id}/{frame}/{slot}/{port}/{onu_id}", tags=["ONU Registration"], summary="Check provision status",
             description="Check provisioning status of a specific ONU after registration.")
    def provision_status(olt_id: int, frame: int, slot: int, port: int, onu_id: int):
        pass

    # ======================================================================
    # UPLINK PORT MANAGEMENT
    # ======================================================================
    @app.get("/api/olt/{olt_id}/uplinks", tags=["Uplink Ports"], summary="List uplink ports")
    def list_uplinks(olt_id: int):
        pass

    @app.get("/api/olt/{olt_id}/uplinks/live-traffic", tags=["Uplink Ports"], summary="Live uplink traffic",
             description="Real-time traffic rates for all uplink ports via SNMP double-read. Cached 10s.")
    def uplinks_live_traffic(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/uplink/{uplink_id}/toggle", tags=["Uplink Ports"], summary="Enable/Disable uplink")
    def toggle_uplink(olt_id: int, uplink_id: int):
        pass

    @app.post("/api/olt/{olt_id}/uplink/{uplink_id}/configure", tags=["Uplink Ports"], summary="Configure uplink",
              description="Edit speed, duplex, negotiation, flowcontrol, description.")
    def configure_uplink(olt_id: int, uplink_id: int, body: PortConfig):
        pass

    @app.post("/api/olt/{olt_id}/uplink/{uplink_id}/description", tags=["Uplink Ports"], summary="Set uplink description")
    def uplink_description(olt_id: int, uplink_id: int):
        pass

    @app.post("/api/olt/{olt_id}/uplink/{uplink_id}/vlan", tags=["Uplink Ports"], summary="Set VLAN trunk",
              description="Set VLAN trunk on uplink port (comma-separated VLAN IDs).")
    def uplink_vlan(olt_id: int, uplink_id: int, body: VLANTrunk):
        pass

    @app.post("/api/olt/{olt_id}/uplink/{uplink_id}/vlan/remove", tags=["Uplink Ports"], summary="Remove VLANs from uplink")
    def uplink_vlan_remove(olt_id: int, uplink_id: int):
        pass

    @app.post("/api/olt/{olt_id}/uplink/{uplink_id}/ip", tags=["Uplink Ports"], summary="Set uplink IP (VLAN SVI)",
              description="Set/remove IP on VLAN interface tagged to uplink port. ZTE uses VLAN SVI, not direct IP on physical port.")
    def uplink_ip(olt_id: int, uplink_id: int):
        pass

    @app.post("/api/olt/{olt_id}/uplink/refresh", tags=["Uplink Ports"], summary="Refresh uplink data",
              description="Re-collect uplink port data from OLT via Telnet.")
    def uplink_refresh(olt_id: int):
        pass

    # ======================================================================
    # PON PORT MANAGEMENT
    # ======================================================================
    @app.get("/api/olt/{olt_id}/pon-ports", tags=["PON Ports"], summary="List PON ports")
    def list_pon_ports(olt_id: int):
        pass

    @app.get("/api/olt/{olt_id}/pon-stats/{slot}", tags=["PON Ports"], summary="Per-port ONU stats",
             description="ONU count, online/offline per PON port in a slot.")
    def pon_stats(olt_id: int, slot: int):
        pass

    @app.get("/api/olt/{olt_id}/pon-port/{port_id}/onus", tags=["PON Ports"], summary="List ONUs on PON port")
    def pon_port_onus(olt_id: int, port_id: int):
        pass

    @app.get("/api/olt/{olt_id}/pon-port/{port_id}/optical", tags=["PON Ports"], summary="PON port optical info",
             description="Returns optical power levels and TX/RX stats for a PON port.")
    def pon_port_optical(olt_id: int, port_id: int):
        pass

    @app.post("/api/olt/{olt_id}/pon-port/{port_id}/toggle", tags=["PON Ports"], summary="Enable/Disable PON port")
    def toggle_pon(olt_id: int, port_id: int):
        pass

    @app.post("/api/olt/{olt_id}/pon-port/{port_id}/edit", tags=["PON Ports"], summary="Edit PON port name/desc")
    def edit_pon(olt_id: int, port_id: int):
        pass

    # ======================================================================
    # VLAN MANAGEMENT
    # ======================================================================
    @app.get("/api/olt/{olt_id}/vlans", tags=["VLANs"], summary="List VLANs (from OLT)")
    def list_vlans(olt_id: int):
        pass

    @app.get("/api/olt/{olt_id}/vlans/db", tags=["VLANs"], summary="List VLANs (from DB)",
             description="Fast VLAN list from database without polling OLT.")
    def list_vlans_db(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/vlan/create", tags=["VLANs"], summary="Create VLAN")
    def create_vlan(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/vlan/{vlan_id}/rename", tags=["VLANs"], summary="Rename VLAN")
    def rename_vlan(olt_id: int, vlan_id: int, body: VLANRename):
        pass

    @app.post("/api/olt/{olt_id}/vlan/{vlan_id}/delete", tags=["VLANs"], summary="Delete VLAN")
    def delete_vlan(olt_id: int, vlan_id: int):
        pass

    # ======================================================================
    # ONU TYPE MANAGEMENT
    # ======================================================================
    @app.get("/api/onu-types", tags=["ONU Types"], summary="List all ONU types")
    def list_onu_types():
        pass

    @app.get("/api/olt/{olt_id}/onu-types", tags=["ONU Types"], summary="List ONU types for OLT",
             description="Get ONU types — try Telnet first, fallback to DB.")
    def olt_onu_types(olt_id: int):
        pass

    @app.get("/api/olt/{olt_id}/onu-types-full", tags=["ONU Types"], summary="Full ONU types from DB",
             description="Get full ONU types from DB with all fields for SPA config page.")
    def olt_onu_types_full(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/onu-type/add", tags=["ONU Types"], summary="Add ONU type",
              description="Create new ONU type with max TCONT/GEM/switch/iphost/veip limits.")
    def add_onu_type(olt_id: int, body: ONUTypeAdd):
        pass

    @app.post("/api/olt/{olt_id}/onu-type/{type_id}/delete", tags=["ONU Types"], summary="Delete ONU type")
    def delete_onu_type(olt_id: int, type_id: int):
        pass

    # ======================================================================
    # SPEED PROFILES (TCONT / Traffic)
    # ======================================================================
    @app.get("/api/olt/{olt_id}/speed-profiles", tags=["Speed Profiles"], summary="List speed profiles")
    def list_speed_profiles(olt_id: int):
        pass

    @app.get("/api/olt/{olt_id}/speed-profiles-full", tags=["Speed Profiles"], summary="Full speed profiles from DB",
             description="Get all TCONT and Traffic profiles from DB with full fields.")
    def speed_profiles_full(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/tcont/add", tags=["Speed Profiles"], summary="Add TCONT profile")
    def add_tcont(olt_id: int, body: TCONTAdd):
        pass

    @app.post("/api/olt/{olt_id}/tcont/{profile_id}/delete", tags=["Speed Profiles"], summary="Delete TCONT")
    def delete_tcont(olt_id: int, profile_id: int):
        pass

    @app.post("/api/olt/{olt_id}/traffic/add", tags=["Speed Profiles"], summary="Add Traffic profile")
    def add_traffic(olt_id: int, body: TrafficAdd):
        pass

    @app.post("/api/olt/{olt_id}/traffic/{profile_id}/delete", tags=["Speed Profiles"], summary="Delete Traffic profile")
    def delete_traffic(olt_id: int, profile_id: int):
        pass

    # ======================================================================
    # WAN IP PROFILES
    # ======================================================================
    @app.get("/api/olt/{olt_id}/wan-ip-profiles", tags=["WAN IP Profiles"], summary="List WAN IP profiles")
    def list_wan_ip_profiles(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/wan-ip/add", tags=["WAN IP Profiles"], summary="Add WAN IP profile")
    def add_wan_ip(olt_id: int, body: WANIPAdd):
        pass

    @app.post("/api/olt/{olt_id}/wan-ip/{profile_id}/delete", tags=["WAN IP Profiles"], summary="Delete WAN IP profile")
    def delete_wan_ip(olt_id: int, profile_id: int):
        pass

    # ======================================================================
    # TRAFFIC MONITORING
    # ======================================================================
    @app.get("/api/traffic/grid", tags=["Traffic"], summary="Traffic grid (live/history)",
             description="Returns traffic data for grid display. period=live uses SNMP double-read with 10s cache. Other periods use DB traffic_logs. Fallback to last DB values if OLT unreachable.")
    def traffic_grid():
        pass

    @app.get("/api/traffic/live", tags=["Traffic"], summary="Live single-port traffic",
             description="Real-time single-port traffic rate via SNMP double-read. Cached 5s. Fallback to last DB value if OLT unreachable.")
    def traffic_live():
        pass

    @app.get("/api/traffic/history", tags=["Traffic"], summary="Traffic history chart",
             description="Historical traffic data for chart display. Periods: 1h, 6h, 1d, 7d, 30d.")
    def traffic_history():
        pass

    @app.get("/api/traffic/meta", tags=["Traffic"], summary="Traffic metadata",
             description="Returns available periods, port lists, and traffic stats metadata.")
    def traffic_meta():
        pass

    # ======================================================================
    # UPTIME MONITORING
    # ======================================================================
    @app.get("/api/uptime/olt/{olt_id}", tags=["Uptime"], summary="OLT uptime history")
    def olt_uptime(olt_id: int):
        pass

    @app.get("/api/uptime/onu/{onu_id}", tags=["Uptime"], summary="ONU uptime history")
    def onu_uptime(onu_id: int):
        pass

    # ======================================================================
    # FTTH INFRASTRUCTURE
    # ======================================================================
    @app.get("/api/ftth/tree", tags=["FTTH Infrastructure"], summary="Get FTTH tree",
             description="Returns OTB → ODC → ODP → Port hierarchy.")
    def ftth_tree():
        pass

    @app.get("/api/ftth/map", tags=["FTTH Infrastructure"], summary="FTTH map data",
             description="Returns all FTTH nodes with coordinates for map rendering.")
    def ftth_map():
        pass

    @app.get("/api/ftth/available-onus", tags=["FTTH Infrastructure"], summary="Available ONUs for ODP assignment",
             description="List ONUs not yet assigned to ODP ports.")
    def ftth_available_onus():
        pass

    @app.get("/api/ftth/export", tags=["FTTH Infrastructure"], summary="Export FTTH data",
             description="Export FTTH tree as CSV/JSON for external use.")
    def ftth_export():
        pass

    @app.post("/api/ftth/import", tags=["FTTH Infrastructure"], summary="Import FTTH data",
              description="Bulk import FTTH nodes from CSV/JSON.")
    def ftth_import():
        pass

    @app.get("/api/ftth/otb", tags=["FTTH Infrastructure"], summary="List OTBs")
    def list_otb():
        pass

    @app.post("/api/ftth/otb", tags=["FTTH Infrastructure"], summary="Create OTB")
    def create_otb(body: FTTHNode):
        pass

    @app.post("/api/ftth/odc", tags=["FTTH Infrastructure"], summary="Create ODC")
    def create_odc(body: FTTHNode):
        pass

    @app.get("/api/ftth/odc", tags=["FTTH Infrastructure"], summary="List ODCs")
    def list_odc():
        pass

    @app.post("/api/ftth/odp", tags=["FTTH Infrastructure"], summary="Create ODP")
    def create_odp(body: FTTHNode):
        pass

    @app.get("/api/ftth/odp", tags=["FTTH Infrastructure"], summary="List ODPs")
    def list_odp():
        pass

    @app.get("/api/ftth/odp/{odp_id}/ports", tags=["FTTH Infrastructure"], summary="List ODP ports")
    def list_odp_ports(odp_id: int):
        pass

    @app.post("/api/ftth/odp-port", tags=["FTTH Infrastructure"], summary="Create ODP port")
    def create_odp_port():
        pass

    @app.put("/api/ftth/odp-port/{port_id}", tags=["FTTH Infrastructure"], summary="Update ODP port")
    def update_odp_port(port_id: int):
        pass

    @app.delete("/api/ftth/odp-port/{port_id}", tags=["FTTH Infrastructure"], summary="Delete ODP port")
    def delete_odp_port(port_id: int):
        pass

    @app.get("/api/ftth/pon", tags=["FTTH Infrastructure"], summary="List PON connections")
    def list_ftth_pon():
        pass

    @app.post("/api/ftth/pon", tags=["FTTH Infrastructure"], summary="Create PON connection")
    def create_ftth_pon():
        pass

    @app.put("/api/ftth/pon/{pon_id}", tags=["FTTH Infrastructure"], summary="Update PON connection")
    def update_ftth_pon(pon_id: int):
        pass

    @app.delete("/api/ftth/pon/{pon_id}", tags=["FTTH Infrastructure"], summary="Delete PON connection")
    def delete_ftth_pon(pon_id: int):
        pass

    @app.put("/api/ftth/otb/{id}", tags=["FTTH Infrastructure"], summary="Update OTB")
    def update_otb(id: int):
        pass

    @app.put("/api/ftth/odc/{id}", tags=["FTTH Infrastructure"], summary="Update ODC")
    def update_odc(id: int):
        pass

    @app.put("/api/ftth/odp/{id}", tags=["FTTH Infrastructure"], summary="Update ODP")
    def update_odp(id: int):
        pass

    @app.delete("/api/ftth/otb/{id}", tags=["FTTH Infrastructure"], summary="Delete OTB")
    def delete_otb(id: int):
        pass

    @app.delete("/api/ftth/odc/{id}", tags=["FTTH Infrastructure"], summary="Delete ODC")
    def delete_odc(id: int):
        pass

    @app.delete("/api/ftth/odp/{id}", tags=["FTTH Infrastructure"], summary="Delete ODP")
    def delete_odp(id: int):
        pass

    # ======================================================================
    # TEMPLATES
    # ======================================================================
    @app.get("/api/templates", tags=["Templates"], summary="List templates")
    def list_templates():
        pass

    @app.post("/api/template", tags=["Templates"], summary="Create template")
    def create_template(body: TemplateCreate):
        pass

    @app.put("/api/template/{id}", tags=["Templates"], summary="Update template")
    def update_template(id: int):
        pass

    @app.delete("/api/template/{id}", tags=["Templates"], summary="Delete template")
    def delete_template(id: int):
        pass

    # ======================================================================
    # TR069 PROFILES
    # ======================================================================
    @app.get("/api/tr069", tags=["TR069"], summary="List TR069 profiles")
    def list_tr069():
        pass

    @app.post("/api/tr069", tags=["TR069"], summary="Create TR069 profile")
    def create_tr069(body: TR069Create):
        pass

    @app.put("/api/tr069/{pid}", tags=["TR069"], summary="Update TR069 profile")
    def update_tr069(pid: int):
        pass

    @app.delete("/api/tr069/{pid}", tags=["TR069"], summary="Delete TR069 profile")
    def delete_tr069(pid: int):
        pass

    # ======================================================================
    # USER MANAGEMENT
    # ======================================================================
    @app.get("/api/users", tags=["Users"], summary="List users",
             description="Requires 'manage_users' permission.")
    def list_users():
        pass

    @app.post("/api/user", tags=["Users"], summary="Create user")
    def create_user(body: UserCreate):
        pass

    @app.get("/api/user/{uid}", tags=["Users"], summary="Get user detail")
    def get_user(uid: int):
        pass

    @app.put("/api/user/{uid}", tags=["Users"], summary="Update user")
    def update_user(uid: int):
        pass

    @app.delete("/api/user/{uid}", tags=["Users"], summary="Delete user")
    def delete_user(uid: int):
        pass

    @app.get("/api/technicians", tags=["Users"], summary="List technicians",
             description="List users with technician role for assignment dropdowns.")
    def list_technicians():
        pass

    @app.get("/api/permissions", tags=["Users"], summary="List all permissions",
             description="Returns all available system permissions for role assignment.")
    def list_permissions():
        pass

    @app.post("/api/role", tags=["Users"], summary="Create role")
    def create_role(body: RoleCreate):
        pass

    @app.put("/api/role/{rid}", tags=["Users"], summary="Update role")
    def update_role(rid: int):
        pass

    @app.delete("/api/role/{rid}", tags=["Users"], summary="Delete role")
    def delete_role(rid: int):
        pass

    @app.post("/api/profile", tags=["Users"], summary="Update own profile",
              description="Update current user's own profile (name, email, phone, password).")
    def update_profile(body: ProfileUpdate):
        pass

    # ======================================================================
    # CUSTOMIZATION
    # ======================================================================
    @app.get("/api/customization/columns", tags=["Customization"], summary="Get column config")
    def get_columns():
        pass

    @app.post("/api/customization/columns", tags=["Customization"], summary="Save column config")
    def save_columns():
        pass

    @app.get("/api/customization/signal-filter", tags=["Customization"], summary="Get signal filter thresholds")
    def get_signal_filter():
        pass

    @app.post("/api/customization/signal-filter", tags=["Customization"], summary="Save signal filter thresholds")
    def save_signal_filter(body: SignalFilter):
        pass

    @app.get("/api/customization/rx-colors", tags=["Customization"], summary="Get RX power color ranges")
    def get_rx_colors():
        pass

    @app.post("/api/customization/rx-colors", tags=["Customization"], summary="Save RX power color ranges")
    def save_rx_colors():
        pass

    @app.post("/api/customization/reset", tags=["Customization"], summary="Reset customization to defaults")
    def reset_customization():
        pass

    # ======================================================================
    # NOTIFICATIONS
    # ======================================================================
    @app.get("/api/notifications", tags=["Notifications"], summary="List notifications")
    def list_notifications():
        pass

    @app.post("/api/notifications/{notif_id}/read", tags=["Notifications"], summary="Mark notification as read")
    def read_notification(notif_id: int):
        pass

    @app.post("/api/notifications/{notif_id}/acknowledge", tags=["Notifications"], summary="Acknowledge notification")
    def acknowledge_notification(notif_id: int):
        pass

    @app.delete("/api/notifications/{notif_id}", tags=["Notifications"], summary="Delete notification")
    def delete_notification(notif_id: int):
        pass

    @app.post("/api/notifications/read-all", tags=["Notifications"], summary="Mark all as read")
    def read_all():
        pass

    @app.post("/api/notifications/acknowledge-all", tags=["Notifications"], summary="Acknowledge all")
    def acknowledge_all():
        pass

    @app.post("/api/notifications/clear", tags=["Notifications"], summary="Clear read notifications")
    def clear_read():
        pass

    # ======================================================================
    # ACTION LOGS
    # ======================================================================
    @app.get("/api/action-logs", tags=["Action Logs"], summary="List action logs",
             description="Audit trail of all user actions. Requires 'manage_users' permission.")
    def list_action_logs():
        pass

    # ======================================================================
    # ALERTS
    # ======================================================================
    @app.get("/api/alert-rules", tags=["Alerts"], summary="List alert rules")
    def list_alert_rules():
        pass

    @app.post("/api/alert-rule", tags=["Alerts"], summary="Create alert rule")
    def create_alert_rule(body: AlertRuleCreate):
        pass

    @app.delete("/api/alert-rule/{id}", tags=["Alerts"], summary="Delete alert rule")
    def delete_alert_rule(id: int):
        pass

    # ======================================================================
    # SYSTEM CONFIG
    # ======================================================================
    @app.get("/api/system-config", tags=["System Config"], summary="Get system config",
             description="Returns system-wide configuration: alert_check_interval, maintenance_mode, etc.")
    def get_system_config():
        pass

    @app.put("/api/system-config", tags=["System Config"], summary="Update system config",
             description="Update system-wide configuration. Super admin only.")
    def update_system_config(body: SystemConfigUpdate):
        pass

    # ======================================================================
    # MAINTENANCE WINDOWS
    # ======================================================================
    @app.get("/api/maintenance", tags=["Maintenance"], summary="List maintenance windows")
    def list_maintenance():
        pass

    @app.post("/api/maintenance", tags=["Maintenance"], summary="Create maintenance window",
              description="Schedule maintenance window to suppress alerts during planned downtime.")
    def create_maintenance(body: MaintenanceWindow):
        pass

    @app.delete("/api/maintenance/{window_id}", tags=["Maintenance"], summary="Delete maintenance window")
    def delete_maintenance(window_id: int):
        pass

    # ======================================================================
    # METRICS
    # ======================================================================
    @app.get("/api/metrics/history", tags=["Metrics"], summary="Metrics history",
             description="Historical system metrics: CPU, RAM, OLT response times, ONU counts over time.")
    def metrics_history():
        pass

    # ======================================================================
    # PUBLIC ENDPOINTS (no auth)
    # ======================================================================
    @app.get("/api/public/branding", tags=["Public"], summary="Get NMS branding",
             description="Returns NMS name, base_url, base_domain. No auth required.")
    def branding():
        pass

    # ======================================================================
    # WHATSAPP BOT CONFIG
    # ======================================================================
    @app.get("/api/bot-config/whatsapp-native/status", tags=["WhatsApp Bot"], summary="Get WA bot status")
    def wa_bot_status():
        pass

    @app.post("/api/bot-config/whatsapp-native/start", tags=["WhatsApp Bot"], summary="Start WA bot")
    def wa_bot_start():
        pass

    @app.post("/api/bot-config/whatsapp-native/stop", tags=["WhatsApp Bot"], summary="Stop WA bot")
    def wa_bot_stop():
        pass

    @app.post("/api/bot-config/whatsapp-native/test", tags=["WhatsApp Bot"], summary="Test WA bot")
    def wa_bot_test():
        pass
