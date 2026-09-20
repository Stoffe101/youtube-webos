const HOME_RESPONSE_EVENT = 'ytaf-home-freshness-response';
const WATCHED_THRESHOLD = 90;
const MAX_REMEMBERED_VIDEOS = 500;

const seenHomeVideoIds = new Set();

let refreshActive = false;
let refreshBaseline = new Set();
let lastResponseVideoIds = [];

function getHomeSectionList(response) {
  return response?.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer
    ?.content?.sectionListRenderer;
}

function getShelfItems(section) {
  return section?.shelfRenderer?.content?.horizontalListRenderer?.items ?? null;
}

function getVideoId(item) {
  return (
    item?.tileRenderer?.contentId ||
    item?.tileRenderer?.onSelectCommand?.watchEndpoint?.videoId ||
    item?.lockupViewModel?.contentId ||
    item?.lockupViewModel?.rendererContext?.commandContext?.onTap
      ?.innertubeCommand?.watchEndpoint?.videoId ||
    null
  );
}

function getWatchProgress(item) {
  const tileProgress =
    item?.tileRenderer?.header?.tileHeaderRenderer?.thumbnailOverlays
      ?.find((overlay) => overlay.thumbnailOverlayResumePlaybackRenderer)
      ?.thumbnailOverlayResumePlaybackRenderer;

  const lockupProgress =
    item?.lockupViewModel?.contentImage?.thumbnailViewModel?.overlays
      ?.find((overlay) => overlay.thumbnailBottomOverlayViewModel?.progressBar)
      ?.thumbnailBottomOverlayViewModel?.progressBar
      ?.thumbnailOverlayProgressBarViewModel;

  const progress = tileProgress || lockupProgress;
  return progress?.percentDurationWatched ?? progress?.startPercent ?? 0;
}

function rememberVideos(videoIds) {
  for (const videoId of videoIds) {
    if (!videoId) continue;

    // Refresh insertion order when an ID is encountered again.
    seenHomeVideoIds.delete(videoId);
    seenHomeVideoIds.add(videoId);
  }

  while (seenHomeVideoIds.size > MAX_REMEMBERED_VIDEOS) {
    const oldest = seenHomeVideoIds.values().next().value;
    seenHomeVideoIds.delete(oldest);
  }
}

function filterHomeResponse(response) {
  const sectionList = getHomeSectionList(response);
  if (!Array.isArray(sectionList?.contents)) {
    return;
  }

  const responseVideoIds = new Set();
  const acceptedVideoIds = [];
  let removedWatched = 0;
  let removedRepeated = 0;

  sectionList.contents = sectionList.contents.filter((section) => {
    const items = getShelfItems(section);
    if (!Array.isArray(items)) {
      return true;
    }

    const shelfHadVideos = items.some((item) => Boolean(getVideoId(item)));

    section.shelfRenderer.content.horizontalListRenderer.items = items.filter(
      (item) => {
        const videoId = getVideoId(item);
        if (!videoId) {
          return true;
        }

        const progress = Number(getWatchProgress(item)) || 0;
        if (progress >= WATCHED_THRESHOLD) {
          removedWatched += 1;
          return false;
        }

        if (responseVideoIds.has(videoId)) {
          removedRepeated += 1;
          return false;
        }

        if (refreshActive && refreshBaseline.has(videoId)) {
          removedRepeated += 1;
          return false;
        }

        responseVideoIds.add(videoId);
        acceptedVideoIds.push(videoId);
        return true;
      }
    );

    // Remove shelves that consisted of videos but became empty after filtering.
    if (
      shelfHadVideos &&
      !section.shelfRenderer.content.horizontalListRenderer.items.some((item) =>
        Boolean(getVideoId(item))
      )
    ) {
      return false;
    }

    return true;
  });

  lastResponseVideoIds = acceptedVideoIds;

  console.info(
    '[home-freshness] Home filtered:',
    acceptedVideoIds.length,
    'fresh,',
    removedWatched,
    'watched removed,',
    removedRepeated,
    'repeats removed'
  );

  if (!refreshActive) {
    rememberVideos(acceptedVideoIds);
    return;
  }

  // Defer the event until YouTube has had a chance to consume the parsed
  // response and update the Home UI.
  setTimeout(() => {
    document.dispatchEvent(
      new CustomEvent(HOME_RESPONSE_EVENT, {
        detail: {
          freshCount: acceptedVideoIds.length,
          removedWatched,
          removedRepeated
        }
      })
    );
  }, 0);
}

const originalParse = JSON.parse;
JSON.parse = function () {
  const result = originalParse.apply(this, arguments);

  try {
    filterHomeResponse(result);
  } catch (err) {
    console.warn('[home-freshness] Failed to filter Home response:', err);
  }

  return result;
};

export function beginFreshHomeRefresh() {
  refreshActive = true;
  refreshBaseline = new Set(seenHomeVideoIds);
  lastResponseVideoIds = [];
}

export function finishFreshHomeRefresh() {
  rememberVideos(lastResponseVideoIds);
  refreshActive = false;
  refreshBaseline = new Set();
}

export function cancelFreshHomeRefresh() {
  refreshActive = false;
  refreshBaseline = new Set();
  lastResponseVideoIds = [];
}

export { HOME_RESPONSE_EVENT };
