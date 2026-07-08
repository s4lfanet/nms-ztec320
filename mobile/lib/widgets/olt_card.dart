import 'package:flutter/material.dart';

class OltCard extends StatelessWidget {
  final Map<String, dynamic> olt;
  const OltCard({super.key, required this.olt});

  @override
  Widget build(BuildContext context) {
    final name = olt['name'] ?? '-';
    final ip = olt['ip_address'] ?? '-';
    final isOnline = olt['is_online'] == true;
    final totalOnu = olt['total_onu'] ?? 0;
    final onlineOnu = olt['online_onu'] ?? 0;
    final temp = olt['temperature'];

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () {
          // Navigate to OLT detail
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 8, height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isOnline ? const Color(0xFF22D3A0) : const Color(0xFFFF5757),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  ),
                  if (temp != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFBB040).withOpacity(0.15),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text('🌡 $temp°C', style: const TextStyle(fontSize: 11, color: Color(0xFFFBB040))),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(ip, style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 12)),
              const SizedBox(height: 12),

              // ONU stats bar
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: totalOnu > 0 ? onlineOnu / totalOnu : 0,
                  backgroundColor: Colors.white.withOpacity(0.05),
                  valueColor: const AlwaysStoppedAnimation(Color(0xFF22D3A0)),
                  minHeight: 6,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('$onlineOnu / $totalOnu online', style: const TextStyle(fontSize: 12, color: Colors.white54)),
                  Text(
                    '${totalOnu > 0 ? (onlineOnu / totalOnu * 100).round() : 0}%',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF22D3A0)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
