import * as FileSystem from 'expo-file-system/legacy';

const { StorageAccessFramework } = FileSystem;

// Purely a safety net against a pathological infinite loop (e.g. a
// symlink-like structure or a platform quirk that keeps returning
// children forever) - real folder structures are essentially never
// this deep.
const MAX_RECURSION_DEPTH = 25;

/**
 * Requests access to a folder via Android's Storage Access Framework
 * (the same system picker used by "Open" dialogs across Android apps)
 * and recursively walks its contents.
 *
 * Returns { rootName, files: [{ uri, relativePath }], possiblyIncomplete }
 * or null if the user cancelled the picker. `possiblyIncomplete` is true
 * if the walker detected signs of a confirmed, long-standing Expo bug
 * (expo/expo#20102) where reading a nested subfolder's contents via SAF
 * can incorrectly return its PARENT's contents instead - when that
 * happens, this walker stops descending into the affected subfolder
 * rather than looping on duplicate data, but that means some nested
 * files may be missing from the result. If this flag comes back true,
 * the caller should tell the user to zip the folder instead for a
 * reliable full-structure upload.
 */
export async function pickAndWalkFolder() {
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) return null;

  const rootUri = permissions.directoryUri;
  const rootName = decodeURIComponent(rootUri.split('/').pop().split(':').pop() || 'folder');

  const files = [];
  const state = { possiblyIncomplete: false };
  await walkDirectory(rootUri, '', files, 0, null, state);

  return { rootName, files, possiblyIncomplete: state.possiblyIncomplete };
}

async function walkDirectory(dirUri, relativePrefix, out, depth, parentListing, state) {
  if (depth > MAX_RECURSION_DEPTH) return;

  const children = await StorageAccessFramework.readDirectoryAsync(dirUri);

  // Defends against a confirmed Expo/Android bug (expo/expo#20102) where
  // readDirectoryAsync on a nested subfolder's URI can incorrectly
  // return the same listing as its parent instead of the subfolder's
  // actual contents. Since that would mean `children` here are literally
  // the same URIs already processed one level up, we can't safely
  // include them again (they'd show up twice, under the wrong path) -
  // the honest outcome is to stop descending into this subfolder and
  // flag the result as possibly incomplete, rather than guessing.
  if (parentListing && depth > 0 && arraysEqual(children, parentListing)) {
    state.possiblyIncomplete = true;
    return;
  }

  for (const childUri of children) {
    const name = extractNameFromUri(childUri);
    const relPath = relativePrefix ? `${relativePrefix}/${name}` : name;

    let childListing = null;
    try {
      childListing = await StorageAccessFramework.readDirectoryAsync(childUri);
    } catch (e) {
      childListing = null;
    }

    if (childListing !== null) {
      await walkDirectory(childUri, relPath, out, depth + 1, children, state);
    } else {
      out.push({ uri: childUri, relativePath: relPath });
    }
  }
}

export function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function extractNameFromUri(uri) {
  try {
    const decoded = decodeURIComponent(uri);
    const afterDocument = decoded.split('/document/').pop();
    const segments = afterDocument.split('/');
    return segments[segments.length - 1] || 'unnamed';
  } catch (e) {
    return 'unnamed';
  }
}
