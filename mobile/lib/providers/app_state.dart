import 'package:flutter/material.dart';

class AppState extends ChangeNotifier {
  Map<String, dynamic>? _user;
  List<dynamic> _olts = [];
  List<dynamic> _notifications = [];
  int _selectedOltIndex = 0;

  Map<String, dynamic>? get user => _user;
  List<dynamic> get olts => _olts;
  List<dynamic> get notifications => _notifications;
  int get selectedOltIndex => _selectedOltIndex;
  
  bool get isSuperAdmin => _user?['is_super_admin'] == true;
  String get username => _user?['username'] ?? '';
  String get roleName => _user?['role']?['name'] ?? '';
  List<String> get permissions {
    final p = _user?['permissions'];
    if (p is List) return p.cast<String>();
    return [];
  }

  void setUser(Map<String, dynamic> user) {
    _user = user;
    notifyListeners();
  }

  void setOlts(List<dynamic> olts) {
    _olts = olts;
    notifyListeners();
  }

  void setNotifications(List<dynamic> notifs) {
    _notifications = notifs;
    notifyListeners();
  }

  void setSelectedOlt(int index) {
    _selectedOltIndex = index;
    notifyListeners();
  }

  void clear() {
    _user = null;
    _olts = [];
    _notifications = [];
    _selectedOltIndex = 0;
    notifyListeners();
  }

  bool hasPermission(String perm) {
    if (isSuperAdmin) return true;
    if (permissions.contains('all_olt')) return true;
    return permissions.contains(perm);
  }
}
