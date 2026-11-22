export function isIssueRef(ref) {
  return /^refs\/heads\/issue\/[1-9][0-9]*-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ref || '');
}
