// Type definitions for jest-chrome
// Allows for proper TypeScript typing with Chrome API mocks

import '@types/chrome';

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Add mock methods to all Chrome API functions
type ChromeAPICallback = (...args: any[]) => any;
type ChromeAPIFunction<T extends ChromeAPICallback> = T & {
  mockImplementation: (implementation: (...args: Parameters<T>) => ReturnType<T>) => ChromeAPIFunction<T>;
  mockResolvedValue: (value: Awaited<ReturnType<T>>) => ChromeAPIFunction<T>;
  mockResolvedValueOnce: (value: Awaited<ReturnType<T>>) => ChromeAPIFunction<T>;
  mockRejectedValue: (error: any) => ChromeAPIFunction<T>;
  mockRejectedValueOnce: (error: any) => ChromeAPIFunction<T>;
  mockReturnValue: (value: ReturnType<T>) => ChromeAPIFunction<T>;
  mockReturnValueOnce: (value: ReturnType<T>) => ChromeAPIFunction<T>;
  mockClear: () => ChromeAPIFunction<T>;
  mockReset: () => ChromeAPIFunction<T>;
};

// Add mock methods to Chrome event listeners
interface ChromeEventListener<T extends (...args: any[]) => any> {
  addListener: ((callback: T) => void) & {
    mockImplementation: (implementation: (callback: T) => void) => void;
  };
  removeListener: ((callback: T) => void) & {
    mockImplementation: (implementation: (callback: T) => void) => void;
  };
  hasListener: ((callback: T) => boolean) & {
    mockImplementation: (implementation: (callback: T) => boolean) => void;
  };
  hasListeners: (() => boolean) & {
    mockImplementation: (implementation: () => boolean) => void;
  };
  callListeners: (...args: Parameters<T>) => void;
}

// Override the Chrome namespace
declare global {
  namespace chrome {
    // Add callListeners to events for simulating events in tests
    namespace tabs {
      const create: ChromeAPIFunction<typeof chrome.tabs.create>;
      const update: ChromeAPIFunction<typeof chrome.tabs.update>;
      const query: ChromeAPIFunction<typeof chrome.tabs.query>;
      const get: ChromeAPIFunction<typeof chrome.tabs.get>;
      const remove: ChromeAPIFunction<typeof chrome.tabs.remove>;
      const sendMessage: ChromeAPIFunction<typeof chrome.tabs.sendMessage>;
      const captureVisibleTab: ChromeAPIFunction<typeof chrome.tabs.captureVisibleTab>;
      const goBack: ChromeAPIFunction<typeof chrome.tabs.goBack>;
      const goForward: ChromeAPIFunction<typeof chrome.tabs.goForward>;
      const getZoom: ChromeAPIFunction<typeof chrome.tabs.getZoom>;
      const setZoom: ChromeAPIFunction<typeof chrome.tabs.setZoom>;
      
      const onUpdated: ChromeEventListener<
        (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void
      >;
      const onActivated: ChromeEventListener<
        (activeInfo: chrome.tabs.TabActiveInfo) => void
      >;
      const onCreated: ChromeEventListener<
        (tab: chrome.tabs.Tab) => void
      >;
      const onRemoved: ChromeEventListener<
        (tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => void
      >;
    }

    namespace windows {
      const getAll: ChromeAPIFunction<typeof chrome.windows.getAll>;
      const onFocusChanged: ChromeEventListener<
        (windowId: number) => void
      >;
      const onCreated: ChromeEventListener<
        (window: chrome.windows.Window) => void
      >;
      const onRemoved: ChromeEventListener<
        (windowId: number) => void
      >;
    }

    namespace storage {
      interface StorageArea {
        get: ChromeAPIFunction<
          (keys?: string | string[] | { [key: string]: any } | null) => Promise<{ [key: string]: any }>
        >;
        set: ChromeAPIFunction<
          (items: { [key: string]: any }) => Promise<void>
        >;
        remove: ChromeAPIFunction<
          (keys: string | string[]) => Promise<void>
        >;
      }
      
      const local: StorageArea;
      const sync: StorageArea;
      const session: StorageArea;

      const onChanged: ChromeEventListener<
        (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void
      >;
    }

    namespace runtime {
      const onMessage: ChromeEventListener<
        (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => void | boolean
      >;
      const onConnect: ChromeEventListener<
        (port: chrome.runtime.Port) => void
      >;
    }

    namespace action {
      const onClicked: ChromeEventListener<
        (tab: chrome.tabs.Tab) => void
      >;
      const setBadgeBackgroundColor: ChromeAPIFunction<typeof chrome.action.setBadgeBackgroundColor>;
      const setBadgeText: ChromeAPIFunction<typeof chrome.action.setBadgeText>;
    }

    namespace webNavigation {
      const getAllFrames: ChromeAPIFunction<typeof chrome.webNavigation.getAllFrames>;
    }

    namespace scripting {
      const executeScript: ChromeAPIFunction<typeof chrome.scripting.executeScript>;
    }

    namespace search {
      const query: ChromeAPIFunction<typeof chrome.search.query>;
    }

    namespace history {
      const search: ChromeAPIFunction<typeof chrome.history.search>;
    }

    namespace bookmarks {
      const search: ChromeAPIFunction<typeof chrome.bookmarks.search>;
    }

    namespace tts {
      const speak: ChromeAPIFunction<typeof chrome.tts.speak>;
      const stop: ChromeAPIFunction<typeof chrome.tts.stop>;
    }

    namespace sidePanel {
      const open: ChromeAPIFunction<typeof chrome.sidePanel.open>;
    }

    namespace contextMenus {
      const create: ChromeAPIFunction<typeof chrome.contextMenus.create>;
      const onClicked: ChromeEventListener<
        (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => void
      >;
    }

    namespace downloads {
      const download: ChromeAPIFunction<typeof chrome.downloads.download>;
    }
  }
}

export {};