import crypto from 'crypto';

import {
  CompleteHocuspocusProviderConfiguration,
  CompleteHocuspocusProviderWebsocketConfiguration,
  HocuspocusProvider,
  HocuspocusProviderConfiguration,
  onOutgoingMessageParameters,
  onStatusParameters,
} from '@hocuspocus/provider';
import type { CloseEvent, MessageEvent } from 'ws';
import * as Y from 'yjs';

import { isAPIError } from '@/api';

import {
  pollOutgoingMessageRequest,
  postPollSyncRequest,
} from '../api/collaborationRequests';
import { toBase64 } from '../utils';

type HocuspocusProviderConfigurationUrl = Required<
  Pick<CompleteHocuspocusProviderConfiguration, 'name'>
> &
  Partial<CompleteHocuspocusProviderConfiguration> &
  Required<Pick<CompleteHocuspocusProviderWebsocketConfiguration, 'url'>>;

export const isHocuspocusProviderConfigurationUrl = (
  data: HocuspocusProviderConfiguration,
): data is HocuspocusProviderConfigurationUrl => {
  return 'url' in data;
};

type CollaborationProviderConfiguration = HocuspocusProviderConfiguration & {
  canEdit: boolean;
};

export class CollaborationProvider extends HocuspocusProvider {
  public canEdit = false;
  public isLongPollingStarted = false;
  public isSyncing = false;
  public isWebsocketFailed = false;
  public seemsUnsyncCount = 0;
  public seemsUnsyncMaxCount = 5;
  protected sse: EventSource | null = null; // Server-Sent Events
  protected url = '';
  public websocketFailureCount = 0;
  public websocketMaxFailureCount = 2;

  public constructor(configuration: CollaborationProviderConfiguration) {
    const withWS = false;

    let url = '';
    if (isHocuspocusProviderConfigurationUrl(configuration)) {
      url = configuration.url;
      configuration.url = !withWS ? 'ws://localhost:6666' : configuration.url;
    }

    super(configuration);

    this.url = url;
    this.canEdit = configuration.canEdit;

    if (configuration.canEdit) {
      this.on('outgoingMessage', this.onPollOutgoingMessage.bind(this));
    }

    this.configuration.websocketProvider.on(
      'connect',
      this.onWebsocketConnect.bind(this),
    );

    this.configuration.websocketProvider.on(
      'disconnect',
      this.onWebsocketDisconnect.bind(this),
    );
  }

  public setPollDefaultValues(): void {
    this.isLongPollingStarted = false;
    this.isWebsocketFailed = false;
    this.seemsUnsyncCount = 0;
    this.sse?.close();
    this.sse = null;
    this.websocketFailureCount = 0;
  }

  public destroy(): void {
    super.destroy();
    this.setPollDefaultValues();
  }

  public onWebsocketConnect = () => {
    this.setPollDefaultValues();
  };

  public onWebsocketDisconnect = () => {
    console.log('disconnect');
  };

  public onStatus({ status }: onStatusParameters) {
    console.log('status:', status);

    super.onStatus({ status });
  }

  public onClose(event: CloseEvent): void {
    console.log('close:', event);
    this.isAuthenticated = false;
    this.synced = false;

    this.websocketFailureCount += 1;

    if (
      !this.isWebsocketFailed &&
      this.websocketFailureCount > this.websocketMaxFailureCount
    ) {
      this.isWebsocketFailed = true;

      if (!this.isLongPollingStarted) {
        this.isLongPollingStarted = true;
        void this.pollSync(true);
        this.initCollaborationSSE();
      }
    } else if (!this.isWebsocketFailed) {
      super.onClose(event);
    }
  }

  protected toPollUrl(endpoint: string): string {
    let pollUrl = this.url.replace('ws:', 'http:');
    if (pollUrl.includes('wss:')) {
      pollUrl = pollUrl.replace('wss:', 'https:');
    }

    pollUrl = pollUrl.replace('/ws/', '/ws/poll/' + endpoint + '/');

    // To have our requests not cached
    return `${pollUrl}&${Date.now()}`;
  }

