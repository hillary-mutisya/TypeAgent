import { chrome } from 'jest-chrome';
import { runBrowserAction } from '../src/extension/serviceWorker/browserActions';
import { getActiveTab, getTabByTitle, awaitPageLoad, downloadStringAsFile } from '../src/extension/serviceWorker/tabManager';
import { getTabScreenshot, getTabHTMLFragments } from '../src/extension/serviceWorker/capture';
import { getPageSchema, setPageSchema } from '../src/extension/serviceWorker/storage';

// Mock dependencies
jest.mock('../tabManager', () => ({
  getActiveTab: jest.fn(),
  getTabByTitle: jest.fn(),
  awaitPageLoad: jest.fn(),
  awaitPageIncrementalUpdates: jest.fn(),
  downloadStringAsFile: jest.fn(),
  downloadImageAsFile: jest.fn(),
}));

jest.mock('../capture', () => ({
  getTabScreenshot: jest.fn(),
  getTabAnnotatedScreenshot: jest.fn(),
  getTabHTMLFragments: jest.fn(),
  getFilteredHTMLFragments: jest.fn(),
}));

jest.mock('../storage', () => ({
  getPageSchema: jest.fn(),
  setPageSchema: jest.fn(),
  getStoredPageProperty: jest.fn(),
  setStoredPageProperty: jest.fn(),
}));

