import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Log } from '@microsoft/sp-core-library';
import {
  BaseApplicationCustomizer,
  PlaceholderContent,
  PlaceholderName,
} from '@microsoft/sp-application-base';
import { Fab } from './components/Fab';
import { shouldShowFab, onSpaNavigate } from './utils/pageGate';
import { logger } from './utils/logger';
import { endpointsFromEnv, endpointsConfigured } from './utils/env';

const LOG_SOURCE = 'ImageoApplicationCustomizer';

export interface IImageoApplicationCustomizerProperties {
  [key: string]: unknown;
}

export default class ImageoApplicationCustomizer
  extends BaseApplicationCustomizer<IImageoApplicationCustomizerProperties> {

  private bottomPlaceholder: PlaceholderContent | undefined;
  private unsubscribeNav: (() => void) | undefined;

  protected onInit(): Promise<void> {
    Log.info(LOG_SOURCE, 'imageo activated');

    this.context.placeholderProvider.changedEvent.add(this, this.renderRoot);
    this.renderRoot();

    this.unsubscribeNav = onSpaNavigate(() => this.renderRoot());

    return Promise.resolve();
  }

  // The render/unmount pair is split across methods (render in renderRoot, unmount
  // here and in the page-gate hide path), which the rushstack lint heuristic can't
  // see. React 17 (the version SPFx 1.23 ships) only offers ReactDom.render.
  protected onDispose(): void {
    if (this.unsubscribeNav) this.unsubscribeNav();
    if (this.bottomPlaceholder?.domElement) {
      try {
        // eslint-disable-next-line @rushstack/pair-react-dom-render-unmount
        ReactDom.unmountComponentAtNode(this.bottomPlaceholder.domElement);
      } catch (err) {
        logger.warn('unmount failed', err);
      }
    }
  }

  private renderRoot = (): void => {
    if (!this.bottomPlaceholder) {
      this.bottomPlaceholder = this.context.placeholderProvider.tryCreateContent(
        PlaceholderName.Bottom,
        { onDispose: () => { /* noop */ } }
      );
    }
    const dom = this.bottomPlaceholder?.domElement;
    if (!dom) return;

    if (!shouldShowFab(this.context)) {
      // eslint-disable-next-line @rushstack/pair-react-dom-render-unmount
      try { ReactDom.unmountComponentAtNode(dom); } catch { /* noop */ }
      return;
    }

    const endpoints = endpointsFromEnv();
    if (!endpointsConfigured(endpoints)) {
      logger.warn(
        'Backend wiring was not injected at build time — deploy first (writes ' +
        '.deploy-output.json) and rebuild. Backend calls will fail until then.'
      );
    }

    const el = React.createElement(Fab, { ctx: this.context, endpoints });
    // eslint-disable-next-line @rushstack/pair-react-dom-render-unmount
    ReactDom.render(el, dom);
  };
}
