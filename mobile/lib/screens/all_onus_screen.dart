import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../widgets/onu_list_tile.dart';
import 'onu_detail_screen.dart';

class AllOnusScreen extends StatefulWidget {
  const AllOnusScreen({super.key});

  @override
  State<AllOnusScreen> createState() => _AllOnusScreenState();
}

class _AllOnusScreenState extends State<AllOnusScreen> {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  
  List<dynamic> _onus = [];
  bool _loading = true;
  bool _loadingMore = false;
  int _page = 1;
  int _total = 0;
  String _statusFilter = '';
  String _sortBy = 'name';
  String _sortDir = 'asc';

  @override
  void initState() {
    super.initState();
    _loadOnus();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      if (!_loadingMore && _onus.length < _total) {
        _loadMore();
      }
    }
  }

  Future<void> _loadOnus() async {
    setState(() { _loading = true; _page = 1; });
    final api = ApiService();
    final result = await api.getAllOnus(
      page: 1,
      search: _searchController.text,
      status: _statusFilter,
      sortBy: _sortBy,
      sortDir: _sortDir,
    );
    if (mounted) {
      setState(() {
        _onus = result['onus'] ?? [];
        _total = result['total'] ?? 0;
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore) return;
    setState(() => _loadingMore = true);
    _page++;
    final api = ApiService();
    final result = await api.getAllOnus(
      page: _page,
      search: _searchController.text,
      status: _statusFilter,
      sortBy: _sortBy,
      sortDir: _sortDir,
    );
    if (mounted) {
      setState(() {
        _onus.addAll(result['onus'] ?? []);
        _loadingMore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('All ONUs'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search ONU...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () { _searchController.clear(); _loadOnus(); },
                      )
                    : null,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              onSubmitted: (_) => _loadOnus(),
            ),
          ),
        ),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list),
            onSelected: (v) { setState(() => _statusFilter = v); _loadOnus(); },
            itemBuilder: (_) => [
              const PopupMenuItem(value: '', child: Text('All Status')),
              const PopupMenuItem(value: 'online', child: Text('Online')),
              const PopupMenuItem(value: 'offline', child: Text('Offline')),
              const PopupMenuItem(value: 'los', child: Text('LOS')),
              const PopupMenuItem(value: 'dyinggasp', child: Text('DyingGasp')),
            ],
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _onus.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.router, size: 64, color: Colors.white.withOpacity(0.2)),
                      const SizedBox(height: 16),
                      Text(_searchController.text.isEmpty ? 'Belum ada ONU' : 'Tidak ditemukan',
                          style: const TextStyle(color: Colors.white54)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadOnus,
                  child: ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: _onus.length + (_loadingMore ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index >= _onus.length) {
                        return const Center(
                          child: Padding(
                            padding: EdgeInsets.all(16),
                            child: CircularProgressIndicator(),
                          ),
                        );
                      }
                      return OnuListTile(
                        onu: _onus[index],
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => OnuDetailScreen(onu: _onus[index]),
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
