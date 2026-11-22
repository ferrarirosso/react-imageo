import type { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import { Session } from '@microsoft/sp-core-library';

// SharePoint's Site Pages application ID and Web Page Library template apply across tenants.
const SITE_PAGES_APPLICATION = 'b6917cb1-93a0-4b97-a84d-7cf49975d4ec';
const WEB_PAGE_LIBRARY = 119;

export function shouldShowFab(ctx: ApplicationCustomizerContext): boolean {
  const query = new URLSearchParams(window.location.search.toLowerCase());
  if (query.get('mode') === 'edit') return false;

  // The Pages shell can start before SharePoint supplies the current list item.
  const applicationId = Session.clientSideApplicationId;
  if (applicationId) return applicationId.toLowerCase() === SITE_PAGES_APPLICATION;
  const { listItem, legacyPageContext } = ctx.pageContext;
  return !!listItem && Number(legacyPageContext?.listBaseTemplate) === WEB_PAGE_LIBRARY;
}
