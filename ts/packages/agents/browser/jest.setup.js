const chrome = require('jest-chrome');
global.chrome = chrome;

if (!chrome.runtime) {
  chrome.runtime = {};
}


// Add callListeners method to all Chrome event objects
Object.values(chrome).forEach(namespace => {
  if (namespace && typeof namespace === 'object') {
    Object.entries(namespace).forEach(([key, value]) => {
      if (value && typeof value === 'object' && value.addListener && !value.callListeners) {
        value.callListeners = (...args) => {
          const listeners = value.addListener.mock.calls.map(call => call[0]);
          listeners.forEach(listener => {
            listener(...args);
          });
        };
      }
    });
  }
});

// Mock WebSocket (needed for service worker tests)
global.WebSocket = class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.CONNECTING;
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) this.onopen();
    }, 0);
  }

  send(data) {
    // Mock implementation
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose({ reason: "" });
  }

  addEventListener(event, callback) {
    this['on' + event] = callback;
  }

  removeEventListener(event, callback) {
    if (this['on' + event] === callback) {
      this['on' + event] = null;
    }
  }
};

WebSocket.CONNECTING = 0;
WebSocket.OPEN = 1;
WebSocket.CLOSING = 2;
WebSocket.CLOSED = 3;

// Mock Blob (JSDOM doesn't implement Blob.text())
if (!Blob.prototype.text) {
  Blob.prototype.text = function() {
    return Promise.resolve(this.content ? this.content[0] : '');
  };
}

// Mock MessageEvent
global.MessageEvent = class MockMessageEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.data = options.data;
  }
};

// Mock chrome.runtime.id
if (!chrome.runtime.id) {
  chrome.runtime.id = 'test-extension-id';
}

// Add any browser APIs that JSDOM doesn't provide
if (!global.URL.createObjectURL) {
  global.URL.createObjectURL = jest.fn(() => 'mock-object-url');
}

if (!global.URL.revokeObjectURL) {
  global.URL.revokeObjectURL = jest.fn();
}
