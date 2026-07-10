import 'dart:convert';
import 'dart:io';
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

  // ── Initialization ──

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = prefs.getString('api_base_url') ?? '';
    _cookie = prefs.getString('session_cookie') ?? '';
  }

  Future<void> setServer(String url) async {
    _baseUrl = url.replaceAll(RegExp(r'/+$'), '');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('api_base_url', _baseUrl);
  }

  // ── Auth ──

  Future<Map<String, dynamic>> login(String username, String password) async {
    final response = await _post('/api/auth/login', {
      'username': username,
      'password': password,
    });

    if (response['success'] == true) {
      _cookie = 'authenticated';
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('session_cookie', _cookie);
    }

    return response;
  }

  Future<void> logout() async {
    try {
      await _post('/api/auth/logout', {});
    } catch (_) {}
    _cookie = '';
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('session_cookie');
  }

  Future<Map<String, dynamic>> getMe() async {
    return await _get('/api/auth/me');
  }

  // ── Dashboard ──

  Future<Map<String, dynamic>> getDashboard() async {
    return await _get('/api/dashboard');
  }

  // ── ONU ──

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

  Future<Map<String, dynamic>> getOnuDetail(int onuId) async {
    return await _get('/api/onu/$onuId/detail');
  }

  Future<Map<String, dynamic>> getOnuLiveDetail(int onuId) async {
    return await _get('/api/onu/$onuId/live-detail');
  }

  Future<Map<String, dynamic>> onuAction(int onuId, String action) async {
    return await _post('/api/onu/$onuId/action', {'action': action});
  }

  Future<Map<String, dynamic>> updateOnu(int onuId, Map<String, dynamic> data) async {
    return await _post('/api/onu/$onuId/update', data);
  }

  // ── OLT ──

  Future<List<dynamic>> getOlts() async {
    final result = await _get('/api/olts');
    if (result.containsKey('data') && result['data'] is List) {
      return result['data'] as List;
    }
    return result['olts'] is List ? result['olts'] as List : [];
  }

  Future<Map<String, dynamic>> getOltDetail(int oltId) async {
    return await _get('/api/olt/$oltId');
  }

  Future<Map<String, dynamic>> syncOlt(int oltId) async {
    return await _post('/api/olt/$oltId/sync', {});
  }

  Future<Map<String, dynamic>> getSyncStatus(int oltId) async {
    return await _get('/api/olt/$oltId/sync-status');
  }

  // ── Notifications ──

  Future<Map<String, dynamic>> getNotifications({int limit = 50}) async {
    return await _get('/api/notifications?limit=$limit');
  }

  Future<Map<String, dynamic>> markNotificationRead(int notifId) async {
    return await _post('/api/notifications/$notifId/read', {});
  }

  Future<Map<String, dynamic>> markAllNotificationsRead() async {
    return await _post('/api/notifications/read-all', {});
  }

  Future<Map<String, dynamic>> acknowledgeNotification(int notifId) async {
    return await _post('/api/notifications/$notifId/acknowledge', {});
  }

  Future<Map<String, dynamic>> acknowledgeAllNotifications() async {
    return await _post('/api/notifications/acknowledge-all', {});
  }

  Future<Map<String, dynamic>> deleteNotification(int notifId) async {
    return await _post('/api/notifications/$notifId', {});
  }

  // ── Alert History ──

  Future<Map<String, dynamic>> getAlertHistory({
    int page = 1,
    int perPage = 30,
    String? type,
  }) async {
    var url = '/api/alerts/history?page=$page&per_page=$perPage';
    if (type != null && type.isNotEmpty) url += '&type=$type';
    return await _get(url);
  }

  // ── Uptime ──

  Future<Map<String, dynamic>> getOnuUptime(int onuId, {int range = 30}) async {
    return await _get('/api/uptime/onu/$onuId?range=$range');
  }

  Future<Map<String, dynamic>> getOltUptime(int oltId, {int range = 30}) async {
    return await _get('/api/uptime/olt/$oltId?range=$range');
  }

  // ── Technicians ──

  Future<Map<String, dynamic>> getTechnicians() async {
    return await _get('/api/technicians');
  }

  // ── Action Logs ──

  Future<Map<String, dynamic>> getActionLogs({int page = 1}) async {
    return await _get('/api/logs?page=$page');
  }

  // ── Private HTTP methods ──

  Future<Map<String, dynamic>> _get(String path) async {
    try {
      final uri = Uri.parse('$_baseUrl$path');
      final response = await http.get(uri, headers: _headers()).timeout(
        const Duration(seconds: 15),
      );
      _extractCookie(response);
      return _handleResponse(response);
    } on SocketException {
      return {'error': 'Tidak dapat terhubung ke server', 'success': false};
    } on HttpException {
      return {'error': 'Koneksi terputus', 'success': false};
    } on FormatException {
      return {'error': 'Response tidak valid', 'success': false};
    } on Exception catch (e) {
      return {'error': 'Connection failed: $e', 'success': false};
    }
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    try {
      final uri = Uri.parse('$_baseUrl$path');
      final response = await http.post(
        uri,
        headers: _headers(),
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 15));
      _extractCookie(response);
      return _handleResponse(response);
    } on SocketException {
      return {'error': 'Tidak dapat terhubung ke server', 'success': false};
    } on HttpException {
      return {'error': 'Koneksi terputus', 'success': false};
    } on FormatException {
      return {'error': 'Response tidak valid', 'success': false};
    } on Exception catch (e) {
      return {'error': 'Connection failed: $e', 'success': false};
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

  /// Extract Set-Cookie from response headers and persist
  void _extractCookie(http.Response response) {
    final setCookie = response.headers['set-cookie'];
    if (setCookie != null && setCookie.isNotEmpty) {
      final cookie = setCookie.split(';').first.trim();
      if (cookie.isNotEmpty) {
        _cookie = cookie;
        SharedPreferences.getInstance().then((prefs) {
          prefs.setString('session_cookie', _cookie);
        });
      }
    }
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    try {
      final body = jsonDecode(response.body);
      if (body is Map<String, dynamic>) {
        if (response.statusCode >= 400) {
          body['_status'] = response.statusCode;
          if (!body.containsKey('error') && !body.containsKey('message')) {
            body['error'] = 'HTTP ${response.statusCode}';
          }
        }
        return body;
      }
      return {'data': body, '_status': response.statusCode};
    } catch (e) {
      return {
        'error': 'Invalid response (HTTP ${response.statusCode})',
        'success': false,
        '_status': response.statusCode,
      };
    }
  }
}
