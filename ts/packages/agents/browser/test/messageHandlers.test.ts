import { chrome } from 'jest-chrome';
import { handleMessage } from '../src/extension/serviceWorker/messageHandlers';
import { getActiveTab } from '../src/extension/serviceWorker/tabManager';
import { getTabHTMLFragments, getTabAnnotatedScreenshot } from '../src/extension/serviceWorker/capture';
import { 
  getRecordedActions, 
  clearRecordedActions, 
  saveRecordedActions 
} from '../src/extension/serviceWorker/storage';
import { 
  sendActionToAgent, 
  ensureWebsocketConnected 
} from '../src/extension/serviceWorker/websocket';

// Mock dependencies
jest.mock('../src/extension/serviceWorker/tabManager', () => ({
  getActiveTab: jest.fn()
}));

jest.mock('../src/extension/serviceWorker/capture', () => ({
  getTabHTMLFragments: jest.fn(),
  getTabAnnotatedScreenshot: jest.fn()
}));

jest.mock('../src/extension/serviceWorker/storage', () => ({
  getRecordedActions: jest.fn(),
  clearRecordedActions: jest.fn(),
  saveRecordedActions: jest.fn()
}));

jest.mock('../src/extension/serviceWorker/websocket', () => ({
  sendActionToAgent: jest.fn(),
  ensureWebsocketConnected: jest.fn()
}));