  /**
   * Outgoing message event
   *
   * Sent to the server the message to
   * be sent to the other users
   */
  public async onPollOutgoingMessage({ message }: onOutgoingMessageParameters) {
    if (!this.isWebsocketFailed || !this.canEdit) {
      return;
    }

    try {
      const { updated } = await pollOutgoingMessageRequest({
        pollUrl: this.toPollUrl('message'),
        message64: Buffer.from(message.toUint8Array()).toString('base64'),
      });

      if (!updated) {
        await this.pollSync();
      }
    } catch (error: unknown) {
      if (isAPIError(error)) {
        // The user is not allowed to send messages
        if (error.status === 403) {
          this.off('outgoingMessage', this.onPollOutgoingMessage.bind(this));
          this.canEdit = false;
        }
      }
    }
  }

  /**
   * EventSource is a API for opening an HTTP
   * connection for receiving push notifications
   * from a server in real-time.
   * We use it to sync the document with the server
   */
  protected initCollaborationSSE() {
    if (!this.isWebsocketFailed) {
      return;
    }

    this.sse = new EventSource(this.toPollUrl('message'), {
      withCredentials: true,
    });

    this.sse.onmessage = (event) => {
      const { updatedDoc64, stateFingerprint, awareness64 } = JSON.parse(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        event.data,
      ) as {
        updatedDoc64?: string;
        stateFingerprint?: string;
        awareness64?: string;
      };

      if (awareness64) {
        const awareness = Buffer.from(awareness64, 'base64');
        this.onMessage({
          data: awareness,
        } as MessageEvent);
      }

      if (updatedDoc64) {
        const uint8Array = Buffer.from(updatedDoc64, 'base64');
        Y.applyUpdate(this.document, uint8Array);
      }

      const localStateFingerprint = this.getStateFingerprint(this.document);
      if (localStateFingerprint !== stateFingerprint) {
        void this.pollSync();
      } else {
        this.seemsUnsyncCount = 0;
      }
    };

    this.sse.onopen = () => {};

    this.sse.onerror = (err) => {
      console.error('SSE error:', err);
      this.sse?.close();

      setTimeout(() => {
        this.initCollaborationSSE();
      }, 5000);
    };
  }

  /**
   * Sync the document with the server.
   *
   * In some rare cases, the document may be out of sync.
   * We use a fingerprint to compare documents,
   * it happens that the local fingerprint is different from the server one
   * when awareness plus the document are updated quickly.
   * The system is resilient to this kind of problems, so `seemsUnsyncCount` should
   * go back to 0 after a few seconds. If not, we will force a sync.
   */
  public async pollSync(forseSync = false) {
    if (!this.isWebsocketFailed || this.isSyncing) {
      return;
    }

    this.seemsUnsyncCount++;

    if (this.seemsUnsyncCount < this.seemsUnsyncMaxCount && !forseSync) {
      return;
    }

    this.isSyncing = true;

    try {
      const { syncDoc64 } = await postPollSyncRequest({
        pollUrl: this.toPollUrl('sync'),
        localDoc64: toBase64(Y.encodeStateAsUpdate(this.document)),
      });

      if (syncDoc64) {
        const uint8Array = Buffer.from(syncDoc64, 'base64');
        Y.applyUpdate(this.document, uint8Array);
        this.seemsUnsyncCount = 0;
      }
    } catch (error) {
      console.error('Polling sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Create a hash SHA-256 of the state vector of the document.
   * Usefull to compare the state of the document.
   * @param doc
   * @returns
   */
  public getStateFingerprint(doc: Y.Doc): string {
    const stateVector = Y.encodeStateVector(doc);
    return crypto.createHash('sha256').update(stateVector).digest('base64');
  }
}
