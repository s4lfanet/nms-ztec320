from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timezone
import os, base64, hashlib, logging

db = SQLAlchemy()

_logger = logging.getLogger(__name__)


def _get_fernet_key():
    """Derive a Fernet key for encrypting sensitive fields.

    Uses CREDENTIAL_ENCRYPTION_KEY if set, otherwise falls back to
    SECRET_KEY for backward compatibility with existing encrypted data.
    """
    secret = os.environ.get('CREDENTIAL_ENCRYPTION_KEY', '')
    if not secret:
        secret = os.environ.get('SECRET_KEY', 'fallback-dev-key')
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return key


def _get_legacy_fernet_key():
    """Derive a Fernet key from SECRET_KEY only — used for decrypting
    legacy data that was encrypted before CREDENTIAL_ENCRYPTION_KEY was introduced."""
    secret = os.environ.get('SECRET_KEY', 'fallback-dev-key')
    return base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())


def encrypt_field(value):
    """Encrypt a string value using Fernet. Returns encrypted string or '' if empty."""
    if not value:
        return ''
    try:
        from cryptography.fernet import Fernet
        f = Fernet(_get_fernet_key())
        return f.encrypt(value.encode()).decode()
    except ImportError:
        _logger.warning("cryptography package not installed — storing value in plaintext")
        return value
    except Exception as e:
        _logger.error(f"encrypt_field failed: {e}")
        return value


def decrypt_field(value):
    """Decrypt a string value.

    Tries the current key first (CREDENTIAL_ENCRYPTION_KEY or SECRET_KEY),
    then falls back to legacy SECRET_KEY-only key for backward compatibility.
    If both fail, the value is likely unencrypted legacy plaintext and is returned as-is
    with a warning log.
    """
    if not value:
        return ''
    try:
        from cryptography.fernet import Fernet
        # Try current key
        f = Fernet(_get_fernet_key())
        return f.decrypt(value.encode()).decode()
    except ImportError:
        _logger.warning("cryptography package not installed — returning raw value")
        return value
    except Exception:
        pass
    # Try legacy key (SECRET_KEY only) for backward compatibility
    try:
        from cryptography.fernet import Fernet
        legacy_key = _get_legacy_fernet_key()
        if legacy_key != _get_fernet_key():
            f = Fernet(legacy_key)
            return f.decrypt(value.encode()).decode()
    except Exception:
        pass
    # Likely unencrypted legacy plaintext — log warning but return as-is
    _logger.debug("decrypt_field: value could not be decrypted, treating as plaintext")
    return value


class Role(db.Model):
    __tablename__ = 'roles'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)
    description = db.Column(db.String(256), default='')
    is_system = db.Column(db.Boolean, default=False)
    permissions = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def get_permission_list(self):
        if not self.permissions:
            return []
        return [p.strip() for p in self.permissions.split(',')]

    def has_permission(self, perm):
        return perm in self.get_permission_list()


AVAILABLE_PERMISSIONS = {
    'all_olt': 'Access to all OLTs',
    'add_onu': 'Page Add-Onu',
    'configure_onu': 'Configure ONU',
    'delete_onu': 'Delete ONU',
    'reboot_onu': 'Reboot ONU',
    'reset_onu': 'Reset ONU',
    'clear_config_onu': 'Clear Config ONU',
    'disable_onu': 'Disable ONU',
    'edit_onu_name': 'Edit ONU Name',
    'edit_onu_description': 'Edit ONU Description',
    'settings_ip_olts': 'OLT Settings Page',
    'manage_templates': 'Manage Templates',
    'manage_users': 'User Management',
    'manage_tr069': 'TR069 Profile Management',
    'genieacs_manage': 'GenieACS TR-069 Actions',
    'manage_api_tokens': 'API Token Management',
    'olt_terminal': 'OLT Terminal (Telnet/SSH)',
    'pon_port_control': 'Enable/Disable PON Port',
    'customization': 'Customization',
    'ai_agent': 'AI Agent (tanya status jaringan)',
    'view_dashboard': 'View Dashboard',
    'view_onus': 'View All ONUs',
    'receive_alerts': 'Receive Alert Notifications',
}


class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(150), nullable=False)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=True)
    role = db.relationship('Role', backref='users', lazy=True)
    is_super_admin = db.Column(db.Boolean, default=False)
    phone = db.Column(db.String(30), default='')  # phone number for WA notifications
    profile_image = db.Column(db.String(256), default='default.png')
    sidebar_name = db.Column(db.String(100), default='FiberNMS')
    # Only True for the 'admin' user created by the initial-install seed
    # (see app.py::seed_initial_data) — forces a password change before the
    # rest of the app is usable, since admin/admin123 is a well-known
    # default. Never retroactively set True for existing users; False is
    # always safe (falls back to "no forced change").
    must_change_password = db.Column(db.Boolean, default=False)
    # Per-user UI preferences (Fase 10). 'system' resolves to the OS-level
    # prefers-color-scheme in the browser; language drives react-i18next.
    theme = db.Column(db.String(10), default='system')  # 'dark' | 'light' | 'system'
    language = db.Column(db.String(5), default='id')    # 'id' | 'en'
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def has_permission(self, perm):
        if self.is_super_admin:
            return True
        if not self.role:
            return False
        if self.role.has_permission('all_olt'):
            return True
        return self.role.has_permission(perm)



class OLT(db.Model):
    __tablename__ = 'olts'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    ip_address = db.Column(db.String(50), nullable=False)
    vendor = db.Column(db.String(100), default='zte')
    model = db.Column(db.String(100), default='C320')
    firmware_version = db.Column(db.String(100), default='')
    snmp_enabled = db.Column(db.Boolean, default=True)
    _snmp_community_enc = db.Column('snmp_community', db.String(512), default='')
    _snmp_community_write_enc = db.Column('snmp_community_write', db.String(512), default='')
    snmp_port = db.Column(db.Integer, default=161)
    telnet_enabled = db.Column(db.Boolean, default=True)
    telnet_port = db.Column(db.Integer, default=23)
    web_port = db.Column(db.Integer, default=80)
    ssh_enabled = db.Column(db.Boolean, default=False)
    ssh_port = db.Column(db.Integer, default=22)
    cli_username = db.Column(db.String(100), default='')
    _cli_password_enc = db.Column('cli_password', db.String(512), default='')
    monitoring_enabled = db.Column(db.Boolean, default=True)
    polling_interval = db.Column(db.Integer, default=300)
    auto_backup_enabled = db.Column(db.Boolean, default=False)
    auto_backup_interval = db.Column(db.Integer, default=24)  # interval value (combined with unit)
    auto_backup_unit = db.Column(db.String(10), default='hours')  # 'hours' or 'days'
    auto_backup_time = db.Column(db.String(5), default='')  # HH:MM format, empty = anytime
    last_backup_at = db.Column(db.DateTime, nullable=True)
    is_online = db.Column(db.Boolean, default=False)
    uptime = db.Column(db.Integer, default=0)
    temperature = db.Column(db.Float, nullable=True)
    total_fan = db.Column(db.Integer, default=0)
    total_onu = db.Column(db.Integer, default=0)
    online_onu = db.Column(db.Integer, default=0)
    los_onu = db.Column(db.Integer, default=0)
    dyinggasp_onu = db.Column(db.Integer, default=0)
    offline_onu = db.Column(db.Integer, default=0)
    other_onu = db.Column(db.Integer, default=0)
    last_sync = db.Column(db.DateTime, nullable=True)
    last_full_sync = db.Column(db.DateTime, nullable=True)
    connection_status = db.Column(db.String(20), default='disconnected')
    snmp_status = db.Column(db.String(20), default='disconnected')
    telnet_status = db.Column(db.String(20), default='disconnected')
    register_mode = db.Column(db.String(10), default='telnet')  # 'telnet' or 'snmp'
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    @property
    def cli_password(self):
        return decrypt_field(self._cli_password_enc)

    @cli_password.setter
    def cli_password(self, value):
        self._cli_password_enc = encrypt_field(value)

    @property
    def snmp_community(self):
        return decrypt_field(self._snmp_community_enc) or 'public'

    @snmp_community.setter
    def snmp_community(self, value):
        self._snmp_community_enc = encrypt_field(value)

    @property
    def snmp_community_write(self):
        return decrypt_field(self._snmp_community_write_enc)

    @snmp_community_write.setter
    def snmp_community_write(self, value):
        self._snmp_community_write_enc = encrypt_field(value)

    @property
    def cli_enabled(self):
        """True if any CLI access (Telnet or SSH) is enabled."""
        return bool(self.telnet_enabled or self.ssh_enabled)


class ONU(db.Model):
    __tablename__ = 'onus'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    onu_index = db.Column(db.Integer, default=0)
    frame = db.Column(db.Integer, default=1)
    slot = db.Column(db.Integer, default=1)
    port = db.Column(db.Integer, default=1)
    onu_id = db.Column(db.Integer, default=0)
    name = db.Column(db.String(150), default='Unnamed')
    description = db.Column(db.String(256), default='')
    pppoe = db.Column(db.String(150), default='')
    serial_number = db.Column(db.String(100), default='')
    status = db.Column(db.String(20), default='offline')
    oper_state = db.Column(db.Integer, default=0)
    reg_status = db.Column(db.Integer, default=0)
    rx_power = db.Column(db.Float, nullable=True)       # OLT RX (OID .18) — what OLT receives from ONU
    tx_power = db.Column(db.Float, nullable=True)       # ONU TX (OID .11)
    onu_rx_power = db.Column(db.Float, nullable=True)   # ONU RX (OID .10) — what ONU receives from OLT
    distance = db.Column(db.Integer, nullable=True)
    last_dereg_reason = db.Column(db.String(50), default='')
    actual_type = db.Column(db.String(100), default='')
    onu_type = db.Column(db.String(100), default='')
    card = db.Column(db.String(20), default='')
    pon = db.Column(db.String(20), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_seen = db.Column(db.DateTime, nullable=True)
    last_online = db.Column(db.DateTime, nullable=True)
    last_offline = db.Column(db.DateTime, nullable=True)
    technician_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    map_locked = db.Column(db.Boolean, default=False)  # Fase 4 — locked pin, won't be auto-jittered/overwritten
    wifi_config = db.Column(db.Text, default='')  # JSON: {ssids: [{ssid_num, ssid_name, ssid_auth_type, ssid_password, wifi_mode, wifi_status, vlan}]}
    olt = db.relationship('OLT', backref=db.backref('onus', lazy=True))
    technician = db.relationship('User', foreign_keys=[technician_id], backref='assigned_onus')

    __table_args__ = (
        db.Index('ix_onus_olt_id', 'olt_id'),
        db.Index('ix_onus_status', 'status'),
        db.Index('ix_onus_serial_number', 'serial_number'),
        db.Index('ix_onus_olt_status', 'olt_id', 'status'),  # composite — paling sering dipakai
    )

    @property
    def onu_id_str(self):
        return f'{self.frame}/{self.slot}/{self.port}:{self.onu_id}'


class Template(db.Model):
    __tablename__ = 'templates'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    vendor = db.Column(db.String(100), default='')
    model = db.Column(db.String(100), default='')
    onu_type = db.Column(db.String(100), default='')
    tcont_profile = db.Column(db.String(100), default='')
    traffic_profile = db.Column(db.String(100), default='')
    vlan = db.Column(db.Integer, default=100)
    description = db.Column(db.String(256), default='')
    config = db.Column(db.Text, default='')  # JSON: full wizard config (template type, extra fields, ssids, etc.)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class TR069Profile(db.Model):
    __tablename__ = 'tr069_profiles'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    acs_url = db.Column(db.String(256), default='')
    acs_username = db.Column(db.String(100), default='')
    _acs_password_enc = db.Column('acs_password', db.String(512), default='')
    default_olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=True)
    vlan = db.Column(db.Integer, default=100)
    vlan_mode = db.Column(db.String(10), default='tag')  # tag or untag
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    default_olt = db.relationship('OLT', backref='tr069_profiles')

    @property
    def acs_password(self):
        return decrypt_field(self._acs_password_enc)

    @acs_password.setter
    def acs_password(self, value):
        self._acs_password_enc = encrypt_field(value)


