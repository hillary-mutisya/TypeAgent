import { chrome } from 'jest-chrome';
import { 
  getActiveTab, 
  getTabByTitle, 
  awaitPageLoad, 
  awaitPageIncrementalUpdates,
  downloadStringAsFile,
  downloadImageAsFile
} from '../src/extension/serviceWorker/tabManager';
import { sendActionToTabIndex } from '../src/extension/serviceWorker/index';

// Mock dependencies
jest.mock('../src/extension/serviceWorker/index', () => ({
  sendActionToTabIndex: jest.fn()
}));

describe('Tab Manager Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock chrome.windows.getAll
    chrome.windows.getAll.mockImplementation((options, callback) => {
      const windows = [
        {
          id: 1,
          focused: true,
          type: 'normal',
          tabs: [
            { id: 101, active: true, url: 'https://example.com', title: 'Example Site' },
            { id: 102, active: false, url: 'https://test.com', title: 'Test Site' }
          ]
        },
        {
          id: 2,
          focused: false,
          type: 'normal',
          tabs: [
            { id: 201, active: true, url: 'https://other.com', title: 'Other Site' }
          ]
        },
        {
          id: 3,
          focused: false,
          type: 'devtools',
          tabs: [
            { id: 301, active: true, url: 'chrome-devtools://devtools/bundled/inspector.html', title: 'DevTools' }
          ]
        }
      ];
      
      callback(windows);
    });
    
    // Mock chrome.tabs API
    chrome.tabs.query.mockImplementation(({ title }) => {
      if (title === 'Test Site') {
        return Promise.resolve([{ id: 102, title: 'Test Site', url: 'https://test.com' }]);
      }
      return Promise.resolve([]);
    });
    
    chrome.tabs.get.mockImplementation((tabId) => {
      if (tabId === 102) {
        return Promise.resolve({ id: 102, title: 'Test Site', url: 'https://test.com' });
      }
      return Promise.resolve(undefined);
    });
    
    chrome.tabs.onUpdated = {
      addListener: jest.fn(),
      removeListener: jest.fn()
    };
    
    chrome.scripting.executeScript.mockImplementation(({ func, target, args }) => {
      // Actually execute the function with mocked args to simulate execution
      func(...args);
      return Promise.resolve([{ result: 'success' }]);
    });
    
    // Mock the tab index
    (sendActionToTabIndex as jest.Mock).mockImplementation((action) => {
      if (action.actionName === 'getTabIdFromIndex' && action.parameters.query === 'Test Site') {
        return Promise.resolve('102');
      }
      return Promise.resolve(undefined);
    });
  });

  describe('getActiveTab', () => {
    it('should return the active tab from the focused window', async () => {
      const tab = await getActiveTab();
      
      expect(tab).toBeDefined();
      expect(tab?.id).toBe(101);
      expect(tab?.title).toBe('Example Site');
    });
    
    it('should return the first active tab if no focused window', async () => {
      // Mock no focused windows
      chrome.windows.getAll.mockImplementation((options, callback) => {
        const windows = [
          {
            id: 1,
            focused: false,
            type: 'normal',
            tabs: [
              { id: 101, active: true, url: 'https://example.com', title: 'Example Site' }
            ]
          }
        ];
        
        callback(windows);
      });
      
      const tab = await getActiveTab();
      
      expect(tab).toBeDefined();
      expect(tab?.id).toBe(101);
    });
    
    it('should filter out DevTools windows', async () => {
      // Mock only devtools windows
      chrome.windows.getAll.mockImplementation((options, callback) => {
        const windows = [
          {
            id: 3,
            focused: true,
            type: 'devtools',
            tabs: [
              { id: 301, active: true, url: 'chrome-devtools://devtools/bundled/inspector.html', title: 'DevTools' }
            ]
          },
          {
            id: 4,
            focused: false,
            type: 'normal',
            tabs: [
              { id: 401, active: true, url: 'chrome://extensions', title: 'Extensions' }
            ]
          }
        ];
        
        callback(windows);
      });
      
      const tab = await getActiveTab();
      
      expect(tab).toBeDefined();
      expect(tab?.id).toBe(401);
    });
    
    it('should return undefined if no windows', async () => {
      chrome.windows.getAll.mockImplementation((options, callback) => {
        callback([]);
      });
      
      const tab = await getActiveTab();
      
      expect(tab).toBeUndefined();
    });
  });

  describe('getTabByTitle', () => {
    it('should find a tab using the tab index', async () => {
      const tab = await getTabByTitle('Test Site');
      
      expect(tab).toBeDefined();
      expect(tab?.id).toBe(102);
      expect(tab?.title).toBe('Test Site');
      expect(sendActionToTabIndex).toHaveBeenCalledWith({
        actionName: 'getTabIdFromIndex',
        parameters: { query: 'Test Site' }
      });
    });
    
    it('should find a tab using chrome.tabs.query if not in index', async () => {
      // Force index lookup to fail
      (sendActionToTabIndex as jest.Mock).mockResolvedValueOnce(undefined);
      
      const tab = await getTabByTitle('Test Site');
      
      expect(tab).toBeDefined();
      expect(tab?.title).toBe('Test Site');
      expect(chrome.tabs.query).toHaveBeenCalledWith({ title: 'Test Site' });
    });
    
    it('should return undefined if tab not found', async () => {
      // Force both lookups to fail
      (sendActionToTabIndex as jest.Mock).mockResolvedValueOnce(undefined);
      chrome.tabs.query.mockResolvedValueOnce([]);
      
      const tab = await getTabByTitle('Nonexistent Tab');
      
      expect(tab).toBeUndefined();
    });
    
    it('should return undefined if no title provided', async () => {
      const tab = await getTabByTitle('');
      
      expect(tab).toBeUndefined();
      expect(sendActionToTabIndex).not.toHaveBeenCalled();
    });
  });

  describe('awaitPageLoad', () => {
    it('should resolve immediately if page is already complete', async () => {
      const tab = { id: 101, status: 'complete' };
      
      const result = await awaitPageLoad(tab as chrome.tabs.Tab);
      
      expect(result).toBe('OK');
      expect(chrome.tabs.onUpdated.addListener).not.toHaveBeenCalled();
    });
    
    it('should wait for tab to complete loading', async () => {
      const tab = { id: 101, status: 'loading' };
      
      // Create a promise to resolve when the listener callback is triggered
      let listenerCallback: Function | null = null;
      
      chrome.tabs.onUpdated.addListener.mockImplementation((callback) => {
        listenerCallback = callback;
      });
      
      // Start the await operation
      const awaitPromise = awaitPageLoad(tab as chrome.tabs.Tab);
      
      // Simulate tab update event
      if (listenerCallback) {
        listenerCallback(101, { status: 'complete' }, { id: 101, status: 'complete' });
      }
      
      const result = await awaitPromise;
      
      expect(result).toBe('OK');
      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalled();
    });
  });

  describe('awaitPageIncrementalUpdates', () => {
    it('should wait for incremental page updates', async () => {
      const tab = { id: 101 };
      
      chrome.tabs.sendMessage.mockResolvedValueOnce(true);
      
      await awaitPageIncrementalUpdates(tab as chrome.tabs.Tab);
      
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        101,
        { type: 'await_page_incremental_load' },
        { frameId: 0 }
      );
    });
  });

  describe('downloadStringAsFile', () => {
    it('should create a download link in the page', async () => {
      // Create a spy for document.createElement
      const createElementSpy = jest.spyOn(document, 'createElement');
      
      const tab = { id: 101 };
      const data = 'Test content';
      const filename = 'test.txt';
      
      await downloadStringAsFile(tab as chrome.tabs.Tab, data, filename);
      
      expect(chrome.scripting.executeScript).toHaveBeenCalled();
      
      // Link should have been created
      expect(createElementSpy).toHaveBeenCalledWith('a');
      
      createElementSpy.mockRestore();
    });
  });

  describe('downloadImageAsFile', () => {
    it('should create a download link for the image', async () => {
      // Create a spy for document.createElement
      const createElementSpy = jest.spyOn(document, 'createElement');
      
      const tab = { id: 101 };
      const dataUrl = 'data:image/png;base64,abc123';
      const filename = 'test.png';
      
      await downloadImageAsFile(tab as chrome.tabs.Tab, dataUrl, filename);
      
      expect(chrome.scripting.executeScript).toHaveBeenCalled();
      
      // Link should have been created
      expect(createElementSpy).toHaveBeenCalledWith('a');
      
      createElementSpy.mockRestore();
    });
  });
});