describe('Browser Actions Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock tab for tests
    const mockTab = {
      id: 123,
      url: 'https://example.com',
      active: true,
      title: 'Example Page',
      status: 'complete'
    };
    
    // Mock common tab retrieval
    (getActiveTab as jest.Mock).mockResolvedValue(mockTab);
    (getTabByTitle as jest.Mock).mockResolvedValue(mockTab);
    
    // Mock chrome API methods
    chrome.tabs.create.mockImplementation(({ url }) => {
      return Promise.resolve({
        id: 456,
        url,
        active: true,
        title: 'New Tab',
        status: 'loading'
      });
    });
    
    chrome.tabs.update.mockImplementation(() => {
      return Promise.resolve();
    });
    
    chrome.tabs.sendMessage.mockImplementation(() => {
      return Promise.resolve({ success: true });
    });
  });

  describe('openTab action', () => {
    it('should open a new tab with URL', async () => {
      (awaitPageLoad as jest.Mock).mockResolvedValue('OK');
      
      const result = await runBrowserAction({
        actionName: 'openTab',
        parameters: { url: 'https://example.org' }
      });
      
      expect(result.message).toBe('Opened new tab to https://example.org');
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://example.org'
      });
      expect(awaitPageLoad).toHaveBeenCalled();
    });
    
    it('should open a new tab with search query', async () => {
      const result = await runBrowserAction({
        actionName: 'openTab',
        parameters: { query: 'test query' }
      });
      
      expect(result.message).toBe('Opened new tab with query test query');
      expect(chrome.search.query).toHaveBeenCalledWith({
        disposition: 'NEW_TAB',
        text: 'test query'
      });
    });
    
    it('should open a blank new tab if no url or query', async () => {
      const result = await runBrowserAction({
        actionName: 'openTab',
        parameters: {}
      });
      
      expect(result.message).toBe('Opened new tab');
      expect(chrome.tabs.create).toHaveBeenCalledWith({});
    });
  });

  describe('closeTab action', () => {
    it('should close the active tab if no title specified', async () => {
      const result = await runBrowserAction({
        actionName: 'closeTab',
        parameters: {}
      });
      
      expect(result.message).toBe('Closed tab');
      expect(getActiveTab).toHaveBeenCalled();
      expect(chrome.tabs.remove).toHaveBeenCalledWith(123);
    });
    
    it('should close a tab by title', async () => {
      (getTabByTitle as jest.Mock).mockResolvedValue({
        id: 789,
        title: 'Target Tab'
      });
      
      const result = await runBrowserAction({
        actionName: 'closeTab',
        parameters: { title: 'Target Tab' }
      });
      
      expect(result.message).toBe('Closed tab');
      expect(getTabByTitle).toHaveBeenCalledWith('Target Tab');
      expect(chrome.tabs.remove).toHaveBeenCalledWith(789);
    });
  });

  describe('captureScreenshot action', () => {
    it('should capture a screenshot', async () => {
      (getTabScreenshot as jest.Mock).mockResolvedValue('data:image/png;base64,abc123');
      
      const result = await runBrowserAction({
        actionName: 'captureScreenshot',
        parameters: {}
      });
      
      expect(result.data).toBe('data:image/png;base64,abc123');
      expect(getTabScreenshot).toHaveBeenCalledWith(undefined);
    });
    
    it('should capture and download a screenshot', async () => {
      (getTabScreenshot as jest.Mock).mockResolvedValue('data:image/png;base64,abc123');
      
      const result = await runBrowserAction({
        actionName: 'captureScreenshot',
        parameters: { downloadAsFile: true }
      });
      
      expect(result.data).toBe('data:image/png;base64,abc123');
      expect(getTabScreenshot).toHaveBeenCalledWith(true);
    });
  });

  describe('getHTML action', () => {
    it('should get HTML fragments', async () => {
      const mockFragments = [
        { frameId: 0, content: '<html><body>Test</body></html>', text: 'Test' }
      ];
      (getTabHTMLFragments as jest.Mock).mockResolvedValue(mockFragments);
      
      const result = await runBrowserAction({
        actionName: 'getHTML',
        parameters: {}
      });
      
      expect(result.data).toEqual(mockFragments);
      expect(getTabHTMLFragments).toHaveBeenCalledWith(
        expect.objectContaining({ id: 123 }),
        undefined,
        undefined,
        undefined,
        undefined
      );
    });
    
    it('should pass parameters correctly', async () => {
      const mockFragments = [
        { frameId: 0, content: '<html><body>Test</body></html>', text: 'Test' }
      ];
      (getTabHTMLFragments as jest.Mock).mockResolvedValue(mockFragments);
      
      await runBrowserAction({
        actionName: 'getHTML',
        parameters: {
          fullHTML: true,
          downloadAsFile: true,
          extractText: true,
          useTimestampIds: true
        }
      });
      
      expect(getTabHTMLFragments).toHaveBeenCalledWith(
        expect.objectContaining({ id: 123 }),
        true,
        true,
        true,
        true
      );
    });
  });

  describe('getPageSchema action', () => {
    it('should get the page schema', async () => {
      const mockSchema = { actions: ['action1', 'action2'] };
      (getPageSchema as jest.Mock).mockResolvedValue(mockSchema);
      
      const result = await runBrowserAction({
        actionName: 'getPageSchema',
        parameters: {}
      });
      
      expect(result.data).toEqual(mockSchema);
      expect(getPageSchema).toHaveBeenCalledWith('https://example.com');
    });
    
    it('should use specified URL if provided', async () => {
      const mockSchema = { actions: ['action1', 'action2'] };
      (getPageSchema as jest.Mock).mockResolvedValue(mockSchema);
      
      const result = await runBrowserAction({
        actionName: 'getPageSchema',
        parameters: { url: 'https://other-url.com' }
      });
      
      expect(result.data).toEqual(mockSchema);
      expect(getPageSchema).toHaveBeenCalledWith('https://other-url.com');
    });
  });

  describe('setPageSchema action', () => {
    it('should set the page schema', async () => {
      const mockSchema = { actions: ['action1', 'action2'] };
      
      const result = await runBrowserAction({
        actionName: 'setPageSchema',
        parameters: {
          url: 'https://example.com',
          schema: mockSchema
        }
      });
      
      expect(setPageSchema).toHaveBeenCalledWith('https://example.com', mockSchema);
    });
  });
});
