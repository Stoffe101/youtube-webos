import { showNotification } from './ui.js';

const YELLOW_KEY_CODES = new Set([170, 405]);

let refreshInProgress = false;

function isYellowButton(evt) {
  return (
    YELLOW_KEY_CODES.has(evt.charCode) || YELLOW_KEY_CODES.has(evt.keyCode)
  );
}

function isHomeRoute() {
  const hash = window.location.hash;

  return hash === '' || hash === '#' || hash === '#/' || hash.startsWith('#/?');
}

function refreshHomeRecommendations() {
  if (refreshInProgress) {
    return;
  }

  if (!isHomeRoute()) {
    showNotification('Open Home to refresh recommendations', 2000, 'yellow');
    return;
  }

  refreshInProgress = true;
  showNotification('Refreshing recommendations...', 700, 'yellow');

  // Reloading the Home route makes YouTube TV request a fresh recommendation
  // feed without coupling this feature to YouTube's private internal APIs.
  setTimeout(() => {
    window.location.reload();
  }, 150);
}

function yellowButtonHandler(evt) {
  if (!isYellowButton(evt)) {
    return true;
  }

  evt.preventDefault();
  evt.stopPropagation();

  if (evt.type === 'keydown' && !evt.repeat) {
    refreshHomeRecommendations();
  }

  return false;
}

document.addEventListener('keydown', yellowButtonHandler, true);
document.addEventListener('keypress', yellowButtonHandler, true);
document.addEventListener('keyup', yellowButtonHandler, true);
