import 'package:flutter/material.dart';
import 'status_badge.dart';

class OnuListTile extends StatelessWidget {
  final Map<String, dynamic> onu;
  final VoidCallback onTap;

  const OnuListTile({super.key, required this.onu, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final name = onu['name'] ?? '-';
    final serial = onu['serial_number'] ?? '-';
    final status = (onu['status'] ?? 'unknown').toString();
    final rxPower = onu['rx_power'];
    final type = onu['actual_type'] ?? '';

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              // Status indicator
              Container(
                width: 4,
                height: 48,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(2),
                  color: _statusColor(status),
                ),
              ),
              const SizedBox(width: 12),

              // Info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name != '-' ? name : serial,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      type.isNotEmpty ? '$type • $serial' : serial,
                      style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),

              // RX Power
              if (rxPower != null && status.toLowerCase() == 'online')
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _rxColor(rxPower).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${rxPower.toStringAsFixed(1)} dBm',
                    style: TextStyle(color: _rxColor(rxPower), fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),

              const SizedBox(width: 8),

              // Status badge
              StatusBadge(status: status),
            ],
          ),
        ),
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'online': return const Color(0xFF22D3A0);
      case 'los': return const Color(0xFFFF5757);
      case 'dyinggasp': return const Color(0xFFFBB040);
      default: return const Color(0xFF8B9BB8);
    }
  }

  Color _rxColor(dynamic rx) {
    if (rx == null) return const Color(0xFF8B9BB8);
    final val = rx is double ? rx : double.tryParse(rx.toString()) ?? -999;
    if (val >= -26) return const Color(0xFF22D3A0);
    if (val >= -28) return const Color(0xFFFBB040);
    return const Color(0xFFFF5757);
  }
}