class ONUCustomColumn(db.Model):
    __tablename__ = 'onu_custom_columns'
    id = db.Column(db.Integer, primary_key=True)
    column_key = db.Column(db.String(100), nullable=False)
    column_name = db.Column(db.String(100), nullable=False)
    visible_desktop = db.Column(db.Boolean, default=True)
    visible_mobile = db.Column(db.Boolean, default=False)
    sort_order = db.Column(db.Integer, default=0)


class Fan(db.Model):
    __tablename__ = 'fans'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    fan_number = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), default='offline')
    rpm = db.Column(db.Integer, default=0)
    speed_level = db.Column(db.String(50), default='Standard')
    olt = db.relationship('OLT', backref=db.backref('fans', lazy=True))


class OLTSyncStatus(db.Model):
    """Track OLT synchronization progress — current state of the latest sync job."""
    __tablename__ = 'olt_sync_status'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    progress = db.Column(db.Integer, default=0)  # 0-100
    status = db.Column(db.String(20), default='idle')  # idle, running, completed, error, skipped
    message = db.Column(db.String(256), default='')
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    onu_count = db.Column(db.Integer, default=0)
    # Phase 3: Job lifecycle tracking
    job_id = db.Column(db.String(36), nullable=True)  # UUID for current/last job
    sync_type = db.Column(db.String(20), default='full')  # full, light, auto
    triggered_by = db.Column(db.String(50), default='manual')  # manual, auto, action
    error_detail = db.Column(db.Text, nullable=True)
    duration_seconds = db.Column(db.Float, nullable=True)
    olt = db.relationship('OLT', backref=db.backref('sync_status', uselist=False))

    __table_args__ = (
        db.Index('ix_olt_sync_status_olt_id', 'olt_id'),
    )


class SyncJob(db.Model):
    """Historical record of completed sync jobs — enables audit trail and analytics."""
    __tablename__ = 'sync_jobs'
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.String(36), unique=True, nullable=False)  # UUID
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    sync_type = db.Column(db.String(20), default='full')  # full, light, auto
    triggered_by = db.Column(db.String(50), default='manual')  # manual, auto, action
    status = db.Column(db.String(20), default='pending')  # pending, running, completed, error, skipped, cancelled
    progress = db.Column(db.Integer, default=0)
    message = db.Column(db.String(256), default='')
    error_detail = db.Column(db.Text, nullable=True)
    onu_count = db.Column(db.Integer, default=0)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    duration_seconds = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('sync_jobs', lazy=True, cascade='all, delete-orphan'))

    __table_args__ = (
        db.Index('ix_sync_jobs_olt_id', 'olt_id'),
        db.Index('ix_sync_jobs_created_at', 'created_at'),
    )


class OLTCard(db.Model):
    """OLT chassis card info from CLI 'show card'"""
    __tablename__ = 'olt_cards'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    slot = db.Column(db.Integer, nullable=False)
    card_type = db.Column(db.String(100), default='')  # SMXA, GPON, etc.
    status = db.Column(db.String(20), default='offline')  # InService, HwOffline
    temperature = db.Column(db.Float, nullable=True)
    cpu_usage = db.Column(db.Integer, default=0)
    memory_usage = db.Column(db.Integer, default=0)
    memory_total = db.Column(db.Integer, default=0)  # MB
    total_ports = db.Column(db.Integer, default=0)
    ports_up = db.Column(db.Integer, default=0)
    ports_down = db.Column(db.Integer, default=0)
    ports_shutdown = db.Column(db.Integer, default=0)
    olt = db.relationship('OLT', backref=db.backref('cards', lazy=True))


class OLTUplink(db.Model):
    """OLT uplink port info with detailed interface statistics"""
    __tablename__ = 'olt_uplinks'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    card_id = db.Column(db.Integer, db.ForeignKey('olt_cards.id'), nullable=True)
    port_number = db.Column(db.Integer, nullable=False)
    port_name = db.Column(db.String(50), default='')  # gei_1/3/1, xgei_1/3/2
    speed = db.Column(db.String(20), default='')  # 1G, 10G, 100M
    duplex = db.Column(db.String(10), default='full')  # full, auto
    medium = db.Column(db.String(20), default='')  # fiber, copper
    admin_status = db.Column(db.String(10), default='up')  # up, down
    oper_status = db.Column(db.String(10), default='down')  # up, down
    line_protocol = db.Column(db.String(10), default='down')  # up, down
    description = db.Column(db.String(256), default='')
    negotiation = db.Column(db.String(10), default='disable')  # enable, disable
    flowcontrol = db.Column(db.String(10), default='disable')  # enable, disable
    switchport_mode = db.Column(db.String(20), default='trunk')  # trunk, access
    vlans_tagged = db.Column(db.Text, default='')  # comma-separated VLAN IDs
    input_rate = db.Column(db.String(50), default='0 Bps')
    output_rate = db.Column(db.String(50), default='0 Bps')
    input_utilization = db.Column(db.String(20), default='0%')
    output_utilization = db.Column(db.String(20), default='0%')
    input_packets = db.Column(db.BigInteger, default=0)
    output_packets = db.Column(db.BigInteger, default=0)
    input_bytes = db.Column(db.BigInteger, default=0)
    output_bytes = db.Column(db.BigInteger, default=0)
    crc_errors = db.Column(db.Integer, default=0)
    dropped = db.Column(db.Integer, default=0)
    # SFP/Transceiver info
    sfp_vendor = db.Column(db.String(100), default='')
    sfp_serial = db.Column(db.String(100), default='')
    sfp_type = db.Column(db.String(100), default='')
    sfp_wavelength = db.Column(db.String(50), default='')
    sfp_distance = db.Column(db.String(50), default='')
    sfp_rx_power = db.Column(db.String(20), default='')
    sfp_tx_power = db.Column(db.String(20), default='')
    sfp_temperature = db.Column(db.String(20), default='')  # °C from SNMP
    sfp_voltage = db.Column(db.String(20), default='')
    sfp_bias_current = db.Column(db.String(20), default='')
    sfp_connector = db.Column(db.String(20), default='')  # LC, SC, RJ45
    # Port attribute info
    phy_attribute = db.Column(db.String(20), default='')  # lan, wan
    linktrap = db.Column(db.String(10), default='enable')  # enable, disable
    port_protect = db.Column(db.String(10), default='disable')  # enable, disable
    uplink_isolate = db.Column(db.String(10), default='disable')  # enable, disable
    port_type = db.Column(db.String(20), default='')  # optical, electrical
    # IP network config (for mgmt IP on uplink port via VLAN SVI)
    ip_vlan_id = db.Column(db.Integer, default=0)
    ip_address = db.Column(db.String(50), default='')
    ip_mask = db.Column(db.String(50), default='')
    ip_gateway = db.Column(db.String(50), default='')
    olt = db.relationship('OLT', backref=db.backref('uplinks', lazy=True))


class OLTPort(db.Model):
    """PON port info with per-port ONU stats and configuration"""
    __tablename__ = 'olt_pon_ports'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    card_id = db.Column(db.Integer, db.ForeignKey('olt_cards.id'), nullable=True)
    port_number = db.Column(db.Integer, nullable=False)  # 1-16
    port_name = db.Column(db.String(50), default='')  # gpon-olt_1/1/1
    port_interface = db.Column(db.String(50), default='')  # gpon-olt_1/1/1
    admin_status = db.Column(db.String(10), default='up')  # up, down
    name = db.Column(db.String(150), default='')  # user-assigned name
    description = db.Column(db.String(256), default='')
    linktrap = db.Column(db.String(10), default='disable')  # enable, disable
    onu_count = db.Column(db.Integer, default=0)  # total registered ONUs on this port
    onu_online = db.Column(db.Integer, default=0)
    onu_offline = db.Column(db.Integer, default=0)
    # SFP / optical module info
    sfp_vendor = db.Column(db.String(50), default='')
    sfp_type = db.Column(db.String(50), default='')
    sfp_serial = db.Column(db.String(50), default='')
    sfp_wavelength = db.Column(db.String(20), default='')
    sfp_connector = db.Column(db.String(20), default='')
    sfp_distance = db.Column(db.String(20), default='')
    sfp_tx_power = db.Column(db.String(20), default='')
    sfp_rx_power = db.Column(db.String(20), default='')
    sfp_temperature = db.Column(db.String(20), default='')
    sfp_voltage = db.Column(db.String(20), default='')
    sfp_bias_current = db.Column(db.String(20), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('pon_ports', lazy=True, cascade='all, delete-orphan'))

    __table_args__ = (
        db.Index('ix_olt_pon_ports_olt_id', 'olt_id'),
    )


class ONUVlan(db.Model):
    """VLAN configuration collected from OLT"""
    __tablename__ = 'onu_vlans'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    vlan_id = db.Column(db.Integer, nullable=False)
    vlan_name = db.Column(db.String(100), default='')
    vlan_type = db.Column(db.String(20), default='L2')  # L2 or L3 (SVI)
    onu_profiles = db.Column(db.Text, default='')  # comma-separated ONU profile names
    tagged_ports = db.Column(db.Text, default='')
    untagged_ports = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('vlans', lazy=True, cascade='all, delete-orphan'))


class ONUType(db.Model):
    """ONU types supported by OLT, collected via CLI 'show onu-type'"""
    __tablename__ = 'onu_types'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    type_name = db.Column(db.String(100), nullable=False)
    pon_type = db.Column(db.String(20), default='gpon')
    description = db.Column(db.String(256), default='')
    max_tcont = db.Column(db.Integer, default=0)
    max_gem = db.Column(db.Integer, default=0)
    max_switch = db.Column(db.Integer, default=0)
    max_flow = db.Column(db.Integer, default=0)
    max_ip_host = db.Column(db.Integer, default=0)
    max_veip = db.Column(db.Integer, default=0)
    interfaces = db.Column(db.Text, default='')  # comma-separated: eth_0/1,eth_0/2,wifi_0/1,...
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('onu_types_list', lazy=True, cascade='all, delete-orphan'))


