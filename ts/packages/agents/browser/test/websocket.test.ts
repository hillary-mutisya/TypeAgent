import { 
  createWebSocket, 
  ensureWebsocketConnected, 
  sendActionToAgent, 
  getWebSocket,
  setWebSocket
} from '../src/extension/serviceWorker/websocket';
import { showBadgeError, showBadgeHealthy } from '../src/extension/serviceWorker/ui';
import { getSettings } from '../src/extension/serviceWorker/storage';

// Mock dependencies
jest.mock('../src/extension/serviceWorker/ui', () => ({
  showBadgeError: jest.fn(),
  showBadgeHealthy: jest.fn(),
  showBadgeBusy: jest.fn(),
}));

jest.mock('../src/extension/serviceWorker/storage', () => ({
  getSettings: jest.fn().mockResolvedValue({ websocketHost: 'ws://localhost:8080/' }),
}));

describe('WebSocket Module', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    // Reset the WebSocket instance
    setWebSocket(undefined);
  });

  describe('createWebSocket', () => {
    it('should create a new WebSocket connection', async () => {
      const webSocket = await createWebSocket();
      
      // Validate that it created a websocket
      expect(webSocket).toBeDefined();
      expect(webSocket?.readyState).toBe(WebSocket.OPEN);
      
      // Verify settings were fetched
      expect(getSettings).toHaveBeenCalled();
    });

    it('should include correct connection params', async () => {
      // Store the URL that was passed to WebSocket constructor
      let websocketUrl = '';
      const originalWebSocket = global.WebSocket;
      
      // Create a spy on WebSocket constructor
      const webSocketSpy = jest.spyOn(global, 'WebSocket').mockImplementation((url: string | URL) => {
        websocketUrl = url.toString();
        return new originalWebSocket(url);
      });

      await createWebSocket();
      
      // Restore original WebSocket
      webSocketSpy.mockRestore();

      // Check that URL includes expected parameters
      expect(websocketUrl).toContain('ws://localhost:8080/');
      expect(websocketUrl).toContain('channel=browser');
      expect(websocketUrl).toContain('role=client');
      expect(websocketUrl).toContain('clientId=');
    });
  });

  describe('ensureWebsocketConnected', () => {
    it('should create a new connection if none exists', async () => {
      const webSocket = await ensureWebsocketConnected();
      
      expect(webSocket).toBeDefined();
      expect(webSocket?.readyState).toBe(WebSocket.OPEN);
    });

    it('should reuse existing connection if open', async () => {
      // Create a connection
      const webSocket1 = await ensureWebsocketConnected();
      
      // Create a spy to track WebSocket constructor calls
      const webSocketSpy = jest.spyOn(global, 'WebSocket');
      const createCount = webSocketSpy.mock.calls.length;
      
      // Call again
      const webSocket2 = await ensureWebsocketConnected();
      
      // Should be the same instance
      expect(webSocket2).toBe(webSocket1);
      
      // No new WebSocket should have been created
      expect(webSocketSpy.mock.calls.length).toBe(createCount);
      
      // Clean up spy
      webSocketSpy.mockRestore();
    });

    it('should create new connection if existing one is closed', async () => {
      // Create a connection
      const webSocket1 = await ensureWebsocketConnected();
      
      // Close it
      webSocket1?.close();
      
      // Call again
      const webSocket2 = await ensureWebsocketConnected();
      
      // Should be a new instance
      expect(webSocket2).not.toBe(webSocket1);
      expect(webSocket2?.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe('sendActionToAgent', () => {
    it('should send action and return response', async () => {
      // Setup WebSocket with mocked send method
      const ws = await ensureWebsocketConnected();
      
      if (ws) {
        // Mock the send method
        const originalSend = ws.send;
        ws.send = jest.fn().mockImplementation((data: string) => {
          originalSend.call(ws, data);
          
          // Simulate a response
          const parsed = JSON.parse(data);
          setTimeout(() => {
            if (ws.onmessage) {
              const response = {
                id: parsed.id,
                result: { success: true, data: 'test data' }
              };
              const blob = new Blob([JSON.stringify(response)]);
              ws.onmessage(new MessageEvent('message', { data: blob }));
            }
          }, 10);
        });
      }

      // Call the method
      const result = await sendActionToAgent({
        actionName: 'testAction',
        parameters: { param1: 'value1' }
      });

      // Verify results
      expect(result).toEqual({ success: true, data: 'test data' });
      expect(ws?.send).toHaveBeenCalled();
      
      // Check message structure
      const sendMock = ws?.send as jest.Mock;
      const sentData = JSON.parse(sendMock.mock.calls[0][0]);
      expect(sentData.method).toBe('testAction');
      expect(sentData.params).toEqual({ param1: 'value1' });
      expect(sentData.id).toBeDefined();
    });

    it('should throw if no websocket connection', async () => {
      // Ensure no WebSocket is connected
      setWebSocket(undefined);
      
      // Should throw
      await expect(
        sendActionToAgent({
          actionName: 'testAction',
          parameters: { param1: 'value1' }
        })
      ).rejects.toThrow('No websocket connection.');
    });
  });
});