jest.mock('@microsoft/sp-core-library', () => ({
  Session: { get clientSideApplicationId(): string { return ''; } },
}));

import type { ApplicationCustomizerContext } from '@microsoft/sp-application-base';
import { Session } from '@microsoft/sp-core-library';
import { shouldShowFab } from './pageGate';

const pagesApplication = 'b6917cb1-93a0-4b97-a84d-7cf49975d4ec';
const listsApplication = 'b1ab4aaa-f779-405c-8683-d3a750b5d18d';
const listFormApplication = '5dd2645c-2459-4b4d-a98a-89293a82323f';

function context(listBaseTemplate?: number, itemId?: number): ApplicationCustomizerContext {
  return { pageContext: {
    web: { serverRelativeUrl: '/teams/studio' },
    list: listBaseTemplate && { serverRelativeUrl: '/teams/studio/Seiten' },
    listItem: itemId && { id: itemId },
    legacyPageContext: { listBaseTemplate, pageItemId: itemId },
  } } as ApplicationCustomizerContext;
}

describe('launcher visibility', () => {
  const originalAddress = window.location.pathname + window.location.search;
  afterEach(() => {
    window.history.replaceState({}, '', originalAddress);
    jest.restoreAllMocks();
  });

  it.each(['/teams/studio', '/teams/studio/', '/teams/studio/Seiten/Willkommen.aspx'])(
    'opens on a published page at %s while the page item is loading', address => {
      window.history.replaceState({}, '', address);
      jest.spyOn(Session, 'clientSideApplicationId', 'get').mockReturnValue(pagesApplication);
      expect(shouldShowFab(context())).toBe(true);
      expect(shouldShowFab(context(119, 12))).toBe(true);
    },
  );

  it('recognizes a page item from its library template when the application ID is unavailable', () => {
    window.history.replaceState({}, '', '/teams/studio/');
    expect(shouldShowFab(context(119, 12))).toBe(true);
  });

  it.each([
    [listsApplication, 101, undefined],
    [listsApplication, 119, undefined],
    [listFormApplication, 100, 7],
    [listFormApplication, 119, 12],
  ] as const)('hides on list views and forms even at a page-looking address', (app, template, item) => {
    window.history.replaceState({}, '', '/teams/studio/SitePages/Home.aspx');
    jest.spyOn(Session, 'clientSideApplicationId', 'get').mockReturnValue(app);
    expect(shouldShowFab(context(template, item))).toBe(false);
  });

  it.each(['?Mode=Edit', '?mode=edit'])('hides the launcher while the page is in edit mode (%s)', search => {
    window.history.replaceState({}, '', '/teams/studio/' + search);
    jest.spyOn(Session, 'clientSideApplicationId', 'get').mockReturnValue(pagesApplication);
    expect(shouldShowFab(context(119, 12))).toBe(false);
  });
});