class SpeedProfile(db.Model):
    """Speed/bandwidth profiles (TCONT & Traffic) collected from OLT"""
    __tablename__ = 'speed_profiles'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    profile_type = db.Column(db.String(20), default='tcont')  # tcont or traffic
    name = db.Column(db.String(100), nullable=False)
    type_val = db.Column(db.String(50), default='')  # for TCONT: type1-type5
    fixed_bandwidth = db.Column(db.String(50), default='0')
    assured_bandwidth = db.Column(db.String(50), default='0')
    max_bandwidth = db.Column(db.String(50), default='0')
    sir = db.Column(db.String(50), default='')  # for traffic profiles
    pir = db.Column(db.String(50), default='')  # for traffic profiles
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('speed_profiles', lazy=True, cascade='all, delete-orphan'))


class WanIpProfile(db.Model):
    """WAN IP profiles collected from OLT"""
    __tablename__ = 'wan_ip_profiles'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    ip_address = db.Column(db.String(50), default='')
    netmask = db.Column(db.String(50), default='')
    gateway = db.Column(db.String(50), default='')
    dns1 = db.Column(db.String(50), default='')
    dns2 = db.Column(db.String(50), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('wan_ip_profiles', lazy=True, cascade='all, delete-orphan'))


class Notification(db.Model):
    """System notifications for users"""
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=True)
    onu_id = db.Column(db.Integer, nullable=True)
    severity = db.Column(db.String(20), default='info')  # info, warning, critical
    category = db.Column(db.String(50), default='status')  # status, signal, offline, dyinggasp, unconfig
    title = db.Column(db.String(256), nullable=False)
    message = db.Column(db.Text, default='')
    target_roles = db.Column(db.Text, default='')  # comma-separated role IDs, empty = all
    is_read = db.Column(db.Boolean, default=False)
    acknowledged = db.Column(db.Boolean, default=False)
    acknowledged_by = db.Column(db.String(100), default='')  # username who acknowledged
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    resolved = db.Column(db.Boolean, default=False)  # auto-resolved when condition clears
    resolved_at = db.Column(db.DateTime, nullable=True)
    target_type = db.Column(db.String(10), default='')  # 'olt','pon','onu','odp' — deep-link target
    target_id = db.Column(db.Integer, nullable=True)  # id of target (olt_id, onu_id, odp_id, or pon_key encoded)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('notifications', lazy=True))

    __table_args__ = (
        db.Index('ix_notifications_olt_category', 'olt_id', 'category'),
        db.Index('ix_notifications_unread', 'is_read', 'resolved'),  # untuk count unread aktif
    )


class AlertRule(db.Model):
    """Configurable alert rules for monitoring"""
    __tablename__ = 'alert_rules'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    enabled = db.Column(db.Boolean, default=True)
    # Conditions
    check_offline = db.Column(db.Boolean, default=True)
    check_dyinggasp = db.Column(db.Boolean, default=True)
    check_los = db.Column(db.Boolean, default=True)
    check_rx_power = db.Column(db.Boolean, default=True)
    rx_threshold = db.Column(db.Float, default=-27.0)  # dBm, alert if below this
    rx_change_threshold = db.Column(db.Float, default=3.0)  # dB change to trigger
    # OLT Health Monitoring
    check_olt_offline = db.Column(db.Boolean, default=True)
    check_olt_cpu = db.Column(db.Boolean, default=True)
    check_olt_memory = db.Column(db.Boolean, default=True)
    check_olt_temperature = db.Column(db.Boolean, default=True)
    olt_cpu_threshold = db.Column(db.Float, default=80.0)  # % — alert if >= this
    olt_memory_threshold = db.Column(db.Float, default=80.0)  # %
    olt_temp_threshold = db.Column(db.Float, default=60.0)  # °C
    # Notification channels
    notify_bell = db.Column(db.Boolean, default=True)
    notify_telegram = db.Column(db.Boolean, default=False)
    notify_whatsapp = db.Column(db.Boolean, default=False)
    notify_whatsapp_native = db.Column(db.Boolean, default=False)
    notify_push = db.Column(db.Boolean, default=False)  # Fase 14 — Web Push (VAPID)
    # Target roles (empty = all)
    target_roles = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class AlertHistory(db.Model):
    """Track sent alerts to avoid duplicates"""
    __tablename__ = 'alert_history'
    id = db.Column(db.Integer, primary_key=True)
    onu_id = db.Column(db.Integer, nullable=True)
    olt_id = db.Column(db.Integer, nullable=True)
    alert_type = db.Column(db.String(50), nullable=False)  # offline, dyinggasp, los, rx_power, unregistered, olt_offline, odp_outage
    last_value = db.Column(db.String(50), default='')
    last_alert_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    first_seen_at = db.Column(db.DateTime, nullable=True)  # first detection time (for debounce)
    root_cause_id = db.Column(db.Integer, nullable=True)  # AlertHistory.id of the root cause (OLT/PON) that suppressed this alert
    suppressed_by = db.Column(db.String(50), default='')  # 'olt_offline' / 'pon_down' / 'odp_outage' — why this was suppressed

    __table_args__ = (
        db.Index('ix_alert_history_onu_type', 'onu_id', 'alert_type'),  # composite — lookup per ONU+type
        db.Index('ix_alert_history_olt_type', 'olt_id', 'alert_type'),
    )


class BotConfig(db.Model):
    """Bot configuration for Telegram/WhatsApp"""
    __tablename__ = 'bot_config'
    id = db.Column(db.Integer, primary_key=True)
    bot_type = db.Column(db.String(20), nullable=False)  # telegram, whatsapp
    enabled = db.Column(db.Boolean, default=False)
    _bot_token_enc = db.Column('bot_token', db.String(512), default='')  # Telegram bot token (encrypted)
    chat_id = db.Column(db.String(100), default='')  # Telegram chat/group ID
    api_url = db.Column(db.String(256), default='')  # WhatsApp API URL
    _api_key_enc = db.Column('api_key', db.String(512), default='')  # WhatsApp API key (encrypted)
    phone_number = db.Column(db.String(50), default='')  # WhatsApp target number
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    @property
    def bot_token(self):
        return decrypt_field(self._bot_token_enc)

    @bot_token.setter
    def bot_token(self, value):
        self._bot_token_enc = encrypt_field(value)

    @property
    def api_key(self):
        return decrypt_field(self._api_key_enc)

    @api_key.setter
    def api_key(self, value):
        self._api_key_enc = encrypt_field(value)


class MaintenanceWindow(db.Model):
    """Scheduled maintenance windows to suppress alerts"""
    __tablename__ = 'maintenance_windows'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=True)  # null = all OLTs
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    reason = db.Column(db.Text, default='')
    node_type = db.Column(db.String(10), default='')  # '' = OLT/semua; otb/jc/odc/odp = node FTTH
    node_id = db.Column(db.Integer, nullable=True)
    created_by = db.Column(db.String(100), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('maintenance_windows', lazy=True))


class UptimeLog(db.Model):
    """Track ONU/OLT status changes for uptime/SLA calculation"""
    __tablename__ = 'uptime_log'
    id = db.Column(db.Integer, primary_key=True)
    onu_id = db.Column(db.Integer, nullable=True)
    olt_id = db.Column(db.Integer, nullable=True)
    old_status = db.Column(db.String(20), default='')
    new_status = db.Column(db.String(20), default='')
    changed_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class MetricHistory(db.Model):
    """Historical metrics for trending (RX power, CPU, memory, temperature)"""
    __tablename__ = 'metric_history'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=True)
    onu_id = db.Column(db.Integer, nullable=True)
    metric_type = db.Column(db.String(100), nullable=False)  # rx_power, olt_cpu, olt_mem, olt_temp, mt_if_in:<name>
    value = db.Column(db.Float, nullable=True)
    recorded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('metric_history', lazy=True))

    __table_args__ = (
        db.Index('ix_metric_history_onu_type_time', 'onu_id', 'metric_type', 'recorded_at'),
        db.Index('ix_metric_history_olt_type_time', 'olt_id', 'metric_type', 'recorded_at'),
    )


class TrafficLog(db.Model):
    """Periodic traffic samples (rx/tx Mbps) per uplink or PON port, collected via cron.
    Raw data retained for 7 days. Older data aggregated into TrafficLogHourly."""
    __tablename__ = 'traffic_logs'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    port_type = db.Column(db.String(10), nullable=False)  # 'uplink' or 'pon'
    port_name = db.Column(db.String(50), nullable=False)  # e.g. xgei_1/3/1, gpon-olt_1/1/1
    rx_mbps = db.Column(db.Float, default=0.0)
    tx_mbps = db.Column(db.Float, default=0.0)
    recorded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    olt = db.relationship('OLT', backref=db.backref('traffic_logs', lazy=True, cascade='all, delete-orphan'))


class TrafficLogHourly(db.Model):
    """Hourly aggregated traffic data — avg rx/tx Mbps per port per hour.
    Retained for 90 days. Used for history queries beyond 7-day raw retention."""
    __tablename__ = 'traffic_log_hourly'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    port_type = db.Column(db.String(10), nullable=False)
    port_name = db.Column(db.String(50), nullable=False)
    rx_mbps_avg = db.Column(db.Float, default=0.0)
    tx_mbps_avg = db.Column(db.Float, default=0.0)
    rx_mbps_peak = db.Column(db.Float, default=0.0)
    tx_mbps_peak = db.Column(db.Float, default=0.0)
    sample_count = db.Column(db.Integer, default=0)
    hour_start = db.Column(db.DateTime, nullable=False, index=True)  # UTC hour boundary
    __table_args__ = (db.UniqueConstraint('olt_id', 'port_type', 'port_name', 'hour_start', name='uq_traffic_hourly'),)


# ==================== FTTH INFRASTRUCTURE ====================

