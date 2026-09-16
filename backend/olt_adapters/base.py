"""Abstract base class for vendor-specific OLT adapters."""

from models import OLT
from .normalized import RackData


class BaseOLTAdapter:
    """Abstract base for vendor-specific OLT data collection.

    Each vendor (ZTE, HSGQ, Raisecom, etc.) implements this interface.
    The adapter is responsible for collecting data via SNMP/CLI and
    returning it in the normalized RackData format.
    """

    vendor: str = ''               # e.g. 'zte', 'hsgq', 'raisecom'
    supported_models: list = []    # e.g. ['C300', 'C320', 'C300 Mini']
    cli_protocol: str = 'telnet'   # 'telnet' or 'ssh'

    def __init__(self, olt: OLT):
        self.olt = olt

    def get_rack_data(self, refresh: bool = False) -> RackData:
        """Collect and return normalized rack data for this OLT.

        Args:
            refresh: If True, force a fresh poll (bypass cache).

        Returns:
            RackData with supported=True if collection succeeds.
        """
        raise NotImplementedError

    def collect_onus(self) -> list:
        """Collect ONU/ONT data via SNMP + CLI.

        Returns:
            List of ONU dicts in normalized format.
        """
        raise NotImplementedError

    def collect_chassis(self) -> dict:
        """Collect card/slot/fan/PSU data via SNMP and/or CLI.

        Returns:
            Dict with 'slots', 'fans', 'psus' keys.
        """
        raise NotImplementedError

    def poll_olt(self, progress_cb=None) -> dict:
        """Full sync: collect system, ONU, chassis, config data.

        Returns dict compatible with sync_helper.save_sync_result():
            {'system': {}, 'onus': [], 'chassis': {}, 'success': bool, 'errors': []}
        """
        raise NotImplementedError

    def normalize_port(self, raw: dict) -> dict:
        """Map vendor-specific port fields to normalized CardPort dict."""
        raise NotImplementedError

    def normalize_slot(self, raw: dict) -> dict:
        """Map vendor-specific slot fields to normalized SlotCard dict."""
        raise NotImplementedError

    def is_model_supported(self) -> bool:
        """Check if this adapter supports the OLT's specific model."""
        if not self.supported_models:
            return True  # Adapter supports all models for this vendor
        model = (self.olt.model or '').upper()
        return any(m.upper() in model for m in self.supported_models)
