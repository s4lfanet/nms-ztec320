import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../widgets/status_badge.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<dynamic> _notifications = [];
  bool _loading = true;
  int _unreadCount = 0;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  Future<void> _loadNotifications() async {
    setState(() => _loading = true);
    final api = ApiService();
    final result = await api.getNotifications(limit: 50);
    if (mounted) {
      setState(() {
        _notifications = result['notifications'] ?? [];
        _unreadCount = result['unread_count'] ?? 0;
        _loading = false;
      });
    }
  }

  Future<void> _acknowledge(int id) async {
    final api = ApiService();
    await api.acknowledgeNotification(id);
    _loadNotifications();
  }

  Future<void> _acknowledgeAll() async {
    final api = ApiService();
    await api.acknowledgeAllNotifications();
    _loadNotifications();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Semua alert telah di-acknowledge'), backgroundColor: Color(0xFF22D3A0)),
      );
    }
  }

  Future<void> _markAllRead() async {
    final api = ApiService();
    await api.markAllNotificationsRead();
    _loadNotifications();
  }

  Color _severityColor(String severity) {
    switch (severity.toLowerCase()) {
      case 'critical': return const Color(0xFFFF5757);
      case 'warning': return const Color(0xFFFBB040);
      case 'info': return const Color(0xFF00D9C0);
      default: return const Color(0xFF8B9BB8);
    }
  }

  IconData _categoryIcon(String category) {
    switch (category) {
      case 'offline':
      case 'offline_batch': return Icons.wifi_off;
      case 'dyinggasp': return Icons.battery_alert;
      case 'los': return Icons.signal_wifi_off;
      case 'rx_power':
      case 'rx_power_low':
      case 'signal_drop_batch': return Icons.signal_cellular_alt_1_bar;
      case 'recovery':
      case 'recovery_batch': return Icons.check_circle;
      case 'unconfigured':
      case 'unconfig': return Icons.device_unknown;
      case 'olt_offline': return Icons.dns;
      case 'olt_cpu_high': return Icons.memory;
      case 'olt_mem_high': return Icons.storage;
      case 'olt_temp_high': return Icons.thermostat;
      default: return Icons.notifications;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Text('Notifications'),
            if (_unreadCount > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF5757),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('$_unreadCount', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white)),
              ),
            ],
          ],
        ),
        actions: [
          if (_notifications.isNotEmpty)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert),
              onSelected: (v) {
                if (v == 'ack_all') _acknowledgeAll();
                if (v == 'read_all') _markAllRead();
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'ack_all', child: Text('Acknowledge All')),
                const PopupMenuItem(value: 'read_all', child: Text('Mark All Read')),
              ],
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _notifications.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.notifications_off, size: 64, color: Colors.white.withOpacity(0.2)),
                      const SizedBox(height: 16),
                      const Text('Tidak ada notifikasi', style: TextStyle(color: Colors.white54, fontSize: 16)),
                      const SizedBox(height: 8),
                      const Text('Semua alert sudah ditangani', style: TextStyle(color: Colors.white38, fontSize: 13)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadNotifications,
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: _notifications.length,
                    itemBuilder: (context, index) {
                      final n = _notifications[index];
                      final severity = (n['severity'] ?? 'info').toString();
                      final category = (n['category'] ?? '').toString();
                      final isRead = n['is_read'] == true;
                      final isAcked = n['acknowledged'] == true;
                      final color = _severityColor(severity);

                      return Dismissible(
                        key: Key('notif_${n['id']}'),
                        direction: DismissDirection.endToStart,
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 20),
                          color: const Color(0xFF22D3A0),
                          child: const Icon(Icons.check_circle, color: Colors.white),
                        ),
                        onDismissed: (_) => _acknowledge(n['id']),
                        child: Card(
                          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          color: isRead ? null : color.withOpacity(0.05),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: () {
                              if (!isRead) {
                                final api = ApiService();
                                api.markNotificationRead(n['id']);
                              }
                            },
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Severity indicator
                                  Container(
                                    width: 40,
                                    height: 40,
                                    decoration: BoxDecoration(
                                      color: color.withOpacity(0.15),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Icon(_categoryIcon(category), color: color, size: 20),
                                  ),
                                  const SizedBox(width: 12),

                                  // Content
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                n['title'] ?? '-',
                                                style: TextStyle(
                                                  fontWeight: isRead ? FontWeight.w500 : FontWeight.w700,
                                                  fontSize: 13,
                                                  color: isRead ? Colors.white70 : Colors.white,
                                                ),
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            if (isAcked)
                                              Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                                decoration: BoxDecoration(
                                                  color: const Color(0xFF22D3A0).withOpacity(0.15),
                                                  borderRadius: BorderRadius.circular(6),
                                                ),
                                                child: const Text('ACK', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFF22D3A0))),
                                              ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          (n['message'] ?? '').toString().split('\n').first,
                                          style: const TextStyle(color: Colors.white54, fontSize: 12),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 6),
                                        Row(
                                          children: [
                                            Text(
                                              n['created_at'] != null
                                                  ? _formatTime(n['created_at'])
                                                  : '-',
                                              style: const TextStyle(color: Colors.white38, fontSize: 10),
                                            ),
                                            if (isAcked && n['acknowledged_by'] != null) ...[
                                              const Text(' • by ', style: TextStyle(color: Colors.white38, fontSize: 10)),
                                              Text(
                                                n['acknowledged_by'].toString(),
                                                style: const TextStyle(color: Color(0xFF22D3A0), fontSize: 10, fontWeight: FontWeight.w500),
                                              ),
                                            ],
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),

                                  // Unread indicator
                                  if (!isRead)
                                    Container(
                                      width: 8,
                                      height: 8,
                                      margin: const EdgeInsets.only(left: 8, top: 4),
                                      decoration: const BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: Color(0xFF00D9C0),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  String _formatTime(String isoString) {
    try {
      final dt = DateTime.parse(isoString).toLocal();
      final now = DateTime.now();
      final diff = now.difference(dt);

      if (diff.inMinutes < 1) return 'Baru saja';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m lalu';
      if (diff.inHours < 24) return '${diff.inHours}j lalu';
      if (diff.inDays < 7) return '${diff.inDays}h lalu';
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return isoString;
    }
  }
}