class TechnicianArea(db.Model):
    """Wilayah tanggung jawab teknisi: OLT / OTB / JC / ODC / ODP. Alert di
    wilayah ini dikirim ke teknisi `primary` dulu; `backup` dipakai eskalasi."""
    __tablename__ = 'technician_areas'
    __table_args__ = (db.UniqueConstraint('user_id', 'node_type', 'node_id', name='uq_tech_area'),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    node_type = db.Column(db.String(10), nullable=False)  # olt, otb, jc, odc, odp
    node_id = db.Column(db.Integer, nullable=False)
    role = db.Column(db.String(10), default='primary', nullable=False)  # primary | backup
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    user = db.relationship('User', backref=db.backref('areas', lazy=True, cascade='all, delete-orphan'))


class Incident(db.Model):
    """Insiden gangguan (Fase 3): dibuat otomatis dari korelasi gangguan
    ODP/ODC/JC/OTB. Status: open → acknowledged → en_route → on_site → resolved
    (atau merged bila digantikan insiden di node atasnya)."""
    __tablename__ = 'incidents'
    id = db.Column(db.Integer, primary_key=True)
    node_type = db.Column(db.String(10), nullable=False)
    node_id = db.Column(db.Integer, nullable=False)
    node_name = db.Column(db.String(150), default='')
    category = db.Column(db.String(20), default='outage')  # odp_outage | outage
    cause = db.Column(db.String(10), default='')  # power | fiber | mixed
    title = db.Column(db.String(256), default='')
    olt_id = db.Column(db.Integer, nullable=True, index=True)
    affected_count = db.Column(db.Integer, default=0)
    peak_affected = db.Column(db.Integer, default=0)
    affected_onu_ids = db.Column(db.Text, default='[]')  # JSON list
    status = db.Column(db.String(15), default='open', index=True)
    assigned_user_ids = db.Column(db.String(200), default='')  # comma separated
    opened_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    acknowledged_by = db.Column(db.String(100), default='')
    en_route_at = db.Column(db.DateTime, nullable=True)
    on_site_at = db.Column(db.DateTime, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    resolved_by = db.Column(db.String(100), default='')
    recovered_at = db.Column(db.DateTime, nullable=True)  # ONU terdampak kembali online
    resolution_note = db.Column(db.Text, default='')
    merged_into_id = db.Column(db.Integer, nullable=True)
    escalation_level = db.Column(db.Integer, default=0)  # Fase 4
    last_escalated_at = db.Column(db.DateTime, nullable=True)  # Fase 4


class IncidentLog(db.Model):
    """Riwayat insiden: perubahan status, catatan, foto."""
    __tablename__ = 'incident_logs'
    id = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(db.Integer, db.ForeignKey('incidents.id'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    username = db.Column(db.String(100), default='')  # '' = sistem
    action = db.Column(db.String(20), default='note')  # status/note/photo/system
    status = db.Column(db.String(15), default='')
    note = db.Column(db.Text, default='')
    photo = db.Column(db.String(120), default='')


class FTTHFieldInfo:
    """Keterangan lapangan untuk node FTTH (OTB/ODC/ODP/JC) — FTTH tahap 3.
    cable_* = identitas kabel MASUK node ini (satu node punya satu feed);
    node_status = keadaan fisik node, installed_at = tanggal pasang."""
    cable_label = db.Column(db.String(100), default='')      # mis. "FO-FEEDER-01" / label di kabel
    cable_type = db.Column(db.String(30), default='')        # adss, figure8, duct, drop, indoor, lainnya
    cable_cores = db.Column(db.Integer, nullable=True)       # jumlah core kabel masuk
    cable_route = db.Column(db.Text, default='')             # rute/tiang, mis. "T12–T18 Jl. Merdeka"
    node_status = db.Column(db.String(20), default='active') # planned, active, maintenance, retired
    installed_at = db.Column(db.Date, nullable=True)


class FTTHOTB(FTTHFieldInfo, db.Model):
    """OTB/ODF at server room — top of FTTH chain, fed by OLT PON port
    (feed_source='pon', via FTTHPonPort.otb_id) or, on a distributed feeder
    run, by a JC on the OLT->OTB trunk (feed_source='jc')."""
    __tablename__ = 'ftth_otb'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    type = db.Column(db.String(10), default='otb')  # otb or odf
    model = db.Column(db.String(100), default='')
    location = db.Column(db.String(256), default='')
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=True)
    pon_port = db.Column(db.String(50), default='')  # e.g. gpon-olt_1/1/1
    total_cores = db.Column(db.Integer, default=12)
    fibers_per_tube = db.Column(db.Integer, default=12, nullable=False)  # TIA-598 tube grouping for this cable
    feed_source = db.Column(db.String(10), default='pon', nullable=False)  # 'pon' (direct, via FTTHPonPort) or 'jc'
    jc_id = db.Column(db.Integer, db.ForeignKey('ftth_jc.id'), nullable=True)
    jc_core_number = db.Column(db.Integer, nullable=True)
    # Incoming cable (opsional) — length/loss of the run feeding this node, for
    # cumulative power-budget calculation along a trace. Not stored as a
    # separate polymorphic "segment" entity: each node already owns exactly
    # one incoming feed (via feed_source above), so these describe that feed.
    cable_length_meters = db.Column(db.Float, nullable=True)
    cable_attenuation_per_km = db.Column(db.Float, nullable=True, default=0.35)  # dB/km, SM fiber typical
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('ftth_otbs', lazy=True))
    jc = db.relationship('FTTHJC', foreign_keys=[jc_id], backref=db.backref('fed_otbs', lazy=True))


class FTTHODC(FTTHFieldInfo, db.Model):
    """ODC (Optical Distribution Cabinet) — fed by core from OTB/ODF, or from a
    FTTHJC splice (feed_source='jc') when the run passes through a joint
    closure first."""
    __tablename__ = 'ftth_odc'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    model = db.Column(db.String(100), default='')
    location = db.Column(db.String(256), default='')
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    otb_id = db.Column(db.Integer, db.ForeignKey('ftth_otb.id'), nullable=True)
    otb_core_number = db.Column(db.Integer, default=1)  # which core from OTB (feed_source='otb')
    feed_source = db.Column(db.String(10), default='otb', nullable=False)  # 'otb' or 'jc'
    jc_id = db.Column(db.Integer, db.ForeignKey('ftth_jc.id'), nullable=True)
    jc_core_number = db.Column(db.Integer, nullable=True)  # which spliced-out core from the JC (feed_source='jc')
    total_cores = db.Column(db.Integer, default=8)
    fibers_per_tube = db.Column(db.Integer, default=12, nullable=False)  # TIA-598 tube grouping for the ODC's own outgoing cable
    splitter_model = db.Column(db.String(50), default='')  # e.g. 1:8, 1:16
    # Optical budget (opsional) — splitter_model above stays a free-text label;
    # these are the numeric fields power-budget calculations actually need.
    splitter_ratio_type = db.Column(db.String(10), default='even')  # 'even' or 'uneven'
    splitter_tap_loss_db = db.Column(db.Float, nullable=True)
    splitter_through_loss_db = db.Column(db.Float, nullable=True)
    cable_length_meters = db.Column(db.Float, nullable=True)
    cable_attenuation_per_km = db.Column(db.Float, nullable=True, default=0.35)
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    otb = db.relationship('FTTHOTB', backref=db.backref('odcs', lazy=True, cascade='all, delete-orphan'))
    jc = db.relationship('FTTHJC', foreign_keys=[jc_id], backref=db.backref('fed_odcs', lazy=True))


class FTTHODP(FTTHFieldInfo, db.Model):
    """ODP (Optical Distribution Point) — fed by core from ODC, from a
    FTTHJC splice (feed_source='jc'), or by a PORT on another ODP
    (feed_source='odp', splitter cascade — this ODP's whole splitter hangs
    off one output port of its parent ODP, not off a raw core, since a
    port is already split light). Has splitter + ports for ONUs."""
    __tablename__ = 'ftth_odp'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    model = db.Column(db.String(100), default='')
    location = db.Column(db.String(256), default='')
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    odc_id = db.Column(db.Integer, db.ForeignKey('ftth_odc.id'), nullable=True)
    odc_core_number = db.Column(db.Integer, default=1)  # which core from ODC (feed_source='odc')
    feed_source = db.Column(db.String(10), default='odc', nullable=False)  # 'odc', 'jc', or 'odp'
    jc_id = db.Column(db.Integer, db.ForeignKey('ftth_jc.id'), nullable=True)
    jc_core_number = db.Column(db.Integer, nullable=True)  # which spliced-out core from the JC (feed_source='jc')
    parent_odp_port_id = db.Column(db.Integer, db.ForeignKey('ftth_odp_port.id', use_alter=True, name='fk_ftth_odp_parent_odp_port_id'), nullable=True)  # which port on the parent ODP (feed_source='odp')
    total_ports = db.Column(db.Integer, default=8)
    splitter_model = db.Column(db.String(50), default='')  # e.g. 1:4, 1:8, 1:16, 1:32
    # Optical budget (opsional) — see FTTHODC for rationale.
    splitter_ratio_type = db.Column(db.String(10), default='even')  # 'even' or 'uneven'
    splitter_tap_loss_db = db.Column(db.Float, nullable=True)
    splitter_through_loss_db = db.Column(db.Float, nullable=True)
    cable_length_meters = db.Column(db.Float, nullable=True)
    cable_attenuation_per_km = db.Column(db.Float, nullable=True, default=0.35)
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    odc = db.relationship('FTTHODC', backref=db.backref('odps', lazy=True, cascade='all, delete-orphan'))
    jc = db.relationship('FTTHJC', foreign_keys=[jc_id], backref=db.backref('fed_odps', lazy=True))
    parent_odp_port = db.relationship('FTTHODPPort', foreign_keys=[parent_odp_port_id], backref=db.backref('fed_odps', lazy=True))


class FTTHJC(FTTHFieldInfo, db.Model):
    """JC (Joint Closure / titik sambungan) — a splice closure along a fiber
    run. Can sit anywhere in the chain (OLT/PON→OTB, OTB→ODC, ODC→ODP,
    ODP→client, or chained JC→JC): its own incoming cable comes from
    `parent_type`/`parent_id` (pon, otb, odc, odp_port, or another jc), and
    each downstream node (OTB/ODC/ODP/ODP port/another JC) that is fed from
    this closure picks one of its FTTHJCSplice rows — identified by that
    splice's core_out — as its feed core."""
    __tablename__ = 'ftth_jc'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    closure_type = db.Column(db.String(20), default='inline')  # inline, dome, dead-end
    location = db.Column(db.String(256), default='')
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    total_cores = db.Column(db.Integer, default=12)
    fibers_per_tube = db.Column(db.Integer, default=12, nullable=False)  # TIA-598 tube grouping — a JC can hold several tubes
    parent_type = db.Column(db.String(10), nullable=True)  # pon, otb, odc, odp_port, jc
    parent_id = db.Column(db.Integer, nullable=True)
    cable_length_meters = db.Column(db.Float, nullable=True)  # incoming cable, from parent to this JC
    cable_attenuation_per_km = db.Column(db.Float, nullable=True, default=0.35)
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class FTTHJCSplice(db.Model):
    """One splice inside a JC: an incoming core number (on the JC's parent
    cable) spliced through to an outgoing core number (which downstream
    nodes reference as their feed core)."""
    __tablename__ = 'ftth_jc_splice'
    id = db.Column(db.Integer, primary_key=True)
    jc_id = db.Column(db.Integer, db.ForeignKey('ftth_jc.id'), nullable=False)
    core_in = db.Column(db.Integer, nullable=False)
    core_out = db.Column(db.Integer, nullable=False)
    label = db.Column(db.String(150), default='')
    # Free-text tube name/color override per side — a splice core isn't always
    # part of a standard 12-color TIA-598 tube (drop cores, non-ADSS cable),
    # so the auto-computed tube color can be overridden with what's physically
    # on the cable. Blank means "use the computed TIA-598 color" as before.
    tube_in_label = db.Column(db.String(50), default='')
    tube_out_label = db.Column(db.String(50), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    jc = db.relationship('FTTHJC', backref=db.backref('splices', lazy=True, cascade='all, delete-orphan'))

    __table_args__ = (
        db.UniqueConstraint('jc_id', 'core_out', name='uq_jc_core_out'),
    )


class FTTHODPPort(db.Model):
    """Individual port on an ODP — links to a customer ONU. Normally fed
    directly by a drop cable off the ODP (feed_source='direct'); on a longer
    drop run a JC can be spliced in between the ODP and the customer
    (feed_source='jc')."""
    __tablename__ = 'ftth_odp_port'
    id = db.Column(db.Integer, primary_key=True)
    odp_id = db.Column(db.Integer, db.ForeignKey('ftth_odp.id'), nullable=False)
    port_number = db.Column(db.Integer, nullable=False)
    onu_id = db.Column(db.Integer, db.ForeignKey('onus.id'), nullable=True)
    status = db.Column(db.String(10), default='available')  # available, used
    customer_name = db.Column(db.String(150), default='')
    customer_phone = db.Column(db.String(50), default='')
    description = db.Column(db.String(256), default='')
    feed_source = db.Column(db.String(10), default='direct', nullable=False)  # 'direct' (drop cable) or 'jc'
    jc_id = db.Column(db.Integer, db.ForeignKey('ftth_jc.id'), nullable=True)
    jc_core_number = db.Column(db.Integer, nullable=True)
    cable_length_meters = db.Column(db.Float, nullable=True)  # drop cable to the customer
    cable_attenuation_per_km = db.Column(db.Float, nullable=True, default=0.35)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    odp = db.relationship('FTTHODP', foreign_keys=[odp_id], backref=db.backref('ports', lazy=True, cascade='all, delete-orphan'))
    onu = db.relationship('ONU', backref=db.backref('odp_port', uselist=False))
    jc = db.relationship('FTTHJC', foreign_keys=[jc_id], backref=db.backref('fed_odp_ports', lazy=True))


class FTTHOTBPort(db.Model):
    """Individual core/port on an OTB/ODF — nameable, like a NetBox rear-port
    diagram. Which ODC (if any) is patched into a core is looked up via
    FTTHODC.otb_id + otb_core_number rather than a second FK here, so the
    existing OTB<->ODC link stays the single source of truth."""
    __tablename__ = 'ftth_otb_port'
    id = db.Column(db.Integer, primary_key=True)
    otb_id = db.Column(db.Integer, db.ForeignKey('ftth_otb.id'), nullable=False)
    port_number = db.Column(db.Integer, nullable=False)
    label = db.Column(db.String(150), default='')  # custom name, e.g. "Ruko Blok A"
    description = db.Column(db.String(256), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    otb = db.relationship('FTTHOTB', backref=db.backref('ports', lazy=True, cascade='all, delete-orphan'))

    __table_args__ = (
        db.UniqueConstraint('otb_id', 'port_number', name='uq_otb_port_number'),
    )


class FTTHPonPort(db.Model):
    """PON port data — links OLT PON port to OTB/ODF core"""
    __tablename__ = 'ftth_pon_port'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=True)
    olt_name = db.Column(db.String(100), default='')
    frame = db.Column(db.Integer, default=1)
    slot = db.Column(db.Integer, default=1)
    port = db.Column(db.Integer, default=1)
    pon_name = db.Column(db.String(100), default='')  # e.g. gpon-olt_1/1/1
    otb_id = db.Column(db.Integer, db.ForeignKey('ftth_otb.id'), nullable=True)
    otb_core_number = db.Column(db.Integer, default=1)  # which core in OTB
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('ftth_pon_ports', lazy=True))
    otb = db.relationship('FTTHOTB', backref=db.backref('ftth_pon_ports', lazy=True))


class FTTHFiberPath(db.Model):
    """Manual or auto-generated fiber path polylines between infrastructure nodes."""
    __tablename__ = 'ftth_fiber_path'
    id = db.Column(db.Integer, primary_key=True)
    from_type = db.Column(db.String(10), nullable=False)  # otb, odc, odp, onu
    from_id = db.Column(db.Integer, nullable=False)
    to_type = db.Column(db.String(10), nullable=False)
    to_id = db.Column(db.Integer, nullable=False)
    coordinates = db.Column(db.Text, default='[]')  # JSON array of [lat,lng] points
    path_type = db.Column(db.String(10), default='manual')  # manual, auto
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class FTTHFiberCore(db.Model):
    """Per-core status tracking for a node's own outgoing cable (OTB/ODC/JC
    only — ODP's outgoing side is ports, already tracked by FTTHODPPort, so
    ODP is deliberately not an owner_type here). Purely additive: the actual
    topology is still governed by the existing feed_source/*_core_number
    fields on OTB/ODC/ODP/JCSplice — this table is a supplementary
    status+history layer, lazily created/kept in sync by _touch_core() in
    routes_ftth.py whenever one of those fields is set or cleared."""
    __tablename__ = 'ftth_fiber_core'
    id = db.Column(db.Integer, primary_key=True)
    owner_type = db.Column(db.String(10), nullable=False)  # otb, odc, jc
    owner_id = db.Column(db.Integer, nullable=False)
    core_number = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(15), default='available', nullable=False)  # available, used, reserved, damaged
    assigned_to_type = db.Column(db.String(10), nullable=True)  # odc, odp, jc, jc_splice
    assigned_to_id = db.Column(db.Integer, nullable=True)
    attenuation_db = db.Column(db.Float, nullable=True)
    notes = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.UniqueConstraint('owner_type', 'owner_id', 'core_number', name='uq_fiber_core_owner_num'),
    )


