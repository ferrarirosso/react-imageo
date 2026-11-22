import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Log } from '@microsoft/sp-core-library';
import {
  BaseApplicationCustomizer,
  PlaceholderContent,
  PlaceholderName,
} from '@microsoft/sp-application-base';
import { Fab } from './components/Fab';
import { shouldShowFab } from './utils/pageGate';
import { logger } from './utils/logger';
import { endpointsFromEnv, endpointsConfigured } from './utils/env';

const LOG_SOURCE = 'ImageoApplicationCustomizer';

export interface IImageoApplicationCustomizerProperties {
  [key: string]: unknown;
}

export default class ImageoApplicationCustomizer
  extends BaseApplicationCustomizer<IImageoApplicationCustomizerProperties> {

  private placeholder: PlaceholderContent | undefined;
  private root: Root | undefined;
  private pageRevision = 0;

  protected onInit(): Promise<void> {
    Log.info(LOG_SOURCE, 'imageo activated');

    this.context.placeholderProvider.changedEvent.add(this, this.renderRoot);
    this.context.application.navigatedEvent.add(this, this.onNavigated);
    this.renderRoot();

    return Promise.resolve();
  }

  protected onDispose(): void {
    this.context.placeholderProvider.changedEvent.remove(this, this.renderRoot);
    this.context.application.navigatedEvent.remove(this, this.onNavigated);
    this.placeholder?.dispose();
  }

  private onNavigated = (): void => {
    this.pageRevision++;
    this.renderRoot();
  };

  private unmountRoot(): void {
    const root = this.root;
    this.root = undefined;
    root?.unmount();
  }

  private onPlaceholderDisposed = (content: PlaceholderContent): void => {
    if (content === this.placeholder) {
      this.placeholder = undefined;
      this.unmountRoot();
    }
  };

  private renderRoot = (): void => {
    if (!shouldShowFab(this.context)) {
      this.unmountRoot();
      return;
    }

    if (!this.placeholder?.isVisible) {
      this.placeholder?.dispose();
      for (const name of [PlaceholderName.Bottom, PlaceholderName.Top]) {
        const content = this.context.placeholderProvider.tryCreateContent(name, { onDispose: this.onPlaceholderDisposed });
        if (content?.isVisible) {
          this.placeholder = content;
          break;
        }
        content?.dispose();
      }
    }
    const dom = this.placeholder?.domElement;
    if (!dom) return;

    const endpoints = endpointsFromEnv();
    if (!endpointsConfigured(endpoints)) {
      logger.warn(
        'Backend wiring was not injected at build time — deploy first (writes ' +
        '.deploy-output.json) and rebuild. Backend calls will fail until then.'
      );
    }

    const el = React.createElement(Fab, { key: this.pageRevision, ctx: this.context, endpoints });
    this.root ??= createRoot(dom);
    this.root.render(el);
  };
}
