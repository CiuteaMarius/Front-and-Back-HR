export const PROFILE_PICTURE_CHANGED_EVENT = 'hr-profile-picture-changed';

function inBrowser() {
  return typeof window !== 'undefined';
}

function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

export function profilePictureStorageKey(id: string) {
  return `hr-profile-picture:${id}`;
}

export function getStoredProfilePicture(...ids: Array<string | null | undefined>) {
  if (!inBrowser()) return null;

  for (const id of uniqueIds(ids)) {
    const picture = window.localStorage.getItem(profilePictureStorageKey(id));
    if (picture) return picture;
  }

  return null;
}

export function resolveProfilePicture(
  profilePicture?: string | null,
  ...ids: Array<string | null | undefined>
) {
  return getStoredProfilePicture(...ids) || profilePicture || undefined;
}

export function rememberProfilePicture(profilePicture: string, ...ids: Array<string | null | undefined>) {
  if (!inBrowser()) return;

  const resolvedIds = uniqueIds(ids);
  resolvedIds.forEach((id) => {
    window.localStorage.setItem(profilePictureStorageKey(id), profilePicture);
  });
  window.dispatchEvent(new CustomEvent(PROFILE_PICTURE_CHANGED_EVENT, { detail: { ids: resolvedIds } }));
}

export function forgetProfilePicture(...ids: Array<string | null | undefined>) {
  if (!inBrowser()) return;

  const resolvedIds = uniqueIds(ids);
  resolvedIds.forEach((id) => {
    window.localStorage.removeItem(profilePictureStorageKey(id));
  });
  window.dispatchEvent(new CustomEvent(PROFILE_PICTURE_CHANGED_EVENT, { detail: { ids: resolvedIds } }));
}