class FTTHCoreAssignmentHistory(db.Model):
    """Audit trail of status changes on a FTTHFiberCore row."""
    __tablename__ = 'ftth_core_assignment_history'
    id = db.Column(db.Integer, primary_key=True)
    core_id = db.Column(db.Integer, db.ForeignKey('ftth_fiber_core.id'), nullable=False)
    action = db.Column(db.String(20), nullable=False)  # assigned, unassigned, status_change
    previous_status = db.Column(db.String(15), nullable=True)
    new_status = db.Column(db.String(15), nullable=True)
    assigned_to_type = db.Column(db.String(10), nullable=True)
    assigned_to_id = db.Column(db.Integer, nullable=True)
    performed_by = db.Column(db.String(100), default='')
    reason = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    core = db.relationship('FTTHFiberCore', backref=db.backref('history', lazy=True, cascade='all, delete-orphan'))


class SystemConfig(db.Model):
    """System-wide configuration key-value store"""
    __tablename__ = 'system_config'
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text, default='')
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class OLTConfigBackup(db.Model):
    """Stores OLT running-config backups."""
    __tablename__ = 'olt_config_backups'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    config_text = db.Column(db.Text, nullable=False)
    config_size = db.Column(db.Integer, default=0)
    backup_type = db.Column(db.String(20), default='manual')  # manual, auto
    status = db.Column(db.String(20), default='success')  # success, failed
    error_message = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('config_backups', lazy=True))


class IpInfo(db.Model):
    """Cache info IP publik (ISP/ASN/negara) untuk Log Aktivitas — `ip_info.py`."""
    __tablename__ = 'ip_info'
    ip = db.Column(db.String(45), primary_key=True)
    asn = db.Column(db.String(16), default='')
    as_name = db.Column(db.String(200), default='')
    as_domain = db.Column(db.String(120), default='')
    country_code = db.Column(db.String(8), default='')
    country = db.Column(db.String(80), default='')
    region = db.Column(db.String(80), default='')
    city = db.Column(db.String(80), default='')
    provider = db.Column(db.String(16), default='')
    error = db.Column(db.String(200), default='')
    fetched_at = db.Column(db.DateTime, nullable=True)


class ActionLog(db.Model):
    """Audit log for all user actions"""
    __tablename__ = 'action_logs'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True)
    username = db.Column(db.String(80), default='')
    action = db.Column(db.String(50), nullable=False)
    category = db.Column(db.String(50), default='general')
    target = db.Column(db.String(200), default='')
    detail = db.Column(db.Text, default='')
    ip_address = db.Column(db.String(50), default='')
    ip_country = db.Column(db.String(8), default='')      # CF-IPCountry saat kejadian
    user_agent = db.Column(db.String(300), default='')    # browser/perangkat
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    # Fase 11 — tamper-evident chain: hash = sha256(row payload + prev_hash)
    prev_hash = db.Column(db.String(64), default='')
    hash = db.Column(db.String(64), default='')

    __table_args__ = (
        db.Index('ix_action_logs_created_at', 'created_at'),
        db.Index('ix_action_logs_user_id', 'user_id'),
        db.Index('ix_action_logs_category', 'category'),
    )


class PushSubscription(db.Model):
    """Web Push (VAPID) subscription per user/browser — Fase 14."""
    __tablename__ = 'push_subscriptions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True)
    endpoint = db.Column(db.Text, nullable=False, unique=True)
    p256dh = db.Column(db.String(200), default='')
    auth = db.Column(db.String(100), default='')
    user_agent = db.Column(db.String(300), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_seen_at = db.Column(db.DateTime, nullable=True)


class MikrotikDevice(db.Model):
    """Mikrotik RouterOS device — PPPoE concentrator polled for link-state.

    api_mode 'api'   = classic binary API (port 8728/8729) — works on v6.43+ and v7
    api_mode 'rest'  = RouterOS v7 REST API (port 443/80)
    """
    __tablename__ = 'mikrotik_devices'
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, default=0)
    name = db.Column(db.String(120), nullable=False)
    host = db.Column(db.String(120), nullable=False)
    api_mode = db.Column(db.String(10), default='api')   # api | rest
    api_port = db.Column(db.Integer, default=8728)
    api_ssl = db.Column(db.Boolean, default=False)
    api_user = db.Column(db.String(80), default='')
    # Disimpan terenkripsi (Fernet); kolom DB tetap bernama api_password.
    # Nilai plaintext lama tetap terbaca (decrypt_field) dan dienkripsi ulang
    # saat start oleh secrets_migration.encrypt_legacy_secrets().
    _api_password_enc = db.Column('api_password', db.String(500), default='')
    enabled = db.Column(db.Boolean, default=True)
    ping_enabled = db.Column(db.Boolean, default=True)
    ping_batch = db.Column(db.Integer, default=25)  # max clients pinged per cycle
    # 'mikrotik' = ping dari router (bergiliran ping_batch/siklus, perilaku lama)
    # 'vps' = ping paralel dari server NMS, semua klien tiap siklus
    ping_source = db.Column(db.String(10), default='mikrotik')
    # Kesehatan router (diisi poller tiap siklus dari /system/resource & /system/health)
    cpu_load = db.Column(db.Integer, nullable=True)
    mem_used_pct = db.Column(db.Float, nullable=True)
    ros_uptime = db.Column(db.String(40), default='')
    ros_version = db.Column(db.String(60), default='')
    board = db.Column(db.String(60), default='')
    temperature = db.Column(db.Float, nullable=True)
    health_at = db.Column(db.DateTime, nullable=True)
    last_ok_at = db.Column(db.DateTime, nullable=True)
    cpu_high_cycles = db.Column(db.Integer, default=0)
    last_ok = db.Column(db.Boolean, default=False)
    last_error = db.Column(db.String(300), default='')
    last_polled_at = db.Column(db.DateTime)

    @property
    def api_password(self):
        return decrypt_field(self._api_password_enc or '')

    @api_password.setter
    def api_password(self, value):
        self._api_password_enc = encrypt_field(value or '') if value else ''


