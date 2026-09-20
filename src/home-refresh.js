import { ResolveCommandRegistry } from './app_api/index';
import {
  beginFreshHomeRefresh,
  cancelFreshHomeRefresh,
  finishFreshHomeRefresh,
  HOME_RESPONSE_EVENT
} from './home-freshness.js';
import { showNotification } from './ui.js';

const YELLOW_KEY_CODES = new Set([170, 405]);
const HOME_BROWSE_ID = 'FEwhat_to_watch';
const MIN_FRESH_VIDEOS = 10;
const MAX_REFRESH_ATTEMPTS = 3;

let refreshInProgress = false;
let refreshAttempt = 0;
let responseTimeout = null;

function isYellowButton(evt) {
  return (
    YELLOW_KEY_CODES.has(evt.charCode) || YELLOW_KEY_CODES.has(evt.keyCode)
  );
}

function isFullPlaybackActive() {
  const player = document.querySelector('ytlr-watch-default');
  return (
    location.hash.includes('/watch') &&
    player?.getAttribute('hybridnavfocusable') === 'true'
  );
}

async function dispatchHomeBrowse() {
  const commandRegistry = await ResolveCommandRegistry.getInstance();

  commandRegistry.dispatchCommand({
    commandMetadata: {
      webCommandMetadata: {
        url: '/',
        webPageType: 'WEB_PAGE_TYPE_BROWSE'
      }
    },
    browseEndpoint: {
      browseId: HOME_BROWSE_ID
    }
  });
}

function armResponseTimeout() {
  clearTimeout(responseTimeout);
  responseTimeout = setTimeout(() => {
    console.warn('[home-refresh] Timed out waiting for Home response');
    cancelFreshHomeRefresh();
    refreshInProgress = false;
    refreshAttempt = 0;
  }, 4000);
}

async function requestFreshHome() {
  refreshAttempt += 1;

  try {
    await dispatchHomeBrowse();
    armResponseTimeout();
  } catch (err) {
    console.error('[home-refresh] Native Home refresh failed:', err);
    clearTimeout(responseTimeout);
    cancelFreshHomeRefresh();
    refreshInProgress = false;
    refreshAttempt = 0;
    showNotification('Could not refresh recommendations', 2000, 'yellow');
  }
}

async function refreshHomeRecommendations() {
  if (refreshInProgress) {
    return;
  }

  // A Yellow press while actually watching a video should not throw the user
  // out of playback. Everywhere else, including any focused Home tile, the
  // button is allowed to refresh/navigate Home.
  if (isFullPlaybackActive()) {
    showNotification(
      'Return to Home to refresh recommendations',
      2000,
      'yellow'
    );
    return;
  }

  refreshInProgress = true;
  refreshAttempt = 0;
  beginFreshHomeRefresh();

  showNotification('Finding fresh recommendations...', 1000, 'yellow');
  await requestFreshHome();
}

document.addEventListener(HOME_RESPONSE_EVENT, (evt) => {
  if (!refreshInProgress) {
    return;
  }

  clearTimeout(responseTimeout);

  const freshCount = Number(evt.detail?.freshCount) || 0;

  if (freshCount < MIN_FRESH_VIDEOS && refreshAttempt < MAX_REFRESH_ATTEMPTS) {
    console.info(
      '[home-refresh] Only',
      freshCount,
      'fresh videos; requesting another Home batch'
    );

    setTimeout(() => {
      requestFreshHome();
    }, 250);
    return;
  }

  finishFreshHomeRefresh();
  refreshInProgress = false;
  refreshAttempt = 0;
});

function yellowButtonHandler(evt) {
  if (!isYellowButton(evt)) {
    return true;
  }

  evt.preventDefault();
  evt.stopPropagation();
  evt.stopImmediatePropagation();

  if (evt.type === 'keydown' && !evt.repeat) {
    refreshHomeRecommendations();
  }

  return false;
}

// Capture on window, above YouTube's document/shelf handlers. Deep horizontal
// carousels can otherwise consume the color-key event before our document
// listener sees it.
window.addEventListener('keydown', yellowButtonHandler, true);
window.addEventListener('keypress', yellowButtonHandler, true);
window.addEventListener('keyup', yellowButtonHandler, true);
