import { arraysEqual, extractNameFromUri } from '../safFolderWalker';

describe('arraysEqual', () => {
  it('returns true for two empty arrays', () => {
    expect(arraysEqual([], [])).toBe(true);
  });

  it('returns true for identical arrays in the same order', () => {
    expect(arraysEqual(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true);
  });

  it('returns false for arrays of different lengths', () => {
    expect(arraysEqual(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
  });

  it('returns false when elements differ at any position', () => {
    expect(arraysEqual(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(false);
  });

  it('treats different ordering as not equal', () => {
    expect(arraysEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});

describe('extractNameFromUri', () => {
  it('extracts the file name from a nested SAF document URI', () => {
    const uri =
      'content://com.android.externalstorage.documents/tree/primary%3ADownload%2Fmyproject/document/primary%3ADownload%2Fmyproject%2Fsrc%2Findex.js';
    expect(extractNameFromUri(uri)).toBe('index.js');
  });

  it('extracts the file name from a top-level document URI', () => {
    const uri =
      'content://com.android.externalstorage.documents/tree/primary%3ADownload%2Fmyproject/document/primary%3ADownload%2Fmyproject%2Findex.js';
    expect(extractNameFromUri(uri)).toBe('index.js');
  });

  it('extracts a folder name the same way as a file name', () => {
    const uri =
      'content://com.android.externalstorage.documents/tree/primary%3ADownload%2Fmyproject/document/primary%3ADownload%2Fmyproject%2Fsrc';
    expect(extractNameFromUri(uri)).toBe('src');
  });

  it('falls back to "unnamed" rather than throwing on a malformed URI', () => {
    expect(extractNameFromUri('content://malformed%E0%A4%A')).toBe('unnamed');
  });
});