class OnuLinkState(db.Model):
    """Live service-layer state per ONU — PPPoE session + ping result.

    link_state: ok | slow | down | no_session | unknown
      ok         = PPPoE session up + ping replies with normal RTT
      slow       = ping replies but high RTT or partial loss (or first timeout)
      down       = session up but ping timed out on consecutive checks
      no_session = no active PPPoE session for this ONU's username
      unknown    = session state not yet evaluated / ping never checked
    """
    __tablename__ = 'onu_link_states'
    id = db.Column(db.Integer, primary_key=True)
    onu_id = db.Column(db.Integer, db.ForeignKey('onus.id'), unique=True, nullable=False)
    mikrotik_id = db.Column(db.Integer, db.ForeignKey('mikrotik_devices.id'))
    pppoe_user = db.Column(db.String(128), default='')
    pppoe_ip = db.Column(db.String(45), default='')
    session_up = db.Column(db.Boolean, default=False)
    session_uptime = db.Column(db.String(40), default='')
    caller_id = db.Column(db.String(64), default='')
    rtt_ms = db.Column(db.Float)
    loss_pct = db.Column(db.Float)
    fail_count = db.Column(db.Integer, default=0)  # consecutive ping timeouts
    link_state = db.Column(db.String(20), default='unknown')
    checked_at = db.Column(db.DateTime)
    ping_checked_at = db.Column(db.DateTime)

    onu = db.relationship('ONU', backref=db.backref('link_state_row', uselist=False))
    mikrotik = db.relationship('MikrotikDevice', backref=db.backref('link_states', lazy=True))

    __table_args__ = (
        db.Index('ix_onu_link_states_onu_id', 'onu_id'),
        db.Index('ix_onu_link_states_link_state', 'link_state'),
    )


class PppoeSessionEvent(db.Model):
    """Riwayat sesi PPPoE per ONU dari poller MikroTik: up / down / reconnect
    (reconnect = uptime sesi turun di antara dua siklus → putus-nyambung cepat)."""
    __tablename__ = 'pppoe_session_events'
    id = db.Column(db.Integer, primary_key=True)
    onu_id = db.Column(db.Integer, db.ForeignKey('onus.id'), nullable=False, index=True)
    mikrotik_id = db.Column(db.Integer, db.ForeignKey('mikrotik_devices.id'), nullable=True)
    pppoe_user = db.Column(db.String(128), default='')
    event = db.Column(db.String(12), nullable=False)  # up | down | reconnect
    ip = db.Column(db.String(45), default='')
    caller_id = db.Column(db.String(64), default='')
    prev_uptime = db.Column(db.String(40), default='')  # uptime sesi sebelum putus
    at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), index=True)


class VpsRoute(db.Model):
    """Rute statis server NMS → jaringan pelanggan PPPoE (via router MikroTik).
    Dipasang lewat helper root /usr/local/sbin/salfanet-route (sudo khusus) dan
    dipasang ulang otomatis saat service start (rute kernel hilang saat reboot)."""
    __tablename__ = 'vps_routes'
    id = db.Column(db.Integer, primary_key=True)
    cidr = db.Column(db.String(20), nullable=False, unique=True)
    gateway = db.Column(db.String(45), nullable=False)
    mikrotik_id = db.Column(db.Integer, nullable=True)
    note = db.Column(db.String(120), default='')
    enabled = db.Column(db.Boolean, default=True)
    status = db.Column(db.String(10), default='pending')  # pending | ok | error
    last_error = db.Column(db.String(300), default='')
    applied_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class AcsBulkJob(db.Model):
    """Operasi massal TR-069 lewat GenieACS (refresh/reboot/inform/firmware/param)."""
    __tablename__ = 'acs_bulk_jobs'
    id = db.Column(db.Integer, primary_key=True)
    action = db.Column(db.String(30), nullable=False)
    params = db.Column(db.Text, default='{}')     # JSON parameter aksi
    filters = db.Column(db.Text, default='{}')    # JSON filter target (untuk riwayat)
    total = db.Column(db.Integer, default=0)
    done = db.Column(db.Integer, default=0)       # dijalankan modem (HTTP 200)
    queued = db.Column(db.Integer, default=0)     # antre sampai modem inform (HTTP 202)
    failed = db.Column(db.Integer, default=0)
    status = db.Column(db.String(12), default='running')  # running | finished | cancelled
    created_by = db.Column(db.String(100), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    finished_at = db.Column(db.DateTime, nullable=True)


class AcsBulkJobItem(db.Model):
    __tablename__ = 'acs_bulk_job_items'
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('acs_bulk_jobs.id'), nullable=False, index=True)
    onu_id = db.Column(db.Integer, nullable=True)   # tanpa FK: riwayat tetap ada walau ONU dihapus
    onu_name = db.Column(db.String(150), default='')
    device_id = db.Column(db.String(128), default='')
    status = db.Column(db.String(10), default='pending')  # pending | done | queued | failed | skipped
    message = db.Column(db.String(300), default='')


class OnuStatusHistory(db.Model):
    """Track every ONU status change (online -> offline/dyinggasp/los and back)"""
    __tablename__ = 'onu_status_history'
    id = db.Column(db.Integer, primary_key=True)
    onu_id = db.Column(db.Integer, db.ForeignKey('onus.id'), nullable=False)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    onu_name = db.Column(db.String(150), default='')
    onu_index = db.Column(db.String(30), default='')  # e.g. "1/1/1:62"
    serial_number = db.Column(db.String(100), default='')
    old_status = db.Column(db.String(20), default='')
    new_status = db.Column(db.String(20), default='')
    dereg_reason = db.Column(db.String(50), default='')
    rx_power = db.Column(db.Float, nullable=True)
    distance = db.Column(db.Integer, nullable=True)
    source = db.Column(db.String(20), default='sync')  # sync, refresh, auto_sync
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.Index('ix_onu_status_history_onu_id', 'onu_id'),
        db.Index('ix_onu_status_history_olt_id', 'olt_id'),
        db.Index('ix_onu_status_history_created_at', 'created_at'),
        db.Index('ix_onu_status_history_new_status', 'new_status'),
    )


class OnuRxSample(db.Model):
    """Raw RX/TX power sample per ONU — one row per sync poll.
    Retention 24–48h (configurable via SystemConfig `rx_sample_retention_hours`).
    Used for the 24h detailed chart in ViewOnu."""
    __tablename__ = 'onu_rx_samples'
    id = db.Column(db.Integer, primary_key=True)
    onu_id = db.Column(db.Integer, db.ForeignKey('onus.id'), nullable=False)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    rx_dbm = db.Column(db.Float, nullable=True)   # OLT RX (OID .18) — primary metric
    tx_dbm = db.Column(db.Float, nullable=True)  # ONU TX (OID .11)
    onu_rx_dbm = db.Column(db.Float, nullable=True)  # ONU RX (OID .10) — downstream
    polled_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        db.Index('ix_onu_rx_samples_onu_time', 'onu_id', 'polled_at'),
        db.Index('ix_onu_rx_samples_olt_time', 'olt_id', 'polled_at'),
    )


class OnuRxHourly(db.Model):
    """Hourly aggregate of ONU RX power — min/avg/max per hour.
    Retention 90 days (configurable via SystemConfig `rx_hourly_retention_days`).
    Used for 7d/30d/90d charts."""
    __tablename__ = 'onu_rx_hourly'
    id = db.Column(db.Integer, primary_key=True)
    onu_id = db.Column(db.Integer, db.ForeignKey('onus.id'), nullable=False)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id'), nullable=False)
    hour = db.Column(db.DateTime, nullable=False)  # truncated to hour
    rx_min = db.Column(db.Float, nullable=True)
    rx_avg = db.Column(db.Float, nullable=True)
    rx_max = db.Column(db.Float, nullable=True)
    tx_avg = db.Column(db.Float, nullable=True)
    onu_rx_avg = db.Column(db.Float, nullable=True)
    samples = db.Column(db.Integer, default=0)

    __table_args__ = (
        db.UniqueConstraint('onu_id', 'hour', name='uq_onu_rx_hourly_onu_hour'),
        db.Index('ix_onu_rx_hourly_onu_time', 'onu_id', 'hour'),
        db.Index('ix_onu_rx_hourly_olt_time', 'olt_id', 'hour'),
    )


class GenieacsDeviceMap(db.Model):
    """Maps NMS ONU ↔ GenieACS TR-069 device.
    Match methods: 'serial' (exact SN), 'mac' (MAC PON ±1), 'manual' (UI pin)."""
    __tablename__ = 'genieacs_device_map'
    id = db.Column(db.Integer, primary_key=True)
    onu_id = db.Column(db.Integer, db.ForeignKey('onus.id'), nullable=False)
    device_id = db.Column(db.String(128), nullable=False)  # GenieACS _id
    match_method = db.Column(db.String(20), default='serial')  # serial, mac, manual
    pinned = db.Column(db.Boolean, default=False)  # manual pin — won't be auto-rematched
    last_synced_at = db.Column(db.DateTime, nullable=True)
    last_inform = db.Column(db.DateTime, nullable=True)  # dari GenieACS saat sinkron
    onu = db.relationship('ONU', backref=db.backref('genieacs_map', uselist=False))

    __table_args__ = (
        db.UniqueConstraint('onu_id', name='uq_genieacs_map_onu'),
        db.Index('ix_genieacs_map_device_id', 'device_id'),
    )


