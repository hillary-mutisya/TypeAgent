//import { chrome } from 'jest-chrome';
import '../src/extension/serviceWorker/index';
import { ensureWebsocketConnected, getWebSocket, reconnectWebSocket } from '../src/extension/serviceWorker/websocket';
import { toggleSiteTranslator } from '../src/extension/serviceWorker/siteTranslator';
import { showBadgeError, showBadgeHealthy } from '../src/extension/serviceWorker/ui';
import { getActiveTab } from '../src/extension/serviceWorker/tabManager';
import { handleMessage } from '../src/extension/serviceWorker/messageHandlers';
import { initializeContextMenu, handleContextMenuClick } from '../src/extension/serviceWorker/contextMenu';

// Mock all dependencies
jest.mock('../src/extension/serviceWorker/websocket', () => ({
  ensureWebsocketConnected: jest.fn(),
  getWebSocket: jest.fn(),
  reconnectWebSocket: jest.fn()
}));

jest.mock('../src/extension/serviceWorker/siteTranslator', () => ({
  toggleSiteTranslator: jest.fn()
}));

jest.mock('../src/extension/serviceWorker/ui', () => ({
  showBadgeError: jest.fn(),
  showBadgeHealthy: jest.fn(),
  showBadgeBusy: jest.fn()
}));

jest.mock('../src/extension/serviceWorker/tabManager', () => ({
  getActiveTab: jest.fn()
}));

jest.mock('../src/extension/serviceWorker/messageHandlers', () => ({
  handleMessage: jest.fn()
}));

jest.mock('../src/extension/serviceWorker/contextMenu', () => ({
  initializeContextMenu: jest.fn(),
  handleContextMenuClick: jest.fn()
}));

// Helper to trigger events
function triggerChromeEvent(api: any, eventName: string, ...args: any[]) {
  if (api[eventName] && typeof api[eventName].callListeners === 'function') {
    api[eventName].callListeners(...args);
  }
}

