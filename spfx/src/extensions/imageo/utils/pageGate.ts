import { ApplicationCustomizerContext } from '@microsoft/sp-application-base';

/**
 * Gating rules for the FAB:
 *   - Only on modern SharePoint pages (SitePages list items).
 *   - Only in view mode (research confirms edit mode is architecturally hostile).
 *   - Skip the system library views (AllItems, Forms).
 */
export function shouldShowFab(ctx: ApplicationCustomizerContext): boolean {
  const list = ctx.pageContext.list;
  const listItem = ctx.pageContext.listItem;

  if (!list || !listItem) return false;

  const listUrl = (list.serverRelativeUrl || '').toLowerCase();
  if (listUrl.indexOf('/sitepages') === -1) return false;

  const search = (typeof window !== 'undefined' && window.location?.search) || '';
  const mode = new URLSearchParams(search).get('Mode');
  if (mode === 'Edit') return false;

  const path = (typeof window !== 'undefined' && window.location?.pathname) || '';
  const fileName = path.split('/').pop()?.toLowerCase() || '';
  if (fileName === 'allitems.aspx' || fileName === '' || path.toLowerCase().endsWith('/forms/allitems.aspx')) {
    return false;
  }

  return true;
}

/**
 * Wrap history.pushState/replaceState so the customizer can re-evaluate gating
 * on SPA navigation. Inspired by Elio Struyf's documented pattern.
 * Returns an unsubscribe function.
 */
export function onSpaNavigate(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.history) return () => { /* noop */ };

  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);
  let disposed = false;

  const wrapped = (orig: typeof origPush): typeof origPush => function patched(...args: Parameters<typeof origPush>): ReturnType<typeof origPush> {
    const result = orig(...args);
    if (!disposed) {
      try {
        callback();
      } catch {
        // swallow to avoid breaking SPA nav
      }
    }
    return result;
  };

  window.history.pushState = wrapped(origPush);
  window.history.replaceState = wrapped(origReplace);
  const onPop = (): void => { if (!disposed) callback(); };
  window.addEventListener('popstate', onPop);

  return () => {
    disposed = true;
    window.history.pushState = origPush;
    window.history.replaceState = origReplace;
    window.removeEventListener('popstate', onPop);
  };
}
