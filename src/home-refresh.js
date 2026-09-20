import { ResolveCommandRegistry } from './app_api/index';
import { showNotification } from './ui.js';

const YELLOW_KEY_CODES = new Set([170, 405]);
const HOME_BROWSE_ID = 'FEwhat_to_watch';

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

async function refreshHomeRecommendations() {
  if (refreshInProgress) {
    return;
  }

  if (!isHomeRoute()) {
    showNotification('Open Home to refresh recommendations', 2000, 'yellow');
    return;
  }

  refreshInProgress = true;

  try {
    const commandRegistry = await ResolveCommandRegistry.getInstance();

    showNotification('Refreshing recommendations...', 900, 'yellow');

    // Ask the running YouTube TV app to browse Home again. This keeps the
    // application shell alive and refreshes Home through YouTube's own
    // navigation/data path instead of reloading the entire web application.
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
  } catch (err) {
    console.error('[home-refresh] Native Home refresh failed:', err);
    showNotification('Could not refresh recommendations', 2000, 'yellow');
  } finally {
    // Keep rapid key repeats from stacking multiple Home browse requests.
    setTimeout(() => {
      refreshInProgress = false;
    }, 1200);
  }
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
