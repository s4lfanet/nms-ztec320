# Salfanet NMS — Native Android App (Flutter)

## Overview
Native Android app for managing OLT/ONU devices via Salfanet NMS API.

## Features
- **Login** — Connect to any Salfanet NMS server
- **Dashboard** — OLT stats, ONU counts, quick overview
- **All ONUs** — Searchable, filterable ONU list with infinite scroll
- **ONU Detail** — View ONU info + actions (reboot, reset, clear config)
- **OLT Settings** — View OLT list, trigger sync
- **Settings** — Profile, logout

## Screenshots
Coming soon...

## Setup

### Prerequisites
1. Install Flutter SDK: https://docs.flutter.dev/get-started/install
2. Install Android Studio or Android SDK
3. Enable USB debugging on your Android device

### Install Dependencies
```bash
cd mobile
flutter pub get
```

### Run on Device/Emulator
```bash
flutter run
```

### Build APK
```bash
flutter build apk --release
```

The APK will be at `build/app/outputs/flutter-apk/app-release.apk`

### Build App Bundle (for Play Store)
```bash
flutter build appbundle --release
```

## Architecture
```
lib/
├── main.dart              # Entry point + theme + routing
├── services/
│   └── api_service.dart   # HTTP API client
├── providers/
│   └── app_state.dart     # Global state (Provider)
├── screens/
│   ├── login_screen.dart
│   ├── dashboard_screen.dart
│   ├── all_onus_screen.dart
│   ├── onu_detail_screen.dart
│   ├── olt_settings_screen.dart
│   └── settings_screen.dart
└── widgets/
    ├── stat_card.dart
    ├── status_badge.dart
    ├── onu_list_tile.dart
    └── olt_card.dart
```

## API Integration
The app connects to the same Flask API used by the web frontend:
- Base URL: `https://{subdomain}.salfa.my.id`
- Auth: Session-based (cookie)
- All endpoints documented at: `https://nms.salfa.my.id/docs`

## Theme
Dark theme matching the web frontend:
- Background: `#0B1426` (Deep Navy)
- Accent: `#00D9C0` (Fiber Teal)
- Success: `#22D3A0` (Link Green)
- Warning: `#FBB040` (Signal Amber)
- Danger: `#FF5757` (Alert Coral)
