jest.mock('@microsoft/sp-application-base', () => ({
  BaseApplicationCustomizer: class {},
  PlaceholderName: { Top: 1, Bottom: 2 },
}));
jest.mock('@microsoft/sp-core-library', () => ({ Log: { info: jest.fn() } }));
jest.mock('react-dom/client', () => ({ createRoot: jest.fn() }));
jest.mock('./components/Fab', () => ({ Fab: () => null }));
jest.mock('./utils/pageGate', () => ({ shouldShowFab: jest.fn() }));
jest.mock('./utils/env', () => ({
  endpointsConfigured: () => true,
  endpointsFromEnv: () => ({}),
}));

import { PlaceholderName } from '@microsoft/sp-application-base';
import { createRoot } from 'react-dom/client';
import ImageoApplicationCustomizer from './ImageoApplicationCustomizer';
import { shouldShowFab } from './utils/pageGate';

class TestCustomizer extends ImageoApplicationCustomizer {
  public start(): Promise<void> { return this.onInit(); }
  public stop(): void { this.onDispose(); }
}

function sharePointEvent(): {
  add: (scope: object, callback: () => void) => void;
  remove: (scope: object, callback: () => void) => void;
  raise: () => void;
} {
  const subscribers = new Map<() => void, object>();
  return {
    add: (scope, callback) => { subscribers.set(callback, scope); },
    remove: (scope, callback) => {
      if (subscribers.get(callback) === scope) subscribers.delete(callback);
    },
    raise: () => { subscribers.forEach((scope, callback) => callback.call(scope)); },
  };
}

describe('Application Customizer navigation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('checks the new page context after navigation even when the same placeholder persists, and cleans up', async () => {
    const changedEvent = sharePointEvent();
    const navigatedEvent = sharePointEvent();
    const domElement = document.body.appendChild(document.createElement('div'));
    const root = { render: jest.fn(), unmount: jest.fn() };
    jest.mocked(createRoot).mockReturnValue(root);
    const placeholder = { domElement, isVisible: true, isDisposed: false, dispose: jest.fn() };
    const tryCreateContent = jest.fn((_name: number, options: { onDispose: (content: object) => void }) => {
      placeholder.dispose.mockImplementation(() => options.onDispose(placeholder));
      return placeholder;
    });
    const customizer = new TestCustomizer();
    Object.defineProperty(customizer, 'context', { value: {
      application: { navigatedEvent },
      placeholderProvider: { changedEvent, tryCreateContent },
      pageContext: { web: {}, legacyPageContext: {} },
    } });

    try {
      jest.mocked(shouldShowFab).mockReturnValue(false);
      await customizer.start();
      expect(root.render).not.toHaveBeenCalled();
      jest.mocked(shouldShowFab).mockReturnValue(true);
      navigatedEvent.raise();
      expect(root.render).toHaveBeenCalled();

      jest.mocked(shouldShowFab).mockReturnValue(false);
      navigatedEvent.raise();
      expect(root.unmount).toHaveBeenCalled();

      jest.mocked(shouldShowFab).mockReturnValue(true);
      changedEvent.raise();
      expect(root.render).toHaveBeenCalledTimes(2);
      customizer.stop();
      jest.mocked(shouldShowFab).mockClear();
      navigatedEvent.raise();
      changedEvent.raise();
      expect(shouldShowFab).not.toHaveBeenCalled();
    } finally {
      domElement.remove();
    }
  });

  it.each(['unavailable', 'detached'])('uses Top when Bottom is %s and remounts when SharePoint replaces the host', async state => {
    const changedEvent = sharePointEvent();
    const navigatedEvent = sharePointEvent();
    const root = { render: jest.fn(), unmount: jest.fn() };
    jest.mocked(createRoot).mockReturnValue(root);
    jest.mocked(shouldShowFab).mockReturnValue(true);
    const top = document.body.appendChild(document.createElement('div'));
    const bottom = document.createElement('div');
    const tryCreateContent = (name: PlaceholderName, options: { onDispose: (content: object) => void }): object | undefined => {
      if (name === PlaceholderName.Bottom && !bottom.isConnected && state === 'unavailable') return undefined;
      const domElement = name === PlaceholderName.Bottom ? bottom : top;
      const content = {
        name,
        domElement,
        get isVisible(): boolean { return document.body.contains(domElement); },
        isDisposed: false,
        dispose: (): void => { content.isDisposed = true; options.onDispose(content); },
      };
      return content;
    };
    const customizer = new TestCustomizer();
    Object.defineProperty(customizer, 'context', { value: {
      application: { navigatedEvent },
      placeholderProvider: { changedEvent, tryCreateContent },
      pageContext: { web: {}, legacyPageContext: {} },
    } });

    try {
      await customizer.start();
      expect(createRoot).toHaveBeenLastCalledWith(top);
      top.remove();
      document.body.appendChild(bottom);
      changedEvent.raise();
      expect(root.unmount).toHaveBeenCalled();
      expect(createRoot).toHaveBeenLastCalledWith(bottom);
      expect(root.render).toHaveBeenCalledTimes(2);
    } finally {
      customizer.stop();
      top.remove();
      bottom.remove();
    }
  });
});