describe('Service Worker Initialization', () => {
  beforeEach(() => {
    // Clear the module cache to re-initialize the service worker
    jest.resetModules();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup WebSocket mock
    (ensureWebsocketConnected as jest.Mock).mockResolvedValue(true);
    (getWebSocket as jest.Mock).mockReturnValue({
      readyState: WebSocket.OPEN,
      send: jest.fn()
    });
    
    // Setup tab mock
    (getActiveTab as jest.Mock).mockResolvedValue({
      id: 123,
      url: 'https://example.com',
      active: true
    });
    
    // Setup Chrome API mocks
    chrome.tabs.query.mockResolvedValue([
      { id: 101, title: 'Tab 1', url: 'https://example.com' },
      { id: 102, title: 'Tab 2', url: 'https://test.com' }
    ]);
  });

  it('should initialize context menu and event listeners', async () => {
    // Re-import to trigger initialization
    await import('../src/extension/serviceWorker/index');
    
    // Wait for async initialization to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(ensureWebsocketConnected).toHaveBeenCalled();
    expect(initializeContextMenu).toHaveBeenCalled();
  });

  it('should show error badge if websocket connection fails', async () => {
    (ensureWebsocketConnected as jest.Mock).mockResolvedValue(false);
    
    // Re-import to trigger initialization
    await import('../src/extension/serviceWorker/index');
    
    // Wait for async initialization to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(reconnectWebSocket).toHaveBeenCalled();
    expect(showBadgeError).toHaveBeenCalled();
  });

  describe('Browser Action Click Handler', () => {
    it('should toggle site translator on browser action click', async () => {
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate browser action click
      const tab = { id: 123, url: 'https://example.com' };
      chrome.action.onClicked.callListeners(tab as chrome.tabs.Tab);
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(ensureWebsocketConnected).toHaveBeenCalled();
      expect(toggleSiteTranslator).toHaveBeenCalledWith(tab);
      expect(showBadgeHealthy).toHaveBeenCalled();
    });
    
    it('should show error badge if websocket connection fails on click', async () => {
      (ensureWebsocketConnected as jest.Mock).mockResolvedValue(false);
      
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate browser action click
      const tab = { id: 123, url: 'https://example.com' };
      chrome.action.onClicked.callListeners(tab as chrome.tabs.Tab);
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(reconnectWebSocket).toHaveBeenCalled();
      expect(showBadgeError).toHaveBeenCalled();
    });
  });

  describe('Tab Event Handlers', () => {
    it('should toggle site translator on tab activation', async () => {
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate tab activation
      const tab = { id: 123, url: 'https://example.com' };
      chrome.tabs.get.mockResolvedValueOnce(tab);
      chrome.tabs.onActivated.callListeners({ tabId: 123, windowId: 1 });
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(chrome.tabs.get).toHaveBeenCalledWith(123);
      expect(toggleSiteTranslator).toHaveBeenCalledWith(tab);
    });
    
    it('should toggle site translator on tab update when complete', async () => {
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate tab update
      const tab = { id: 123, url: 'https://example.com', active: true };
      chrome.tabs.onUpdated.callListeners(123, { status: 'complete' }, tab as chrome.tabs.Tab);
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(toggleSiteTranslator).toHaveBeenCalledWith(tab);
    });
    
    it('should not toggle site translator on non-complete tab update', async () => {
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate tab update
      const tab = { id: 123, url: 'https://example.com', active: true };
      chrome.tabs.onUpdated.callListeners(123, { status: 'loading' }, tab as chrome.tabs.Tab);
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(toggleSiteTranslator).not.toHaveBeenCalled();
    });
    
    it('should add tab to index when title changes', async () => {
      // Setup mock WebSocket instance
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: jest.fn()
      };
      (getWebSocket as jest.Mock).mockReturnValue(mockWs);
      
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate tab title change
      const tab = { id: 123, title: 'New Title', url: 'https://example.com', active: true };
      chrome.tabs.onUpdated.callListeners(123, { title: 'New Title' }, tab as chrome.tabs.Tab);
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('addTabIdToIndex'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('New Title'));
    });
    
    it('should add tab to index when tab is created', async () => {
      // Setup mock WebSocket instance
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: jest.fn()
      };
      (getWebSocket as jest.Mock).mockReturnValue(mockWs);
      
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate tab creation
      const tab = { id: 123, title: 'New Tab', url: 'https://example.com' };
      chrome.tabs.onCreated.callListeners(tab as chrome.tabs.Tab);
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('addTabIdToIndex'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('New Tab'));
    });
    
    it('should not add tab to index when tab has no title', async () => {
      // Setup mock WebSocket instance
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: jest.fn()
      };
      (getWebSocket as jest.Mock).mockReturnValue(mockWs);
      
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate tab creation with no title
      const tab = { id: 123, url: 'https://example.com' };
      chrome.tabs.onCreated.callListeners(tab as chrome.tabs.Tab);
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockWs.send).not.toHaveBeenCalled();
    });
    
    it('should remove tab from index when tab is removed', async () => {
      // Setup mock WebSocket instance
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: jest.fn()
      };
      (getWebSocket as jest.Mock).mockReturnValue(mockWs);
      
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate tab removal
      chrome.tabs.onRemoved.callListeners(123, { windowId: 1, isWindowClosing: false });
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('deleteTabIdFromIndex'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('123'));
    });
  });

  describe('Window Event Handlers', () => {
    it('should toggle site translator when window focus changes', async () => {
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate window focus change
      chrome.windows.onFocusChanged.callListeners(1);
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(ensureWebsocketConnected).toHaveBeenCalled();
      expect(getActiveTab).toHaveBeenCalled();
      expect(toggleSiteTranslator).toHaveBeenCalled();
    });
    
    it('should not proceed if window ID is WINDOW_ID_NONE', async () => {
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate window focus change to NONE
      chrome.windows.onFocusChanged.callListeners(chrome.windows.WINDOW_ID_NONE);
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(ensureWebsocketConnected).not.toHaveBeenCalled();
      expect(toggleSiteTranslator).not.toHaveBeenCalled();
    });
    
    it('should rebuild tab index for window', async () => {
      // Setup mock WebSocket instance
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: jest.fn()
      };
      (getWebSocket as jest.Mock).mockReturnValue(mockWs);
      
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate window focus change
      chrome.windows.onFocusChanged.callListeners(1);
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(chrome.tabs.query).toHaveBeenCalledWith({ windowId: 1 });
      expect(mockWs.send).toHaveBeenCalledTimes(2); // For two tabs
    });
  });

  describe('Runtime Message Handler', () => {
    it('should delegate messages to handleMessage', async () => {
      const mockResponse = { result: 'success' };
      (handleMessage as jest.Mock).mockResolvedValue(mockResponse);
      
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Create test message and sender
      const message = { type: 'testMessage' };
      const sender = { id: 'sender-id' };
      
      // Mock sendResponse function
      const sendResponse = jest.fn();
      
      // Call message listener
      const result = chrome.runtime.onMessage.callListeners(message, sender, sendResponse);
      
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(result).toBe(true); // Should return true to indicate async response
      expect(handleMessage).toHaveBeenCalledWith(message, sender);
      expect(sendResponse).toHaveBeenCalledWith(mockResponse);
    });
  });

  describe('Context Menu Handler', () => {
    it('should delegate context menu clicks to handler', async () => {
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Create test info and tab
      const info = { menuItemId: 'testItem' };
      const tab = { id: 123 };
      
      // Call context menu listener
      chrome.contextMenus.onClicked.callListeners(info, tab as chrome.tabs.Tab);
      
      expect(handleContextMenuClick).toHaveBeenCalledWith(info, tab);
    });
  });

  describe('Storage Change Handler', () => {
    it('should handle websocket host changes', async () => {
      // Setup mock WebSocket instance
      const mockWs = {
        readyState: WebSocket.OPEN,
        close: jest.fn()
      };
      (getWebSocket as jest.Mock).mockReturnValue(mockWs);
      
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate storage change
      const changes = {
        websocketHost: {
          oldValue: 'ws://old-host:8080/',
          newValue: 'ws://new-host:8080/'
        }
      };
      
      chrome.storage.onChanged.callListeners(changes, 'sync');
      
      expect(mockWs.close).toHaveBeenCalled();
    });
    
    it('should not close socket for non-websocketHost changes', async () => {
      // Setup mock WebSocket instance
      const mockWs = {
        readyState: WebSocket.OPEN,
        close: jest.fn()
      };
      (getWebSocket as jest.Mock).mockReturnValue(mockWs);
      
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Simulate storage change for different property
      const changes = {
        otherSetting: {
          oldValue: 'old',
          newValue: 'new'
        }
      };
      
      chrome.storage.onChanged.callListeners(changes, 'sync');
      
      expect(mockWs.close).not.toHaveBeenCalled();
    });
  });

  describe('Port Connection Handler', () => {
    it('should handle port connections', async () => {
      // Setup mock WebSocket instance
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      };
      (getWebSocket as jest.Mock).mockReturnValue(mockWs);
      
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Create mock port
      const port = {
        name: 'typeagent',
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn(),
        disconnect: jest.fn()
      };
      
      // Simulate port connection
      chrome.runtime.onConnect.callListeners(port);
      
      expect(mockWs.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
      expect(port.onMessage.addListener).toHaveBeenCalled();
      expect(port.onDisconnect.addListener).toHaveBeenCalled();
    });
    
    it('should disconnect port if WebSocket is not available', async () => {
      // Set WebSocket to not be available
      (getWebSocket as jest.Mock).mockReturnValue(null);
      
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Create mock port
      const port = {
        name: 'typeagent',
        disconnect: jest.fn()
      };
      
      // Simulate port connection
      chrome.runtime.onConnect.callListeners(port);
      
      expect(port.disconnect).toHaveBeenCalled();
    });
    
    it('should ignore non-typeagent connections', async () => {
      // Re-import to trigger initialization
      await import('../src/extension/serviceWorker/index');
      
      // Create mock port with different name
      const port = {
        name: 'other-port',
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() }
      };
      
      // Simulate port connection
      chrome.runtime.onConnect.callListeners(port);
      
      expect(port.onMessage?.addListener).not.toHaveBeenCalled();
      expect(port.onDisconnect?.addListener).not.toHaveBeenCalled();
    });
  });
});
