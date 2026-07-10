import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../widgets/status_badge.dart';
import 'onu_edit_screen.dart';

class OnuDetailScreen extends StatefulWidget {
  final Map<String, dynamic> onu;
  const OnuDetailScreen({super.key, required this.onu});

  @override
  State<OnuDetailScreen> createState() => _OnuDetailScreenState();
}

class _OnuDetailScreenState extends State<OnuDetailScreen> {
  Map<String, dynamic>? _detail;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadDetail();
  }

  Future<void> _loadDetail() async {
    final id = widget.onu['id'];
    if (id == null) { setState(() => _loading = false); return; }
    final api = ApiService();
    final result = await api.getOnuDetail(id);
    if (mounted) {
      setState(() { _detail = result; _loading = false; });
    }
  }

  Future<void> _doAction(String action) async {
    final id = widget.onu['id'];
    if (id == null) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Konfirmasi $action'),
        content: Text('Yakin ingin $action ONU ini?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(action.toUpperCase())),
        ],
      ),
    );

    if (confirm != true) return;

    final api = ApiService();
    final result = await api.onuAction(id, action);
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(result['success'] == true ? '$action berhasil' : result['error'] ?? '$action gagal'),
        backgroundColor: result['success'] == true ? const Color(0xFF22D3A0) : const Color(0xFFFF5757),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final onu = _detail ?? widget.onu;
    final status = (onu['status'] ?? 'unknown').toString().toLowerCase();
    final name = onu['name'] ?? '-';
    final serial = onu['serial_number'] ?? '-';
    final type = onu['actual_type'] ?? onu['onu_type'] ?? '-';
    final rxPower = onu['rx_power'];
    final distance = onu['distance'];

    return Scaffold(
      appBar: AppBar(
        title: Text(name != '-' ? name : 'ONU Detail'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit),
            onPressed: () async {
              final updated = await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => OnuEditScreen(onu: _detail ?? widget.onu)),
              );
              if (updated == true) _loadDetail(); // Refresh after edit
            },
            tooltip: 'Edit ONU',
          ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadDetail),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadDetail,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                // Status header
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      children: [
                        StatusBadge(status: status, large: true),
                        const SizedBox(height: 16),
                        Text(name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                        Text(serial, style: const TextStyle(color: Colors.white54)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Info grid
                _infoCard('Info', [
                  _infoRow('Type', type),
                  _infoRow('Status', status),
                  if (rxPower != null) _infoRow('RX Power', '${rxPower.toStringAsFixed(2)} dBm'),
                  if (distance != null) _infoRow('Distance', '${distance}m'),
                  _infoRow('OLT', onu['olt_name'] ?? '-'),
                  _infoRow('Port', 'gpon-onu_${onu['frame'] ?? 1}/${onu['slot'] ?? 1}/${onu['port'] ?? 1}:${onu['onu_id'] ?? '?'}'),
                ]),
                const SizedBox(height: 16),

                // Actions
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Actions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _actionButton('Reboot', Icons.restart_alt, const Color(0xFFFBB040)),
                            _actionButton('Reset', Icons.factory, const Color(0xFFFF5757)),
                            _actionButton('Clear Config', Icons.cleaning_services, const Color(0xFF8B9BB8)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  ),
              ],
              ),
            ),
    );
  }

  Widget _infoCard(String title, List<Widget> children) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const Divider(),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(width: 100, child: Text(label, style: const TextStyle(color: Colors.white54, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }

  Widget _actionButton(String label, IconData icon, Color color) {
    return FilledButton.tonalIcon(
      onPressed: () => _doAction(label.toLowerCase().replaceAll(' ', '-')),
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: FilledButton.styleFrom(
        foregroundColor: color,
        backgroundColor: color.withOpacity(0.1),
      ),
    );
  }
}
