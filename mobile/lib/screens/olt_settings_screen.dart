import 'package:flutter/material.dart';
import '../services/api_service.dart';

class OltSettingsScreen extends StatefulWidget {
  const OltSettingsScreen({super.key});

  @override
  State<OltSettingsScreen> createState() => _OltSettingsScreenState();
}

class _OltSettingsScreenState extends State<OltSettingsScreen> {
  List<dynamic> _olts = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadOlts();
  }

  Future<void> _loadOlts() async {
    final api = ApiService();
    final result = await api.getOlts();
    if (mounted) setState(() { _olts = result; _loading = false; });
  }

  Future<void> _syncOlt(int oltId) async {
    final api = ApiService();
    final result = await api.syncOlt(oltId);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(result['success'] == true ? 'Sync started' : result['error'] ?? 'Sync failed'),
        backgroundColor: result['success'] == true ? const Color(0xFF22D3A0) : const Color(0xFFFF5757),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('OLT Settings')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _olts.isEmpty
              ? const Center(child: Text('Belum ada OLT', style: TextStyle(color: Colors.white54)))
              : RefreshIndicator(
                  onRefresh: _loadOlts,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _olts.length,
                    itemBuilder: (context, index) {
                      final olt = _olts[index];
                      final isOnline = olt['is_online'] == true;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    width: 10, height: 10,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: isOnline ? const Color(0xFF22D3A0) : const Color(0xFFFF5757),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(olt['name'] ?? '-', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                        Text('${olt['ip_address']} • ${olt['vendor'] ?? 'ZTE'} ${olt['model'] ?? 'C320'}',
                                            style: const TextStyle(color: Colors.white54, fontSize: 12)),
                                      ],
                                    ),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.sync),
                                    onPressed: () => _syncOlt(olt['id']),
                                    tooltip: 'Sync',
                                  ),
                                ],
                              ),
                              const Divider(),
                              Row(
                                children: [
                                  _stat('ONU', '${olt['total_onu'] ?? 0}'),
                                  _stat('Online', '${olt['online_onu'] ?? 0}'),
                                  _stat('Offline', '${olt['offline_onu'] ?? 0}'),
                                  _stat('LOS', '${olt['los_onu'] ?? 0}'),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  Widget _stat(String label, String value) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          Text(label, style: const TextStyle(color: Colors.white54, fontSize: 11)),
        ],
      ),
    );
  }
}
