import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../providers/app_state.dart';
import '../widgets/stat_card.dart';
import '../widgets/olt_card.dart';
import 'all_onus_screen.dart';
import 'olt_settings_screen.dart';
import 'settings_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _currentIndex = 0;
  bool _loading = true;
  Map<String, dynamic>? _dashboardData;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    final api = ApiService();
    final result = await api.getDashboard();
    if (mounted) {
      setState(() {
        _dashboardData = result;
        _loading = false;
      });
      if (result['olts'] != null) {
        Provider.of<AppState>(context, listen: false).setOlts(result['olts']);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _buildDashboard(),
      const AllOnusScreen(),
      const OltSettingsScreen(),
      const SettingsScreen(),
    ];

    return Scaffold(
      body: pages[_currentIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) => setState(() => _currentIndex = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard), label: 'Dashboard'),
          NavigationDestination(icon: Icon(Icons.router), label: 'ONUs'),
          NavigationDestination(icon: Icon(Icons.settings_ethernet), label: 'OLT'),
          NavigationDestination(icon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }

  Widget _buildDashboard() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final data = _dashboardData;
    if (data == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.white38),
            const SizedBox(height: 16),
            const Text('Gagal memuat data', style: TextStyle(color: Colors.white54)),
            const SizedBox(height: 16),
            FilledButton.tonal(onPressed: _loadDashboard, child: const Text('Retry')),
          ],
        ),
      );
    }

    final olts = data['olts'] as List? ?? [];
    final totalOnu = olts.fold<int>(0, (sum, o) => sum + ((o['total_onu'] ?? 0) as int));
    final onlineOnu = olts.fold<int>(0, (sum, o) => sum + ((o['online_onu'] ?? 0) as int));
    final offlineOnu = olts.fold<int>(0, (sum, o) => sum + ((o['offline_onu'] ?? 0) as int));
    final losOnu = olts.fold<int>(0, (sum, o) => sum + ((o['los_onu'] ?? 0) as int));

    return RefreshIndicator(
      onRefresh: _loadDashboard,
      child: CustomScrollView(
        slivers: [
          // App Bar
          SliverAppBar(
            floating: true,
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Dashboard', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                Text(
                  'Welcome, ${Provider.of<AppState>(context).username}',
                  style: const TextStyle(fontSize: 12, color: Colors.white54),
                ),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: _loadDashboard,
              ),
            ],
          ),

          // Stats
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverGrid.count(
              crossAxisCount: 2,
              childAspectRatio: 1.6,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              children: [
                StatCard(title: 'Total OLT', value: '${olts.length}', icon: Icons.dns, color: const Color(0xFF00D9C0)),
                StatCard(title: 'ONU Online', value: '$onlineOnu', icon: Icons.check_circle, color: const Color(0xFF22D3A0)),
                StatCard(title: 'ONU Offline', value: '$offlineOnu', icon: Icons.cancel, color: const Color(0xFF8B9BB8)),
                StatCard(title: 'LOS', value: '$losOnu', icon: Icons.warning, color: const Color(0xFFFF5757)),
              ],
            ),
          ),

          // OLT Cards
          const SliverPadding(
            padding: EdgeInsets.fromLTRB(16, 24, 16, 8),
            sliver: SliverToBoxAdapter(
              child: Text('OLT Devices', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ),
          ),

          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverList.separated(
              itemCount: olts.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) => OltCard(olt: olts[index]),
            ),
          ),

          const SliverPadding(padding: EdgeInsets.only(bottom: 24)),
        ],
      ),
    );
  }
}
