import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../providers/app_state.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final user = appState.user;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Profile card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 36,
                    backgroundColor: const Color(0xFF00D9C0).withOpacity(0.2),
                    child: Text(
                      (user?['username'] ?? 'U')[0].toUpperCase(),
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Color(0xFF00D9C0)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(user?['username'] ?? '-', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  Text(appState.roleName, style: const TextStyle(color: Colors.white54)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Menu items
          _menuItem(Icons.person, 'My Profile', () {}),
          _menuItem(Icons.notifications, 'Notifications', () {}),
          _menuItem(Icons.info_outline, 'About', () {
            showAboutDialog(
              context: context,
              applicationName: 'Salfanet NMS',
              applicationVersion: '1.0.0',
              applicationIcon: const Icon(Icons.wifi_tethering, size: 48, color: Color(0xFF00D9C0)),
              children: const [Text('Native Android app for OLT/ONU management')],
            );
          }),
          const SizedBox(height: 24),

          // Logout
          FilledButton.tonalIcon(
            onPressed: () async {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Logout'),
                  content: const Text('Yakin ingin logout?'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
                    FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Logout')),
                  ],
                ),
              );
              if (confirm == true) {
                final api = ApiService();
                await api.logout();
                appState.clear();
                if (context.mounted) {
                  Navigator.of(context).pushReplacementNamed('/login');
                }
              }
            },
            icon: const Icon(Icons.logout, color: Color(0xFFFF5757)),
            label: const Text('Logout', style: TextStyle(color: Color(0xFFFF5757))),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFFF5757).withOpacity(0.1),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
          ),
        ],
      ),
    );
  }

  Widget _menuItem(IconData icon, String title, VoidCallback onTap) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: const Color(0xFF00D9C0)),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right, color: Colors.white38),
        onTap: onTap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }
}
