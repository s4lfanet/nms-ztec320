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

class TenantCreate(BaseModel):
    name: str
    subdomain: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None

class PackageCreate(BaseModel):
    name: str
    max_olts: int
    price: float
    billing_cycle: str = "monthly"
    features: Optional[str] = None

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


# ---------------------------------------------------------------------------
# Register all Flask API documentation routes
# ---------------------------------------------------------------------------

def register_flask_api_docs(app: FastAPI):
    """Register documentation-only routes for all Flask API endpoints."""

    # ======================================================================
    # AUTH
    # ======================================================================
    @app.post("/api/auth/login", tags=["Auth"], summary="Login",
              description="Authenticate user. Domain-checked: superadmin on main domain, tenant on subdomain.")
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
             description="Returns OLT list with stats (online/offline ONU counts, temperature, uptime).")
    def dashboard():
        pass

    @app.get("/api/dashboard/live-traffic", tags=["Dashboard"], summary="Live uplink traffic",
             description="Returns real-time uplink traffic rates for all OLTs.")
    def dashboard_live_traffic():
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

    @app.get("/api/olt/{olt_id}/sync-status", tags=["OLT Management"], summary="Get sync progress",
             description="Poll sync progress. Returns {progress: 0-100, status, message}.")
    def sync_status(olt_id: int):
        pass

    @app.post("/api/olt/{olt_id}/test-connection", tags=["OLT Management"], summary="Test connection",
              description="Test SNMP and Telnet connectivity to the OLT.")
    def test_connection(olt_id: int):
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

    @app.post("/api/onu/{onu_id}/action", tags=["ONU Management"], summary="ONU action",
              description="Execute ONU action: reboot, reset, delete, clear-config, disable, enable, restore-factory, restore-wifi.")
    def onu_action(onu_id: int, body: ONUAction):
        pass

    @app.post("/api/onu/{onu_id}/get-status", tags=["ONU Management"], summary="Full Get Status",
              description="Collect full ONU status: interface info, optical power, history, MAC addresses.")
    def onu_get_status(onu_id: int):
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
              description="Migrate single ONU to different PON port.")
    def onu_migrate(onu_id: int):
        pass

    @app.post("/api/olt/{olt_id}/migrate-batch", tags=["ONU Management"], summary="Batch migrate ONUs",
              description="Migrate multiple ONUs to same PON port.")
    def onu_migrate_batch(olt_id: int):
        pass

    # ======================================================================
    # ONU REGISTRATION
    # ======================================================================
    @app.get("/api/olt/{olt_id}/unregistered-onus", tags=["ONU Registration"], summary="Scan unregistered ONUs",
             description="Discover unconfigured ONUs from OLT via Telnet (show pon onu uncfg).")
    def scan_unregistered(olt_id: int):
        pass

    @app.get("/api/olt/{olt_id}/next-onu-id", tags=["ONU Registration"], summary="Get next available ONU ID")
    def next_onu_id(olt_id: int):
        pass

    @app.post("/api/pre-register", tags=["ONU Registration"], summary="Register new ONU",
              description="Pre-register ONU on OLT with template-based provisioning.")
    def pre_register(body: ONURegister):
        pass

    # ======================================================================
    # UPLINK PORT MANAGEMENT
    # ======================================================================
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

    @app.post("/api/olt/{olt_id}/pon-port/{port_id}/toggle", tags=["PON Ports"], summary="Enable/Disable PON port")
    def toggle_pon(olt_id: int, port_id: int):
        pass

    @app.post("/api/olt/{olt_id}/pon-port/{port_id}/edit", tags=["PON Ports"], summary="Edit PON port name/desc")
    def edit_pon(olt_id: int, port_id: int):
        pass

    # ======================================================================
    # VLAN MANAGEMENT
    # ======================================================================
    @app.post("/api/olt/{olt_id}/vlan/{vlan_id}/rename", tags=["VLANs"], summary="Rename VLAN")
    def rename_vlan(olt_id: int, vlan_id: int, body: VLANRename):
        pass

    @app.post("/api/olt/{olt_id}/vlan/{vlan_id}/delete", tags=["VLANs"], summary="Delete VLAN")
    def delete_vlan(olt_id: int, vlan_id: int):
        pass

    # ======================================================================
    # ONU TYPE MANAGEMENT
    # ======================================================================
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
    @app.post("/api/olt/{olt_id}/wan-ip/add", tags=["WAN IP Profiles"], summary="Add WAN IP profile")
    def add_wan_ip(olt_id: int, body: WANIPAdd):
        pass

    @app.post("/api/olt/{olt_id}/wan-ip/{profile_id}/delete", tags=["WAN IP Profiles"], summary="Delete WAN IP profile")
    def delete_wan_ip(olt_id: int, profile_id: int):
        pass

    # ======================================================================
    # FTTH INFRASTRUCTURE
    # ======================================================================
    @app.get("/api/ftth/tree", tags=["FTTH Infrastructure"], summary="Get FTTH tree",
             description="Returns OTB → ODC → ODP → Port hierarchy.")
    def ftth_tree():
        pass

    @app.post("/api/ftth/otb", tags=["FTTH Infrastructure"], summary="Create OTB")
    def create_otb(body: FTTHNode):
        pass

    @app.post("/api/ftth/odc", tags=["FTTH Infrastructure"], summary="Create ODC")
    def create_odc(body: FTTHNode):
        pass

    @app.post("/api/ftth/odp", tags=["FTTH Infrastructure"], summary="Create ODP")
    def create_odp(body: FTTHNode):
        pass

    @app.post("/api/ftth/odp-port", tags=["FTTH Infrastructure"], summary="Create ODP port")
    def create_odp_port():
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
    @app.get("/api/tr069-profiles", tags=["TR069"], summary="List TR069 profiles")
    def list_tr069():
        pass

    @app.post("/api/tr069-profile", tags=["TR069"], summary="Create TR069 profile")
    def create_tr069(body: TR069Create):
        pass

    @app.put("/api/tr069-profile/{id}", tags=["TR069"], summary="Update TR069 profile")
    def update_tr069(id: int):
        pass

    @app.delete("/api/tr069-profile/{id}", tags=["TR069"], summary="Delete TR069 profile")
    def delete_tr069(id: int):
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

    @app.put("/api/user/{id}", tags=["Users"], summary="Update user")
    def update_user(id: int):
        pass

    @app.delete("/api/user/{id}", tags=["Users"], summary="Delete user")
    def delete_user(id: int):
        pass

    @app.get("/api/technicians", tags=["Users"], summary="List technicians",
             description="List users with technician role for assignment dropdowns.")
    def list_technicians():
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

    # ======================================================================
    # NOTIFICATIONS
    # ======================================================================
    @app.get("/api/notifications", tags=["Notifications"], summary="List notifications")
    def list_notifications():
        pass

    @app.post("/api/notifications/mark-all-read", tags=["Notifications"], summary="Mark all as read")
    def mark_all_read():
        pass

    @app.post("/api/notifications/clear-read", tags=["Notifications"], summary="Clear read notifications")
    def clear_read():
        pass

    # ======================================================================
    # ACTION LOGS
    # ======================================================================
    @app.get("/api/logs", tags=["Action Logs"], summary="List action logs",
             description="Audit trail of all user actions. Requires 'manage_users' permission.")
    def list_logs():
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
    # SUBSCRIPTION MANAGEMENT (tenant)
    # ======================================================================
    @app.get("/api/subscription", tags=["Subscription"], summary="Get current subscription")
    def get_subscription():
        pass

    @app.post("/api/subscription/renew", tags=["Subscription"], summary="Create renewal payment")
    def renew_subscription():
        pass

    @app.get("/api/subscription/invoices", tags=["Subscription"], summary="List invoices")
    def list_invoices():
        pass

    # ======================================================================
    # PUBLIC ENDPOINTS (no auth)
    # ======================================================================
    @app.get("/api/public/branding", tags=["Public"], summary="Get NMS branding",
             description="Returns NMS name, base_url, base_domain. No auth required.")
    def branding():
        pass

    @app.get("/api/public/tenant-check", tags=["Public"], summary="Validate tenant subdomain",
             description="Check if subdomain matches an active tenant. Returns 404 if not found, 403 if suspended.")
    def tenant_check():
        pass

    @app.get("/api/public/packages", tags=["Public"], summary="List subscription packages")
    def list_packages():
        pass

    @app.post("/api/public/register", tags=["Public"], summary="Register new tenant",
              description="Create tenant + admin user + trial subscription + Cloudflare subdomain + WA notification.")
    def register():
        pass

    @app.post("/api/public/register/pay", tags=["Public"], summary="Create registration payment",
              description="Create Duitku payment for tenant registration.")
    def register_pay():
        pass

    @app.get("/api/public/registration-status/{order_id}", tags=["Public"], summary="Poll registration payment status")
    def registration_status(order_id: str):
        pass

    @app.post("/api/public/forgot-password", tags=["Public"], summary="Forgot password",
              description="Send new password via WhatsApp to tenant's registered phone.")
    def forgot_password():
        pass

    # ======================================================================
    # SUPERADMIN ENDPOINTS
    # ======================================================================
    @app.get("/api/admin/packages", tags=["Superadmin"], summary="List all packages")
    def admin_packages():
        pass

    @app.post("/api/admin/package", tags=["Superadmin"], summary="Create package")
    def admin_create_package(body: PackageCreate):
        pass

    @app.put("/api/admin/package/{id}", tags=["Superadmin"], summary="Update package")
    def admin_update_package(id: int):
        pass

    @app.delete("/api/admin/package/{id}", tags=["Superadmin"], summary="Delete package")
    def admin_delete_package(id: int):
        pass

    @app.get("/api/admin/tenants", tags=["Superadmin"], summary="List all tenants")
    def admin_tenants():
        pass

    @app.post("/api/admin/tenant", tags=["Superadmin"], summary="Create tenant")
    def admin_create_tenant(body: TenantCreate):
        pass

    @app.put("/api/admin/tenant/{id}", tags=["Superadmin"], summary="Update tenant")
    def admin_update_tenant(id: int):
        pass

    @app.delete("/api/admin/tenant/{id}", tags=["Superadmin"], summary="Delete tenant",
                description="Cascading delete + Cloudflare DNS/ingress cleanup.")
    def admin_delete_tenant(id: int):
        pass

    @app.get("/api/admin/subscriptions", tags=["Superadmin"], summary="List all subscriptions")
    def admin_subscriptions():
        pass

    @app.post("/api/admin/subscription/{id}/renew", tags=["Superadmin"], summary="Renew subscription")
    def admin_renew_subscription(id: int):
        pass

    @app.get("/api/admin/invoices", tags=["Superadmin"], summary="List invoices")
    def admin_invoices():
        pass

    @app.get("/api/admin/notifications", tags=["Superadmin"], summary="List subscription notifications")
    def admin_notifications():
        pass

    # ======================================================================
    # PAYMENT CALLBACK
    # ======================================================================
    @app.post("/api/payment/callback", tags=["Payment"], summary="Duitku payment callback",
              description="Duitku callback handler. Auto-activates tenant on success.")
    def payment_callback():
        pass

    @app.get("/api/payment/return", tags=["Payment"], summary="Duitku return redirect",
             description="Redirect after payment. REG → payment-result, REN → dashboard.")
    def payment_return():
        pass
