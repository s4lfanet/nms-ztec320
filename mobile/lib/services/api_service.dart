import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  String _baseUrl = '';
  String _cookie = '';

  String get baseUrl => _baseUrl;
  bool get isLoggedIn => _cookie.isNotEmpty;

  /// Initialize with saved preferences
  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = prefs.getString('api_base_url') ?? '';
    _cookie = prefs.getString('session_cookie') ?? '';
  }

  /// Set server URL (e.g., https://tenant-name.salfa.my.id)
  Future<void> setServer(String url) async {
    _baseUrl = url.replaceAll(RegExp(r'/+$'), '');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('api_base_url', _baseUrl);
  }

  /// Login
  Future<Map<String, dynamic>> login(String username, String password) async {
    final response = await _post('/api/auth/login', {
      'username': username,
      'password': password,
    });

    if (response['success'] == true) {
      // Extract session cookie from response headers
      // The http package stores cookies in response headers
      _cookie = 'authenticated';
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('session_cookie', _cookie);
    }

    return response;
  }

  /// Logout
  Future<void> logout() async {
    try {
      await _post('/api/auth/logout', {});
    } catch (_) {}
    _cookie = '';
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('session_cookie');
  }

  /// Get current user
  Future<Map<String, dynamic>> getMe() async {
    return await _get('/api/auth/me');
  }

  /// Get dashboard data
  Future<Map<String, dynamic>> getDashboard() async {
    return await _get('/api/dashboard');
  }

  /// Get all ONUs (paginated)
  Future<Map<String, dynamic>> getAllOnus({
    int page = 1,
    int pageSize = 50,
    String? search,
    String? status,
    int? oltId,
    String sortBy = 'name',
    String sortDir = 'asc',
  }) async {
    final params = <String, String>{
      'page': page.toString(),
      'page_size': pageSize.toString(),
      'sort_by': sortBy,
      'sort_dir': sortDir,
    };
    if (search != null && search.isNotEmpty) params['search'] = search;
    if (status != null && status.isNotEmpty) params['status'] = status;
    if (oltId != null) params['olt'] = oltId.toString();

    final query = params.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&');
    return await _get('/api/all-onus?$query');
  }

  /// Get ONU detail
  Future<Map<String, dynamic>> getOnuDetail(int onuId) async {
    return await _get('/api/onu/$onuId/detail');
  }

  /// Get ONU live detail
  Future<Map<String, dynamic>> getOnuLiveDetail(int onuId) async {
    return await _get('/api/onu/$onuId/live-detail');
  }

  /// ONU action (reboot, reset, delete, etc.)
  Future<Map<String, dynamic>> onuAction(int onuId, String action) async {
    return await _post('/api/onu/$onuId/action', {'action': action});
  }

  /// Update ONU
  Future<Map<String, dynamic>> updateOnu(int onuId, Map<String, dynamic> data) async {
    return await _post('/api/onu/$onuId/update', data);
  }

  /// Get OLT list
  Future<List<dynamic>> getOlts() async {
    final result = await _get('/api/olts');
    return result is List ? result : [];
  }

  /// Get OLT detail
  Future<Map<String, dynamic>> getOltDetail(int oltId) async {
    return await _get('/api/olt/$oltId');
  }

  /// Trigger OLT sync
  Future<Map<String, dynamic>> syncOlt(int oltId) async {
    return await _post('/api/olt/$oltId/sync', {});
  }

  /// Get sync status
  Future<Map<String, dynamic>> getSyncStatus(int oltId) async {
    return await _get('/api/olt/$oltId/sync-status');
  }

  /// Get notifications
  Future<List<dynamic>> getNotifications() async {
    final result = await _get('/api/notifications');
    return result is List ? result : [];
  }

  /// Get action logs
  Future<Map<String, dynamic>> getActionLogs({int page = 1}) async {
    return await _get('/api/logs?page=$page');
  }

  // ── Private HTTP methods ──

  Future<Map<String, dynamic>> _get(String path) async {
    try {
      final uri = Uri.parse('$_baseUrl$path');
      final response = await http.get(uri, headers: _headers());
      return _handleResponse(response);
    } catch (e) {
      return {'error': 'Connection failed: $e'};
    }
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    try {
      final uri = Uri.parse('$_baseUrl$path');
      final response = await http.post(
        uri,
        headers: _headers(),
        body: jsonEncode(body),
      );
      return _handleResponse(response);
    } catch (e) {
      return {'error': 'Connection failed: $e'};
    }
  }

  Map<String, String> _headers() {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (_cookie.isNotEmpty) {
      headers['Cookie'] = _cookie;
    }
    return headers;
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    try {
      final body = jsonDecode(response.body);
      if (body is Map<String, dynamic>) {
        return body;
      }
      return {'data': body};
    } catch (e) {
      return {'error': 'Invalid response: ${response.statusCode}'};
    }
  }
}
