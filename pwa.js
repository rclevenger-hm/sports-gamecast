(function () {
  'use strict';

  var deferredInstallPrompt = null;
  var installButton = null;

  function ensureInstallButton() {
    if (installButton) return installButton;
    var controls = document.querySelector('.topbar .controls:last-child');
    if (!controls) return null;

    installButton = document.createElement('button');
    installButton.type = 'button';
    installButton.id = 'installApp';
    installButton.textContent = 'Install';
    installButton.title = 'Install Sports Gamecast';
    installButton.hidden = true;
    installButton.addEventListener('click', requestInstall);
    controls.insertBefore(installButton, controls.firstChild);
    return installButton;
  }

  function setInstallAvailable(available) {
    var button = ensureInstallButton();
    if (!button) return;
    button.hidden = !available;
    button.disabled = !available;
  }

  async function requestInstall() {
    if (!deferredInstallPrompt) return;
    var prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    setInstallAvailable(false);

    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      console.warn('App installation prompt failed:', error);
    }
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    setInstallAvailable(true);
  });

  window.addEventListener('appinstalled', function () {
    deferredInstallPrompt = null;
    setInstallAvailable(false);
  });

  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function (error) {
      console.warn('Service worker registration failed:', error);
    });
  });
})();