class ApiToken(db.Model):
    """Bearer token for REST API v1 — hashed storage, abilities, expiry.
    Abilities: comma-separated scope keys (e.g. 'onus:read,olts:read,onus:write').
    Special '*' = all abilities."""
    __tablename__ = 'api_tokens'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    token_hash = db.Column(db.String(128), nullable=False, unique=True, index=True)
    prefix = db.Column(db.String(12), default='')  # first 8 chars for identification
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    abilities = db.Column(db.String(200), default='*')  # comma-separated or '*'
    expires_at = db.Column(db.DateTime, nullable=True)
    last_used_at = db.Column(db.DateTime, nullable=True)
    last_used_ip = db.Column(db.String(45), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    revoked = db.Column(db.Boolean, default=False)
    user = db.relationship('User', backref=db.backref('api_tokens', lazy=True))

    @staticmethod
    def hash_token(token: str) -> str:
        import hashlib
        return hashlib.sha256(token.encode()).hexdigest()

    @staticmethod
    def generate_token() -> str:
        import secrets
        return 'snms_' + secrets.token_urlsafe(32)

    def has_ability(self, ability: str) -> bool:
        if self.abilities == '*':
            return True
        return ability in (self.abilities or '').split(',')

    def is_valid(self) -> bool:
        if self.revoked:
            return False
        if self.expires_at:
            now = datetime.now(timezone.utc)
            if now.tzinfo:
                now = now.replace(tzinfo=None)
            return self.expires_at > now
        return True


# ════════════════ Pemantauan perangkat SNMP (ala Observium) — tahap 1 ════════════════

class SnmpDevice(db.Model):
    """Perangkat jaringan apa pun yang dipantau lewat SNMP (MikroTik, switch,
    router, server, UPS…). Terpisah dari OLT (yang punya jalur sync sendiri)
    dan dari MikrotikDevice (API RouterOS untuk PPPoE). Hanya membaca."""
    __tablename__ = 'snmp_devices'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    host = db.Column(db.String(255), nullable=False)
    port = db.Column(db.Integer, default=161)
    snmp_version = db.Column(db.String(3), default='2c')          # 1, 2c, 3
    _community_enc = db.Column('community', db.Text, default='')
    v3_user = db.Column(db.String(100), default='')
    v3_level = db.Column(db.String(12), default='authPriv')       # noAuthNoPriv, authNoPriv, authPriv
    v3_auth_proto = db.Column(db.String(10), default='SHA')       # MD5, SHA, SHA256
    _v3_auth_enc = db.Column('v3_auth_pass', db.Text, default='')
    v3_priv_proto = db.Column(db.String(10), default='AES')       # DES, AES, AES256
    _v3_priv_enc = db.Column('v3_priv_pass', db.Text, default='')
    enabled = db.Column(db.Boolean, default=True)
    location = db.Column(db.String(200), default='')
    group_name = db.Column(db.String(100), default='')   # grup bebas (POP, Backbone, Korporat) untuk filter
    notes = db.Column(db.Text, default='')
    flow_ip = db.Column(db.String(64), default='')   # IP pengirim Traffic Flow bila beda dari `host` (kosong = host)
    # Hasil discovery
    sys_name = db.Column(db.String(255), default='')
    sys_descr = db.Column(db.Text, default='')
    sys_object_id = db.Column(db.String(255), default='')
    sys_location = db.Column(db.String(255), default='')
    sys_contact = db.Column(db.String(255), default='')
    vendor = db.Column(db.String(50), default='')
    os_name = db.Column(db.String(50), default='')
    hardware = db.Column(db.String(150), default='')
    os_version = db.Column(db.String(100), default='')
    serial = db.Column(db.String(100), default='')
    discovered_at = db.Column(db.DateTime, nullable=True)
    tables_at = db.Column(db.DateTime, nullable=True)            # ARP/MAC terakhir dibaca (snmp_tables)
    tables_note = db.Column(db.String(255), default='')          # hasil/kesalahan pembacaan ARP/MAC terakhir
    # Hasil poll
    status = db.Column(db.String(10), default='unknown')          # up, down, warn (ping ok, SNMP gagal), unknown
    status_reason = db.Column(db.String(255), default='')
    status_changed_at = db.Column(db.DateTime, nullable=True)
    last_poll_at = db.Column(db.DateTime, nullable=True)
    last_ok_at = db.Column(db.DateTime, nullable=True)
    poll_ms = db.Column(db.Integer, nullable=True)
    ping_ms = db.Column(db.Float, nullable=True)
    uptime_s = db.Column(db.BigInteger, nullable=True)
    cpu_pct = db.Column(db.Float, nullable=True)
    mem_pct = db.Column(db.Float, nullable=True)
    temperature = db.Column(db.Float, nullable=True)
    parent_id = db.Column(db.Integer, nullable=True)              # perangkat induk (dependency): induk turun → alert anak ditahan
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    @staticmethod
    def _dec(v):
        return decrypt_field(v) if v else ''

    @property
    def community(self):
        return self._dec(self._community_enc)

    @community.setter
    def community(self, v):
        self._community_enc = encrypt_field(v or '')

    @property
    def v3_auth_pass(self):
        return self._dec(self._v3_auth_enc)

    @v3_auth_pass.setter
    def v3_auth_pass(self, v):
        self._v3_auth_enc = encrypt_field(v or '')

    @property
    def v3_priv_pass(self):
        return self._dec(self._v3_priv_enc)

    @v3_priv_pass.setter
    def v3_priv_pass(self, v):
        self._v3_priv_enc = encrypt_field(v or '')


class SnmpPort(db.Model):
    """Interface perangkat (IF-MIB). Counter terakhir disimpan untuk menghitung laju."""
    __tablename__ = 'snmp_ports'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('snmp_devices.id', ondelete='CASCADE'), nullable=False, index=True)
    if_index = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(100), default='')        # ifName (atau ifDescr)
    descr = db.Column(db.String(255), default='')       # ifDescr
    alias = db.Column(db.String(255), default='')       # ifAlias (komentar port)
    if_type = db.Column(db.Integer, nullable=True)
    speed_mbps = db.Column(db.Integer, nullable=True)
    mac = db.Column(db.String(20), default='')
    admin_status = db.Column(db.String(10), default='')  # up, down, testing
    oper_status = db.Column(db.String(15), default='')   # up, down, dormant, notPresent, lowerLayerDown…
    status_changed_at = db.Column(db.DateTime, nullable=True)
    ignored = db.Column(db.Boolean, default=False)       # tidak dialert / disembunyikan
    watched = db.Column(db.Boolean, default=False)       # uplink/backbone: dialert (turun, padat, error) & masuk laporan
    deleted = db.Column(db.Boolean, default=False)       # hilang saat discovery terakhir
    in_octets = db.Column(db.BigInteger, nullable=True)
    out_octets = db.Column(db.BigInteger, nullable=True)
    in_errors = db.Column(db.BigInteger, nullable=True)
    out_errors = db.Column(db.BigInteger, nullable=True)
    counter_at = db.Column(db.DateTime, nullable=True)
    in_pkts = db.Column(db.BigInteger, nullable=True)      # counter paket unicast terakhir
    out_pkts = db.Column(db.BigInteger, nullable=True)
    in_pps = db.Column(db.Float, nullable=True)            # paket/detik
    out_pps = db.Column(db.Float, nullable=True)
    # Detail ala Winbox (snmp_portinfo): spesifikasi, modul SFP, optik (redaman), statistik ethernet
    mtu = db.Column(db.Integer, nullable=True)
    duplex = db.Column(db.String(8), nullable=True)
    ip_addrs = db.Column(db.Text, nullable=True)            # JSON ["10.0.0.1/24", …]
    # Billing per port (burstable 95%): pelanggan, komitmen (Mbps), tarif kelebihan per Mbps
    pvid = db.Column(db.Integer, nullable=True)             # VLAN native/PVID (Q-BRIDGE dot1qPvid)
    customer = db.Column(db.String(150), default='')
    commit_mbps = db.Column(db.Float, nullable=True)
    overage_rate = db.Column(db.Float, nullable=True)
    sfp_info = db.Column(db.Text, nullable=True)            # JSON vendor/part/serial/tipe/λ/…
    dom_rx_dbm = db.Column(db.Float, nullable=True)
    dom_tx_dbm = db.Column(db.Float, nullable=True)
    dom_temp_c = db.Column(db.Float, nullable=True)
    dom_volt = db.Column(db.Float, nullable=True)
    dom_bias_ma = db.Column(db.Float, nullable=True)
    dom_rx_loss = db.Column(db.Boolean, nullable=True)
    dom_tx_fault = db.Column(db.Boolean, nullable=True)
    dom_at = db.Column(db.DateTime, nullable=True)
    ext_stats = db.Column(db.Text, nullable=True)           # JSON total counter (FCS, drop, pause, …)
    ext_at = db.Column(db.DateTime, nullable=True)
    in_bps = db.Column(db.Float, nullable=True)
    out_bps = db.Column(db.Float, nullable=True)
    in_err_rate = db.Column(db.Float, nullable=True)     # error/detik
    out_err_rate = db.Column(db.Float, nullable=True)
    __table_args__ = (db.UniqueConstraint('device_id', 'if_index', name='uq_snmp_port_dev_ifindex'),)


class SnmpSensor(db.Model):
    """Sensor kesehatan: suhu, tegangan, kipas, daya, arus, status, CPU, memori."""
    __tablename__ = 'snmp_sensors'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('snmp_devices.id', ondelete='CASCADE'), nullable=False, index=True)
    kind = db.Column(db.String(15), nullable=False)   # temperature, voltage, fan, power, current, cpu, memory, storage, status
    key = db.Column(db.String(120), nullable=False)   # pengenal stabil (oid/index)
    name = db.Column(db.String(150), default='')
    value = db.Column(db.Float, nullable=True)
    unit = db.Column(db.String(10), default='')
    updated_at = db.Column(db.DateTime, nullable=True)
    __table_args__ = (db.UniqueConstraint('device_id', 'kind', 'key', name='uq_snmp_sensor'),)


class SnmpSensorRule(db.Model):
    """Sensor kustom bergaya PRTG: satu metrik + ambang bertingkat (OK → Warning → Down).
    metric: in/out (bit/s), in_err/out_err (error/dtk) untuk port, atau '<kind>:<key>' sensor perangkat
    (mis. cpu:cpu). Status dihitung tiap siklus alert dari sampel `minutes` terakhir."""
    __tablename__ = 'snmp_sensor_rules'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('snmp_devices.id', ondelete='CASCADE'), nullable=False, index=True)
    port_id = db.Column(db.Integer, nullable=True)
    metric = db.Column(db.String(80), nullable=False)
    name = db.Column(db.String(120), default='')
    op = db.Column(db.String(2), default='gt')               # gt: nilai > ambang melanggar; lt: nilai < ambang
    warn = db.Column(db.Float, nullable=True)
    crit = db.Column(db.Float, nullable=True)
    minutes = db.Column(db.Integer, default=10)              # harus melanggar terus selama durasi ini
    enabled = db.Column(db.Boolean, default=True)
    status = db.Column(db.String(10), default='unknown')     # unknown, ok, warning, down
    last_value = db.Column(db.Float, nullable=True)
    status_since = db.Column(db.DateTime, nullable=True)
    created_by = db.Column(db.String(100), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class SnmpNeighbor(db.Model):
    """Tetangga hasil LLDP/CDP/MNDP (snmp_topology) — diperbarui tiap discovery."""
    __tablename__ = 'snmp_neighbors'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('snmp_devices.id', ondelete='CASCADE'), nullable=False, index=True)
    port_id = db.Column(db.Integer, nullable=True)            # SnmpPort lokal
    local_if_index = db.Column(db.Integer, nullable=True)
    protocol = db.Column(db.String(8), default='lldp')         # lldp, cdp, mndp
    remote_name = db.Column(db.String(255), default='')
    remote_chassis = db.Column(db.String(100), default='')
    remote_port = db.Column(db.String(150), default='')
    remote_port_descr = db.Column(db.String(255), default='')
    remote_platform = db.Column(db.String(255), default='')
    remote_ip = db.Column(db.String(45), default='')
    remote_device_id = db.Column(db.Integer, nullable=True)    # cocok ke SnmpDevice terdaftar
    remote_port_id = db.Column(db.Integer, nullable=True)
    first_seen = db.Column(db.DateTime, nullable=True)
    last_seen = db.Column(db.DateTime, nullable=True)


class SnmpOltLink(db.Model):
    """Penautan manual "port perangkat SNMP ini terhubung ke OLT" untuk topologi (OLT tidak mengirim LLDP)."""
    __tablename__ = 'snmp_olt_links'
    id = db.Column(db.Integer, primary_key=True)
    olt_id = db.Column(db.Integer, db.ForeignKey('olts.id', ondelete='CASCADE'), nullable=False, index=True)
    device_id = db.Column(db.Integer, db.ForeignKey('snmp_devices.id', ondelete='CASCADE'), nullable=False, index=True)
    port_id = db.Column(db.Integer, nullable=True)
    created_by = db.Column(db.String(100), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class SnmpArp(db.Model):
    """Tabel ARP perangkat SNMP (snmp_tables) — IP ↔ MAC per interface, dengan riwayat terakhir terlihat."""
    __tablename__ = 'snmp_arp'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('snmp_devices.id', ondelete='CASCADE'), nullable=False, index=True)
    port_id = db.Column(db.Integer, nullable=True)
    if_index = db.Column(db.Integer, nullable=True)
    ip = db.Column(db.String(45), nullable=False, index=True)
    mac = db.Column(db.String(17), default='', index=True)
    first_seen = db.Column(db.DateTime, nullable=True)
    last_seen = db.Column(db.DateTime, nullable=True)


