export type MockPushCall = { event: string; payload: Record<string, unknown> };

/**
 * Deterministic phoenix channel mock: records pushes, exposes join
 * acknowledgements and error/close triggers for tests.
 */
export class MockPhoenixChannel {
  topic: string;
  state = "closed";
  pushes: MockPushCall[] = [];
  leaveCalls = 0;
  joinReceives: Record<string, (response?: unknown) => void> = {};
  private errorHandlers: Array<() => void> = [];
  private closeHandlers: Array<() => void> = [];

  constructor(topic: string) {
    this.topic = topic;
  }

  onError(handler: () => void) {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void) {
    this.closeHandlers.push(handler);
  }

  on(_event: string, _handler: (payload: unknown) => void) {
    // Registration only; remote event delivery is out of scope here.
  }

  push(event: string, payload: Record<string, unknown>) {
    this.pushes.push({ event, payload });
  }

  join(_timeoutMs?: number) {
    this.state = "joining";
    const receiver = {
      receive: (status: string, handler: (response?: unknown) => void) => {
        this.joinReceives[status] = handler;
        return receiver;
      },
    };
    return receiver;
  }

  leave() {
    this.leaveCalls += 1;
    this.state = "closed";
  }

  simulateJoinOk() {
    this.state = "joined";
    this.joinReceives.ok?.({});
  }

  simulateJoinError() {
    this.joinReceives.error?.({});
  }

  triggerError() {
    for (const handler of [...this.errorHandlers, ...this.closeHandlers]) {
      handler();
    }
  }
}

/**
 * Deterministic phoenix socket mock: captures constructor options and
 * channel creation, never opens a network connection.
 */
export class MockPhoenixSocket {
  endpointUrl: string;
  options: { params?: Record<string, unknown>; timeout?: number };
  channels: MockPhoenixChannel[] = [];
  connectCalls = 0;
  disconnectCalls = 0;
  private errorHandlers: Array<() => void> = [];
  private closeHandlers: Array<() => void> = [];

  constructor(endpointUrl: string, options: { params?: Record<string, unknown>; timeout?: number }) {
    this.endpointUrl = endpointUrl;
    this.options = options;
    createdSockets.push(this);
  }

  channel(topic: string) {
    const channel = new MockPhoenixChannel(topic);
    this.channels.push(channel);
    return channel;
  }

  onError(handler: () => void) {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void) {
    this.closeHandlers.push(handler);
  }

  connect() {
    this.connectCalls += 1;
  }

  disconnect() {
    this.disconnectCalls += 1;
  }

  triggerError() {
    for (const handler of [...this.errorHandlers, ...this.closeHandlers]) {
      handler();
    }
  }
}

export const createdSockets: MockPhoenixSocket[] = [];

// The module under test does `import { Socket } from "phoenix"`, so the mock
// module must expose the same export name it redirects.
export const Socket = MockPhoenixSocket;
