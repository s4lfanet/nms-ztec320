// Reload once when a NEW service worker takes control. Without this,
// the old SW's precached index.html can reference hashed assets that
// were deleted on deploy, leaving a broken page until manual refresh.
(function () {
  if (!('serviceWorker' in navigator)) return;
  var hadController = !!navigator.serviceWorker.controller;
  var reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
})();
