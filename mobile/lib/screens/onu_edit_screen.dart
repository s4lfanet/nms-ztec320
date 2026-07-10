import 'package:flutter/material.dart';
import '../services/api_service.dart';

class OnuEditScreen extends StatefulWidget {
  final Map<String, dynamic> onu;
  const OnuEditScreen({super.key, required this.onu});

  @override
  State<OnuEditScreen> createState() => _OnuEditScreenState();
}

class _OnuEditScreenState extends State<OnuEditScreen> {
  late TextEditingController _nameController;
  late TextEditingController _descController;
  late TextEditingController _pppoeController;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.onu['name'] ?? '');
    _descController = TextEditingController(text: widget.onu['description'] ?? '');
    _pppoeController = TextEditingController(text: widget.onu['pppoe_username'] ?? '');
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    _pppoeController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final api = ApiService();
    final data = <String, dynamic>{
      'name': _nameController.text.trim(),
      'description': _descController.text.trim(),
    };
    if (_pppoeController.text.trim().isNotEmpty) {
      data['pppoe_username'] = _pppoeController.text.trim();
    }

    final result = await api.updateOnu(widget.onu['id'], data);
    if (!mounted) return;

    setState(() => _saving = false);

    if (result['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ONU berhasil diupdate'), backgroundColor: Color(0xFF22D3A0)),
      );
      Navigator.pop(context, true); // Return true to indicate success
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result['error'] ?? result['message'] ?? 'Gagal update'), backgroundColor: const Color(0xFFFF5757)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final serial = widget.onu['serial_number'] ?? '-';
    final status = (widget.onu['status'] ?? 'unknown').toString();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit ONU'),
        actions: [
          TextButton.icon(
            onPressed: _saving ? null : _save,
            icon: _saving
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF00D9C0)))
                : const Icon(Icons.save, color: Color(0xFF00D9C0)),
            label: Text(_saving ? 'Saving...' : 'Save', style: const TextStyle(color: Color(0xFF00D9C0))),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ONU Info Header
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    width: 48, height: 48,
                    decoration: BoxDecoration(
                      color: _statusColor(status).withOpacity(0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.router, color: _statusColor(status)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(serial, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        Text('Status: ${status.toUpperCase()}', style: TextStyle(color: _statusColor(status), fontSize: 12)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Name field
          const Text('Nama ONU', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 8),
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              hintText: 'Contoh: ODP-RW03-01',
              prefixIcon: const Icon(Icons.label_outline, size: 20),
              suffixIcon: _nameController.text.isNotEmpty
                  ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => _nameController.clear())
                  : null,
            ),
            textCapitalization: TextCapitalization.characters,
          ),
          const SizedBox(height: 20),

          // Description field
          const Text('Deskripsi', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 8),
          TextField(
            controller: _descController,
            decoration: const InputDecoration(
              hintText: 'Contoh: Pelanggan RT03',
              prefixIcon: Icon(Icons.description_outlined, size: 20),
            ),
            maxLines: 2,
          ),
          const SizedBox(height: 20),

          // PPPoE field
          const Text('PPPoE Username (opsional)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 8),
          TextField(
            controller: _pppoeController,
            decoration: const InputDecoration(
              hintText: 'Username PPPoE',
              prefixIcon: Icon(Icons.person_outline, size: 20),
            ),
          ),
          const SizedBox(height: 32),

          // Save button
          FilledButton(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              backgroundColor: const Color(0xFF00D9C0),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: _saving
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Simpan Perubahan', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'online': return const Color(0xFF22D3A0);
      case 'offline': return const Color(0xFF8B9BB8);
      case 'los': return const Color(0xFFFF5757);
      case 'dyinggasp': return const Color(0xFFFBB040);
      default: return const Color(0xFF8B9BB8);
    }
  }
}