class SnmpFdb(db.Model):
    """Tabel MAC (forwarding database) switch/bridge — MAC dipelajari di port mana, per VLAN."""
    __tablename__ = 'snmp_fdb'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('snmp_devices.id', ondelete='CASCADE'), nullable=False, index=True)
    port_id = db.Column(db.Integer, nullable=True, index=True)
    if_index = db.Column(db.Integer, nullable=True)
    vlan = db.Column(db.Integer, nullable=True)
    mac = db.Column(db.String(17), nullable=False, index=True)
    first_seen = db.Column(db.DateTime, nullable=True)
    last_seen = db.Column(db.DateTime, nullable=True)


class SnmpVlan(db.Model):
    """VLAN yang dikonfigurasi di switch/bridge (Q-BRIDGE-MIB): nama + port anggota (ifIndex)."""
    __tablename__ = 'snmp_vlans'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('snmp_devices.id', ondelete='CASCADE'), nullable=False, index=True)
    vlan = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(64), default='')
    egress = db.Column(db.Text, default='[]')       # JSON [ifIndex…] — semua anggota
    untagged = db.Column(db.Text, default='[]')     # JSON [ifIndex…] — anggota untagged


class SnmpMaintenance(db.Model):
    """Jendela pemeliharaan perangkat SNMP: selama aktif, alert perangkat itu ditahan.
    device_id NULL = semua perangkat SNMP. Waktu disimpan UTC naif."""
    __tablename__ = 'snmp_maintenance'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, nullable=True, index=True)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False, index=True)
    reason = db.Column(db.String(300), default='')
    created_by = db.Column(db.String(100), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class SnmpEvent(db.Model):
    """Log kejadian perangkat (ala eventlog Observium): naik/turun, reboot, port berubah."""
    __tablename__ = 'snmp_events'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('snmp_devices.id', ondelete='CASCADE'), nullable=False, index=True)
    kind = db.Column(db.String(20), nullable=False)   # device_down, device_up, reboot, port_down, port_up, discovery
    severity = db.Column(db.String(10), default='info')
    message = db.Column(db.String(500), default='')
    port_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class SnmpSample(db.Model):
    """Sampel mentah per poll (5 menit) — disimpan ±48 jam untuk grafik 6j/24j.
    metric: in/out (bit/s), in_err/out_err (error/dtk) untuk port;
    cpu/mem/<kind>:<key> sensor untuk perangkat (port_id NULL)."""
    __tablename__ = 'snmp_samples'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, nullable=False)
    port_id = db.Column(db.Integer, nullable=True)
    metric = db.Column(db.String(80), nullable=False)
    ts = db.Column(db.DateTime, nullable=False)
    value = db.Column(db.Float, nullable=False)
    __table_args__ = (db.Index('ix_snmp_samples_series', 'device_id', 'port_id', 'metric', 'ts'),
                      db.Index('ix_snmp_samples_ts', 'ts'))


class SnmpSampleHourly(db.Model):
    """Ringkasan per jam (ala RRA Observium) — disimpan ±13 bulan untuk 7h/30h/1th
    dan laporan bulanan. avg = total / count."""
    __tablename__ = 'snmp_samples_hourly'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, nullable=False)
    port_id = db.Column(db.Integer, nullable=True)
    metric = db.Column(db.String(80), nullable=False)
    hour = db.Column(db.DateTime, nullable=False)
    total = db.Column(db.Float, default=0.0)
    count = db.Column(db.Integer, default=0)
    vmax = db.Column(db.Float, nullable=True)
    vmin = db.Column(db.Float, nullable=True)
    __table_args__ = (db.UniqueConstraint('device_id', 'port_id', 'metric', 'hour', name='uq_snmp_hourly'),
                      db.Index('ix_snmp_hourly_hour', 'hour'))


# ════════════════ Keamanan MikroTik (log login via API RouterOS) ════════════════

class MtSecState(db.Model):
    """Posisi baca log per router (`.id` terakhir) + status pembacaan."""
    __tablename__ = 'mt_sec_state'
    device_id = db.Column(db.Integer, primary_key=True)
    last_id = db.Column(db.Integer, nullable=True)        # .id log RouterOS (hex → int) terakhir yang diproses
    baseline_at = db.Column(db.DateTime, nullable=True)   # pertama kali log dibaca (mulai masa belajar)
    last_read_at = db.Column(db.DateTime, nullable=True)
    last_error = db.Column(db.String(300), default='')


class MtSecEvent(db.Model):
    """Peristiwa keamanan dari log router: login_fail | login_ok | user_change."""
    __tablename__ = 'mt_sec_events'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, index=True, nullable=False)
    kind = db.Column(db.String(20), index=True, nullable=False)
    user = db.Column(db.String(80), default='')
    ip = db.Column(db.String(64), index=True, default='')
    via = db.Column(db.String(20), default='')
    by = db.Column(db.String(120), default='')            # user_change: pelaku
    new_ip = db.Column(db.Boolean, default=False)         # login_ok dari IP yang belum pernah dipakai user ini
    message = db.Column(db.String(300), default='')
    log_time = db.Column(db.String(40), default='')       # waktu mentah dari router
    created_at = db.Column(db.DateTime, index=True, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    alerted = db.Column(db.Boolean, default=False)        # sudah dievaluasi untuk alert sekali-kirim


class MtSecLogin(db.Model):
    """IP yang pernah dipakai login berhasil per (router, user) — dasar deteksi 'login dari IP baru'."""
    __tablename__ = 'mt_sec_logins'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, index=True, nullable=False)
    user = db.Column(db.String(80), default='')
    ip = db.Column(db.String(64), default='')
    via = db.Column(db.String(20), default='')
    first_seen = db.Column(db.DateTime)
    last_seen = db.Column(db.DateTime)
    count = db.Column(db.Integer, default=1)
    __table_args__ = (db.UniqueConstraint('device_id', 'user', 'ip', name='uq_mt_sec_login'),)


class MtSecAlert(db.Model):
    """Alert keamanan yang terbuka/selesai (dedupe per router+jenis+kunci IP/user)."""
    __tablename__ = 'mt_sec_alerts'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, index=True, nullable=False)
    kind = db.Column(db.String(30), nullable=False)       # bruteforce | distributed | success_after_fail | new_ip | user_change
    key = db.Column(db.String(160), default='')
    severity = db.Column(db.String(10), default='warning')
    count = db.Column(db.Integer, default=0)
    detail = db.Column(db.String(500), default='')
    opened_at = db.Column(db.DateTime)
    last_seen_at = db.Column(db.DateTime)
    closed_at = db.Column(db.DateTime, nullable=True)
    ai_text = db.Column(db.Text, default='')


class MtSecAudit(db.Model):
    """Hasil audit konfigurasi keamanan terakhir per router (temuan JSON)."""
    __tablename__ = 'mt_sec_audits'
    device_id = db.Column(db.Integer, primary_key=True)
    at = db.Column(db.DateTime)
    score = db.Column(db.Integer, nullable=True)
    version = db.Column(db.String(60), default='')
    findings = db.Column(db.Text, default='[]')
    error = db.Column(db.String(300), default='')


class MtSecFwSeen(db.Model):
    """IP di address-list firewall yang dipantau (mis. nms-portscan) — dasar alert 'IP baru masuk daftar'."""
    __tablename__ = 'mt_sec_fw_seen'
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, index=True, nullable=False)
    list = db.Column(db.String(64), default='')
    address = db.Column(db.String(64), default='')
    comment = db.Column(db.String(200), default='')
    first_seen = db.Column(db.DateTime)
    last_seen = db.Column(db.DateTime)
    times = db.Column(db.Integer, default=1)
    __table_args__ = (db.UniqueConstraint('device_id', 'list', 'address', name='uq_mt_sec_fw'),)


# ==================== TRAFIK APLIKASI (NetFlow / IPFIX) ====================

class FlowBucket(db.Model):
    """Volume per layanan per 5 menit (`ts` = batas bucket, UTC naif). down = ke pelanggan, up = dari pelanggan."""
    __tablename__ = 'flow_buckets'
    id = db.Column(db.Integer, primary_key=True)
    ts = db.Column(db.DateTime, nullable=False, index=True)
    exporter = db.Column(db.String(45), nullable=False, default='')
    if_index = db.Column(db.Integer, nullable=False, default=0)   # interface sisi internet (SNMP ifIndex)
    service = db.Column(db.String(80), nullable=False)
    down_bytes = db.Column(db.BigInteger, default=0)
    up_bytes = db.Column(db.BigInteger, default=0)
    __table_args__ = (db.UniqueConstraint('ts', 'exporter', 'if_index', 'service', name='uq_flow_bucket'),)


class FlowServiceHour(db.Model):
    """Rollup per jam dari FlowBucket (retensi lebih panjang)."""
    __tablename__ = 'flow_service_hours'
    id = db.Column(db.Integer, primary_key=True)
    ts = db.Column(db.DateTime, nullable=False, index=True)
    exporter = db.Column(db.String(45), nullable=False, default='')
    if_index = db.Column(db.Integer, nullable=False, default=0)
    service = db.Column(db.String(80), nullable=False)
    down_bytes = db.Column(db.BigInteger, default=0)
    up_bytes = db.Column(db.BigInteger, default=0)
    __table_args__ = (db.UniqueConstraint('ts', 'exporter', 'if_index', 'service', name='uq_flow_service_hour'),)


class FlowClientHour(db.Model):
    """Volume per pelanggan (IP lokal) per layanan per jam."""
    __tablename__ = 'flow_client_hours'
    id = db.Column(db.Integer, primary_key=True)
    ts = db.Column(db.DateTime, nullable=False, index=True)
    exporter = db.Column(db.String(45), nullable=False, default='')
    client_ip = db.Column(db.String(45), nullable=False, index=True)
    service = db.Column(db.String(80), nullable=False)
    down_bytes = db.Column(db.BigInteger, default=0)
    up_bytes = db.Column(db.BigInteger, default=0)
    __table_args__ = (db.UniqueConstraint('ts', 'exporter', 'client_ip', 'service', name='uq_flow_client_hour'),)


class FlowIpName(db.Model):
    """Cache IP tujuan → nama → layanan (dari DNS cache MikroTik atau reverse DNS)."""
    __tablename__ = 'flow_ip_names'
    ip = db.Column(db.String(45), primary_key=True)
    name = db.Column(db.String(255), default='')
    service = db.Column(db.String(80), default='')
    source = db.Column(db.String(8), default='')   # dns | rdns | none
    resolved_at = db.Column(db.DateTime)


class FlowExporter(db.Model):
    """Router yang mengirim paket flow (dikenali dari IP sumber UDP)."""
    __tablename__ = 'flow_exporters'
    ip = db.Column(db.String(45), primary_key=True)
    last_seen = db.Column(db.DateTime)
    version = db.Column(db.Integer, default=0)
    packets = db.Column(db.BigInteger, default=0)
    flows = db.Column(db.BigInteger, default=0)
