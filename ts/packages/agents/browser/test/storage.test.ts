import { chrome } from 'jest-chrome';
import {
  getStoredPageProperty,
  setStoredPageProperty,
  deleteStoredPageProperty,
  setPageSchema,
  getPageSchema,
  removePageSchema,
  saveRecordedActions,
  getRecordedActions,
  clearRecordedActions,
  getSettings
} from '../src/extension/serviceWorker/storage';

describe('Storage Module', () => {
  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();
    
    // Setup chrome.storage mocks
    chrome.storage.local.get.mockImplementation((keys) => {
      const result = {};
      const mockData = {
        'https://example.com': {
          property1: 'value1',
          property2: 'value2'
        }
      };
      
      // If keys is an array, return matching values
      if (Array.isArray(keys)) {
        keys.forEach(key => {
          if (mockData[key]) {
            result[key] = mockData[key];
          }
        });
      } else if (typeof keys === 'string') {
        // If keys is a string, return just that property
        if (mockData[keys]) {
          result[keys] = mockData[keys];
        }
      } else {
        // Otherwise return everything
        return Promise.resolve(mockData);
      }
      
      return Promise.resolve(result);
    });
    
    chrome.storage.local.set.mockImplementation(() => Promise.resolve());
    chrome.storage.local.remove.mockImplementation(() => Promise.resolve());
    
    chrome.storage.session.get.mockImplementation((keys) => {
      const mockSessionData = {
        pageSchema: [
          { url: 'https://example.com', body: { actions: ['action1'] } },
          { url: 'https://other.com', body: { actions: ['action2'] } }
        ],
        recordedActions: ['action1', 'action2'],
        recordedActionPageHTML: '<html>Test</html>',
        annotatedScreenshot: 'data:image/png;base64,abc123',
        actionIndex: 1,
        isCurrentlyRecording: false
      };
      
      const result = {};
      if (Array.isArray(keys)) {
        keys.forEach(key => {
          if (mockSessionData[key]) {
            result[key] = mockSessionData[key];
          }
        });
      }
      
      return Promise.resolve(result);
    });
    
    chrome.storage.session.set.mockImplementation(() => Promise.resolve());
    chrome.storage.session.remove.mockImplementation(() => Promise.resolve());
    
    chrome.storage.sync.get.mockImplementation((defaultValues) => {
      return Promise.resolve(defaultValues);
    });
  });

  describe('getStoredPageProperty', () => {
    it('should retrieve a stored property', async () => {
      const value = await getStoredPageProperty('https://example.com', 'property1');
      expect(value).toBe('value1');
      expect(chrome.storage.local.get).toHaveBeenCalledWith(['https://example.com']);
    });
    
    it('should return null if property not found', async () => {
      const value = await getStoredPageProperty('https://example.com', 'nonexistent');
      expect(value).toBeNull();
    });
    
    it('should return null if URL not found', async () => {
      chrome.storage.local.get.mockResolvedValueOnce({});
      const value = await getStoredPageProperty('https://nonexistent.com', 'property1');
      expect(value).toBeNull();
    });
  });

  describe('setStoredPageProperty', () => {
    it('should set a property for a URL', async () => {
      await setStoredPageProperty('https://example.com', 'newProperty', 'newValue');
      
      expect(chrome.storage.local.get).toHaveBeenCalledWith(['https://example.com']);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        'https://example.com': {
          property1: 'value1',
          property2: 'value2',
          newProperty: 'newValue'
        }
      });
    });
    
    it('should create new entry if URL not found', async () => {
      chrome.storage.local.get.mockResolvedValueOnce({});
      
      await setStoredPageProperty('https://new-site.com', 'property', 'value');
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        'https://new-site.com': {
          property: 'value'
        }
      });
    });
  });

  describe('deleteStoredPageProperty', () => {
    it('should delete a property', async () => {
      await deleteStoredPageProperty('https://example.com', 'property1');
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        'https://example.com': {
          property2: 'value2'
        }
      });
    });
    
    it('should remove URL entry if last property deleted', async () => {
      // Mock to return data with only one property
      chrome.storage.local.get.mockResolvedValueOnce({
        'https://example.com': {
          lastProperty: 'value'
        }
      });
      
      await deleteStoredPageProperty('https://example.com', 'lastProperty');
      
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('https://example.com');
    });
  });

  describe('getPageSchema / setPageSchema', () => {
    it('should retrieve the schema for a URL', async () => {
      const schema = await getPageSchema('https://example.com');
      
      expect(schema).toEqual({ actions: ['action1'] });
      expect(chrome.storage.session.get).toHaveBeenCalledWith(['pageSchema']);
    });
    
    it('should return undefined if schema not found', async () => {
      const schema = await getPageSchema('https://nonexistent.com');
      
      expect(schema).toBeUndefined();
    });
    
    it('should set a schema for a URL', async () => {
      const newSchema = { actions: ['newAction'] };
      
      await setPageSchema('https://example.com', newSchema);
      
      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        pageSchema: [
          { url: 'https://other.com', body: { actions: ['action2'] } },
          { url: 'https://example.com', body: newSchema }
        ]
      });
    });
    
    it('should add new schema if URL not found', async () => {
      const newSchema = { actions: ['newAction'] };
      
      await setPageSchema('https://new-site.com', newSchema);
      
      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        pageSchema: [
          { url: 'https://example.com', body: { actions: ['action1'] } },
          { url: 'https://other.com', body: { actions: ['action2'] } },
          { url: 'https://new-site.com', body: newSchema }
        ]
      });
    });
  });

  describe('removePageSchema', () => {
    it('should remove schema for a URL', async () => {
      await removePageSchema('https://example.com');
      
      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        pageSchema: [
          { url: 'https://other.com', body: { actions: ['action2'] } }
        ]
      });
    });
  });

  describe('recorded actions storage', () => {
    it('should save recorded actions', async () => {
      const actions = ['action1', 'action2'];
      const html = '<html>Content</html>';
      const screenshot = 'data:image/png;base64,xyz';
      
      await saveRecordedActions(actions, html, screenshot, 1, true);
      
      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        recordedActions: actions,
        recordedActionPageHTML: html,
        annotatedScreenshot: screenshot,
        actionIndex: 1,
        isCurrentlyRecording: true
      });
    });
    
    it('should get recorded actions', async () => {
      const result = await getRecordedActions();
      
      expect(result).toEqual({
        recordedActions: ['action1', 'action2'],
        recordedActionPageHTML: '<html>Test</html>',
        annotatedScreenshot: 'data:image/png;base64,abc123',
        actionIndex: 1,
        isCurrentlyRecording: false
      });
      
      expect(chrome.storage.session.get).toHaveBeenCalledWith([
        'recordedActions',
        'recordedActionPageHTML',
        'annotatedScreenshot',
        'actionIndex',
        'isCurrentlyRecording'
      ]);
    });
    
    it('should clear recorded actions', async () => {
      await clearRecordedActions();
      
      expect(chrome.storage.session.remove).toHaveBeenCalledWith([
        'recordedActions',
        'recordedActionPageHTML',
        'annotatedScreenshot',
        'actionIndex',
        'isCurrentlyRecording'
      ]);
    });
  });

  describe('getSettings', () => {
    it('should return default settings if none exist', async () => {
      const settings = await getSettings();
      
      expect(settings).toEqual({
        websocketHost: 'ws://localhost:8080/'
      });
      
      expect(chrome.storage.sync.get).toHaveBeenCalledWith({
        websocketHost: 'ws://localhost:8080/'
      });
    });
    
    it('should return custom settings if they exist', async () => {
      chrome.storage.sync.get.mockImplementationOnce((defaults) => {
        return Promise.resolve({
          websocketHost: 'ws://custom-host:9090/'
        });
      });
      
      const settings = await getSettings();
      
      expect(settings).toEqual({
        websocketHost: 'ws://custom-host:9090/'
      });
    });
  });
});
