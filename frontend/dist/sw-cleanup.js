if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for (var registration of registrations) {
      registration.unregister();
      console.log('Unregistered stale service worker:', registration.scope);
    }
  }).catch(function() {});
}
if ('caches' in window) {
  caches.keys().then(function(names) {
    for (var name of names) {
      caches.delete(name);
      console.log('Deleted cache:', name);
    }
  }).catch(function() {});
}
