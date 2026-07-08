import 'package:flutter/material.dart';

class StatusBadge extends StatelessWidget {
  final String status;
  final bool large;

  const StatusBadge({super.key, required this.status, this.large = false});

  @override
  Widget build(BuildContext context) {
    final color = _getColor(status);
    final label = _getLabel(status);
    final size = large ? 14.0 : 11.0;
    final padding = large
        ? const EdgeInsets.symmetric(horizontal: 16, vertical: 8)
        : const EdgeInsets.symmetric(horizontal: 10, vertical: 4);

    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(large ? 24 : 16),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: large ? 10 : 7,
            height: large ? 10 : 7,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color),
          ),
          SizedBox(width: large ? 8 : 5),
          Text(label, style: TextStyle(color: color, fontSize: size, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Color _getColor(String status) {
    switch (status.toLowerCase()) {
      case 'online': return const Color(0xFF22D3A0);
      case 'offline': return const Color(0xFF8B9BB8);
      case 'los': return const Color(0xFFFF5757);
      case 'dyinggasp': return const Color(0xFFFBB040);
      default: return const Color(0xFF8B9BB8);
    }
  }

  String _getLabel(String status) {
    switch (status.toLowerCase()) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      case 'los': return 'LOS';
      case 'dyinggasp': return 'DyingGasp';
      default: return status;
    }
  }
}
