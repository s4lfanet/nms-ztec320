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
    users = db.relationship('User', backref='role', lazy=True)

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
    'customization': 'Customization',
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
    is_super_admin = db.Column(db.Boolean, default=False)
    phone = db.Column(db.String(30), default='')  # phone number for WA notifications
    profile_image = db.Column(db.String(256), default='default.png')
    sidebar_name = db.Column(db.String(100), default='FiberNMS')
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
    snmp_community = db.Column(db.String(100), default='public')
    snmp_community_write = db.Column(db.String(100), default='')
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
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    @property
    def cli_password(self):
        return decrypt_field(self._cli_password_enc)

    @cli_password.setter
    def cli_password(self, value):
        self._cli_password_enc = encrypt_field(value)


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
    # Target roles (empty = all)
    target_roles = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class AlertHistory(db.Model):
    """Track sent alerts to avoid duplicates"""
    __tablename__ = 'alert_history'
    id = db.Column(db.Integer, primary_key=True)
    onu_id = db.Column(db.Integer, nullable=True)
    olt_id = db.Column(db.Integer, nullable=True)
    alert_type = db.Column(db.String(50), nullable=False)  # offline, dyinggasp, los, rx_power, unregistered
    last_value = db.Column(db.String(50), default='')
    last_alert_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    first_seen_at = db.Column(db.DateTime, nullable=True)  # first detection time (for debounce)

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

class FTTHOTB(db.Model):
    """OTB/ODF at server room — top of FTTH chain, fed by OLT PON port"""
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
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    olt = db.relationship('OLT', backref=db.backref('ftth_otbs', lazy=True))


class FTTHODC(db.Model):
    """ODC (Optical Distribution Cabinet) — fed by core from OTB/ODF"""
    __tablename__ = 'ftth_odc'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    model = db.Column(db.String(100), default='')
    location = db.Column(db.String(256), default='')
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    otb_id = db.Column(db.Integer, db.ForeignKey('ftth_otb.id'), nullable=True)
    otb_core_number = db.Column(db.Integer, default=1)  # which core from OTB
    total_cores = db.Column(db.Integer, default=8)
    splitter_model = db.Column(db.String(50), default='')  # e.g. 1:8, 1:16
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    otb = db.relationship('FTTHOTB', backref=db.backref('odcs', lazy=True, cascade='all, delete-orphan'))


class FTTHODP(db.Model):
    """ODP (Optical Distribution Point) — fed by core from ODC, has splitter + ports for ONUs"""
    __tablename__ = 'ftth_odp'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    model = db.Column(db.String(100), default='')
    location = db.Column(db.String(256), default='')
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    odc_id = db.Column(db.Integer, db.ForeignKey('ftth_odc.id'), nullable=True)
    odc_core_number = db.Column(db.Integer, default=1)  # which core from ODC
    total_ports = db.Column(db.Integer, default=8)
    splitter_model = db.Column(db.String(50), default='')  # e.g. 1:4, 1:8, 1:16, 1:32
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    odc = db.relationship('FTTHODC', backref=db.backref('odps', lazy=True, cascade='all, delete-orphan'))


class FTTHODPPort(db.Model):
    """Individual port on an ODP — links to a customer ONU"""
    __tablename__ = 'ftth_odp_port'
    id = db.Column(db.Integer, primary_key=True)
    odp_id = db.Column(db.Integer, db.ForeignKey('ftth_odp.id'), nullable=False)
    port_number = db.Column(db.Integer, nullable=False)
    onu_id = db.Column(db.Integer, db.ForeignKey('onus.id'), nullable=True)
    status = db.Column(db.String(10), default='available')  # available, used
    customer_name = db.Column(db.String(150), default='')
    customer_phone = db.Column(db.String(50), default='')
    description = db.Column(db.String(256), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    odp = db.relationship('FTTHODP', backref=db.backref('ports', lazy=True, cascade='all, delete-orphan'))
    onu = db.relationship('ONU', backref=db.backref('odp_port', uselist=False))


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
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.Index('ix_action_logs_created_at', 'created_at'),
        db.Index('ix_action_logs_user_id', 'user_id'),
        db.Index('ix_action_logs_category', 'category'),
    )