describe('Message Handlers Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup common mocks
    (getActiveTab as jest.Mock).mockResolvedValue({ 
      id: 123, 
      url: 'https://example.com' 
    });
    
    chrome.tabs.sendMessage.mockImplementation(() => Promise.resolve({
      recordedActions: ['action1', 'action2'],
      recordedActionPageHTML: '<html>Test</html>',
      recordedActionScreenshot: 'data:image/png;base64,test'
    }));
    
    (ensureWebsocketConnected as jest.Mock).mockResolvedValue(true);
  });

  describe('initialize message', () => {
    it('should initialize the service worker', async () => {
      const result = await handleMessage({ type: 'initialize' }, {});
      
      expect(result).toBe('Service worker initialize called');
      expect(ensureWebsocketConnected).toHaveBeenCalled();
    });
    
    it('should handle connection failures gracefully', async () => {
      (ensureWebsocketConnected as jest.Mock).mockResolvedValue(false);
      
      const result = await handleMessage({ type: 'initialize' }, {});
      
      expect(result).toBe('Service worker initialize called');
    });
  });

  describe('refreshSchema message', () => {
    it('should fetch and return schema', async () => {
      const mockResult = {
        schema: { actions: ['action1'] },
        typeDefinitions: ['type1', 'type2']
      };
      
      (sendActionToAgent as jest.Mock).mockResolvedValue(mockResult);
      
      const result = await handleMessage({ type: 'refreshSchema' }, {});
      
      expect(result).toEqual({
        schema: mockResult.schema,
        actionDefinitions: mockResult.typeDefinitions
      });
      
      expect(sendActionToAgent).toHaveBeenCalledWith({
        actionName: 'detectPageActions',
        parameters: { registerAgent: false }
      });
    });
  });

  describe('registerTempSchema message', () => {
    it('should register a temporary schema', async () => {
      const mockSchema = { actions: ['action1'] };
      
      (sendActionToAgent as jest.Mock).mockResolvedValue(mockSchema);
      
      const result = await handleMessage(
        { 
          type: 'registerTempSchema',
          agentName: 'testAgent'
        }, 
        {}
      );
      
      expect(result).toEqual({ schema: mockSchema });
      
      expect(sendActionToAgent).toHaveBeenCalledWith({
        actionName: 'registerPageDynamicAgent',
        parameters: { agentName: 'testAgent' }
      });
    });
  });

  describe('startRecording message', () => {
    it('should start recording in the active tab', async () => {
      const result = await handleMessage({ type: 'startRecording' }, {});
      
      expect(result).toEqual({});
      expect(getActiveTab).toHaveBeenCalled();
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        123,
        { type: 'startRecording' },
        { frameId: 0 }
      );
    });
  });

  describe('stopRecording message', () => {
    it('should stop recording in the active tab', async () => {
      const mockResponse = { actions: ['action1', 'action2'] };
      chrome.tabs.sendMessage.mockResolvedValueOnce(mockResponse);
      
      const result = await handleMessage({ type: 'stopRecording' }, {});
      
      expect(result).toEqual(mockResponse);
      expect(getActiveTab).toHaveBeenCalled();
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        123,
        { type: 'stopRecording' },
        { frameId: 0 }
      );
    });
  });

  describe('takeScreenshot message', () => {
    it('should capture tab screenshot', async () => {
      const screenshotUrl = 'data:image/png;base64,test';
      chrome.tabs.captureVisibleTab.mockResolvedValueOnce(screenshotUrl);
      
      const result = await handleMessage({ type: 'takeScreenshot' }, {});
      
      expect(result).toBe(screenshotUrl);
      expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledWith({
        format: 'png'
      });
    });
  });

  describe('captureHtmlFragments message', () => {
    it('should capture HTML fragments', async () => {
      const mockFragments = [
        { frameId: 0, content: '<html><body>Test</body></html>', text: 'Test' }
      ];
      (getTabHTMLFragments as jest.Mock).mockResolvedValueOnce(mockFragments);
      
      const result = await handleMessage({ type: 'captureHtmlFragments' }, {});
      
      expect(result).toEqual(mockFragments);
      expect(getActiveTab).toHaveBeenCalled();
      expect(getTabHTMLFragments).toHaveBeenCalledWith(
        expect.objectContaining({ id: 123 })
      );
    });
    
    it('should return empty array if no active tab', async () => {
      (getActiveTab as jest.Mock).mockResolvedValueOnce(undefined);
      
      const result = await handleMessage({ type: 'captureHtmlFragments' }, {});
      
      expect(result).toEqual([]);
    });
  });

  describe('saveRecordedActions message', () => {
    it('should save recorded actions', async () => {
      const message = {
        type: 'saveRecordedActions',
        recordedActions: ['action1', 'action2'],
        recordedActionPageHTML: '<html>Test</html>',
        recordedActionScreenshot: 'data:image/png;base64,test',
        actionIndex: 1,
        isCurrentlyRecording: true
      };
      
      const result = await handleMessage(message, {});
      
      expect(result).toEqual({});
      expect(saveRecordedActions).toHaveBeenCalledWith(
        message.recordedActions,
        message.recordedActionPageHTML,
        message.recordedActionScreenshot,
        message.actionIndex,
        message.isCurrentlyRecording
      );
    });
  });

  describe('recordingStopped message', () => {
    it('should save recorded actions with recording flag set to false', async () => {
      const message = {
        type: 'recordingStopped',
        recordedActions: ['action1', 'action2'],
        recordedActionPageHTML: '<html>Test</html>',
        recordedActionScreenshot: 'data:image/png;base64,test',
        actionIndex: 1
      };
      
      const result = await handleMessage(message, {});
      
      expect(result).toEqual({});
      expect(saveRecordedActions).toHaveBeenCalledWith(
        message.recordedActions,
        message.recordedActionPageHTML,
        message.recordedActionScreenshot,
        message.actionIndex,
        false
      );
    });
  });

  describe('getRecordedActions message', () => {
    it('should get recorded actions', async () => {
      const mockActions = {
        recordedActions: ['action1', 'action2'],
        recordedActionPageHTML: '<html>Test</html>',
        annotatedScreenshot: 'data:image/png;base64,test',
        actionIndex: 1,
        isCurrentlyRecording: false
      };
      
      (getRecordedActions as jest.Mock).mockResolvedValueOnce(mockActions);
      
      const result = await handleMessage({ type: 'getRecordedActions' }, {});
      
      expect(result).toEqual(mockActions);
      expect(getRecordedActions).toHaveBeenCalled();
    });
  });

  describe('clearRecordedActions message', () => {
    it('should clear recorded actions', async () => {
      const result = await handleMessage({ type: 'clearRecordedActions' }, {});
      
      expect(result).toEqual({});
      expect(clearRecordedActions).toHaveBeenCalled();
    });
    
    it('should handle errors gracefully', async () => {
      (clearRecordedActions as jest.Mock).mockRejectedValueOnce(new Error('Test error'));
      
      const result = await handleMessage({ type: 'clearRecordedActions' }, {});
      
      expect(result).toEqual({});
      // Should not throw error
    });
  });

  describe('downloadData message', () => {
    it('should create a download', async () => {
      const message = {
        type: 'downloadData',
        data: { key: 'value' },
        filename: 'test.json'
      };
      
      const result = await handleMessage(message, {});
      
      expect(result).toEqual({});
      expect(chrome.downloads.download).toHaveBeenCalledWith({
        url: expect.stringContaining('data:application/json'),
        filename: 'test.json',
        saveAs: true
      });
    });
    
    it('should use default filename if none provided', async () => {
      const message = {
        type: 'downloadData',
        data: { key: 'value' }
      };
      
      const result = await handleMessage(message, {});
      
      expect(result).toEqual({});
      expect(chrome.downloads.download).toHaveBeenCalledWith({
        url: expect.stringContaining('data:application/json'),
        filename: 'schema-metadata.json',
        saveAs: true
      });
    });
  });

  describe('getIntentFromRecording message', () => {
    it('should get intent from recording', async () => {
      const mockResult = {
        intent: 'Navigate to the homepage',
        intentJson: { type: 'Navigation', target: 'home' },
        actions: ['action1', 'action2'],
        intentTypeDefinition: 'type NavigationIntent'
      };
      
      (sendActionToAgent as jest.Mock).mockResolvedValueOnce(mockResult);
      
      const message = {
        type: 'getIntentFromRecording',
        actionName: 'Navigation',
        actionDescription: 'Navigate to home',
        steps: ['click link', 'wait for load'],
        existingActionNames: ['Login', 'Search'],
        html: ['<html>Test</html>'],
        screenshot: 'data:image/png;base64,test'
      };
      
      const result = await handleMessage(message, {});
      
      expect(result).toEqual({
        intent: mockResult.intent,
        intentJson: mockResult.intentJson,
        actions: mockResult.actions,
        intentTypeDefinition: mockResult.intentTypeDefinition
      });
      
      expect(sendActionToAgent).toHaveBeenCalledWith({
        actionName: 'getIntentFromRecording',
        parameters: {
          recordedActionName: message.actionName,
          recordedActionDescription: message.actionDescription,
          recordedActionSteps: message.steps,
          existingActionNames: message.existingActionNames,
          fragments: message.html,
          screenshots: message.screenshot
        }
      });
    });
  });

  describe('unknown message type', () => {
    it('should return null for unknown message type', async () => {
      const result = await handleMessage({ type: 'unknownType' }, {});
      
      expect(result).toBeNull();
    });
  });
});
