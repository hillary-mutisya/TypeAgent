import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Types for our index system

// Represents a single action parameter
interface ActionParameter {
  name: string;
  shortName: string;
  description: string;
  type: string;
  required: boolean;
}

// Represents an action definition
interface ActionDefinition {
  actionName: string;
  parameters?: ActionParameter[];
}

// Represents a step in a plan
interface PlanStep {
  actionName: string;
  parameters: Record<string, string>;
}

// Represents a complete plan
interface Plan {
  planName: string;
  intentSchemaName: string;
  description: string;
  steps: PlanStep[];
}

// Represents a action source - either dev authored or user created
interface ActionSource {
  type: 'dev' | 'user';
  // For dev-authored actions
  schemaFileName?: string;
  actionName?: string;
  // For user-created actions
  actionDefinition?: ActionDefinition;
  plan?: Plan;
}

// Represents a page type with its actions
interface PageType {
  name: string;
  urlPatterns: string[]; // URL patterns that match this page type
  actions: Record<string, ActionSource>; // Map of action name to action source
}

// Represents a website with its page types
interface Website {
  domain: string;
  name: string;
  pageTypes: Record<string, PageType>; // Map of page type name to page type
}

// The complete index
interface PageActionIndex {
  websites: Record<string, Website>; // Map of domain to website
  lastUpdated: string;
}

/**
 * PageActionIndexManager class
 * Manages the page action index, including loading, saving, and updating the index.
 */
class PageActionIndexManager {
  private index: PageActionIndex;
  private indexFilePath: string;

  /**
   * Constructor
   * @param indexFilePath Path to the index file
   */
  constructor(indexFilePath: string) {
    this.indexFilePath = indexFilePath;
    this.index = this.createNewIndex();
  }

  /**
   * Creates a new empty index
   * @returns A new empty index
   */
  private createNewIndex(): PageActionIndex {
    return {
      websites: {},
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Initializes the index by loading from bootstrap.json
   * @returns Promise resolving to the initialized index
   */
  public async initialize(): Promise<PageActionIndex> {
    try {
      // Try to load the bootstrap file
      const bootstrapData = await this.loadBootstrapFile('bootstrap.json');
      
      if (bootstrapData && bootstrapData.websites) {
        // Add each website from the bootstrap data to the index
        for (const domain in bootstrapData.websites) {
          const website = bootstrapData.websites[domain];
          this.index.websites[domain] = website;
        }
        
        console.log(`Initialized index with ${Object.keys(this.index.websites).length} websites from bootstrap file`);
      } else {
        console.warn('No websites found in bootstrap file');
      }
    } catch (error) {
      console.error('Failed to load bootstrap file:', error);
      console.log('Initializing with empty index');
    }
    
    return this.index;
  }

  /**
   * Load the bootstrap file
   * @param filePath Path to the bootstrap file
   * @returns Promise resolving to the bootstrap data
   */
  private async  loadBootstrapFile(fileName: string): Promise<any> {
    try {
      
        const packageRoot = path.join("..", "..");
            const content =  await fs.promises.readFile(
                fileURLToPath(
                    new URL(
                        path.join(
                            packageRoot,
                            "./src/agent/data",
                            fileName,
                        ),
                        import.meta.url,
                    ),
                ),
                "utf8",
            );
      
      
      const data = await JSON.parse(content);
      return data;
    } catch (error) {
      console.error(`Failed to load bootstrap file ${fileName}:`, error);
      throw error;
    }
  }

  /**
   * Save the index to disk
   * @returns Promise resolving when the index is saved
   */
  public async saveIndex(): Promise<void> {
    try {
      // Update the last updated timestamp
      this.index.lastUpdated = new Date().toISOString();
      
      // Convert the index to a JSON string
      const indexJson = JSON.stringify(this.index, null, 2);
      
      // In a browser extension, you might use chrome.storage or the FileSystem API
      // This is a simplified example that would work in a Node.js environment
      // For Chrome Extension, you'd use chrome.storage.local.set()
      
      // For demonstration, let's assume we have a function to write to disk
      await this.writeFile(this.indexFilePath, indexJson);
      
      console.log(`Index saved to ${this.indexFilePath}`);
    } catch (error) {
      console.error("Failed to save index:", error);
      throw error;
    }
  }

  /**
   * Load the index from disk
   * @returns Promise resolving to the loaded index
   */
  public async loadIndex(): Promise<PageActionIndex> {
    try {
      // In a browser extension, you might use chrome.storage or the FileSystem API
      // This is a simplified example that would work in a Node.js environment
      // For Chrome Extension, you'd use chrome.storage.local.get()
      
      // For demonstration, let's assume we have a function to read from disk
      const indexJson = await this.readFile(this.indexFilePath);
      
      // Parse the JSON string into an object
      this.index = JSON.parse(indexJson);
      
      console.log(`Index loaded from ${this.indexFilePath}`);
      return this.index;
    } catch (error) {
      console.error("Failed to load index:", error);
      // If the file doesn't exist or is invalid, create a new index
      console.log("Creating a new index...");
      this.index = this.createNewIndex();
      return this.index;
    }
  }

  /**
   * Get the domain from a URL
   * @param url The URL to extract the domain from
   * @returns The domain of the URL
   */
  public getDomainFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch (error) {
      console.error("Invalid URL:", url);
      return "";
    }
  }

  /**
   * Find a matching page type for a URL
   * @param url The URL to match
   * @returns The matching website and page type, or null if no match is found
   */
  public findPageTypeForUrl(url: string): { website: Website, pageType: PageType } | null {
    const domain = this.getDomainFromUrl(url);
    
    // Check if we have this website in our index
    const website = this.index.websites[domain];
    if (!website) {
      return null;
    }
    
    // Check each page type to see if the URL matches any pattern
    for (const pageTypeName in website.pageTypes) {
      const pageType = website.pageTypes[pageTypeName];
      
      for (const pattern of pageType.urlPatterns) {
        const regex = new RegExp(pattern);
        if (regex.test(url)) {
          return { website, pageType };
        }
      }
    }
    
    return null;
  }

  /**
   * Add a user-created action to a page type
   * @param domain The domain of the website
   * @param pageTypeName The name of the page type
   * @param actionDefinition The action definition
   * @param plan The plan for executing the action
   * @returns True if the action was added successfully, false otherwise
   */
  public addUserCreatedAction(
    domain: string,
    pageTypeName: string,
    actionDefinition: ActionDefinition,
    plan: Plan
  ): boolean {
    const website = this.index.websites[domain];
    if (!website) {
      console.error(`Website "${domain}" not found in the index`);
      return false;
    }
    
    let pageType = website.pageTypes[pageTypeName];
    if (!pageType) {
      // Create a new page type if it doesn't exist
      pageType = {
        name: pageTypeName,
        urlPatterns: [], // This would need to be populated
        actions: {}
      };
      website.pageTypes[pageTypeName] = pageType;
    }
    
    // Add the action to the page type
    pageType.actions[actionDefinition.actionName] = {
      type: 'user',
      actionDefinition,
      plan
    };
    
    // Update the last updated timestamp
    this.index.lastUpdated = new Date().toISOString();
    
    return true;
  }

  /**
   * Add a new website to the index
   * @param domain The domain of the website
   * @param name The name of the website
   * @returns The newly created website
   */
  public addWebsite(domain: string, name: string): Website {
    const website: Website = {
      domain,
      name,
      pageTypes: {}
    };
    
    this.index.websites[domain] = website;
    this.index.lastUpdated = new Date().toISOString();
    
    return website;
  }

  /**
   * Add a new page type to a website
   * @param domain The domain of the website
   * @param pageTypeName The name of the page type
   * @param urlPatterns The URL patterns that match this page type
   * @returns The newly created page type, or null if the website doesn't exist
   */
  public addPageType(
    domain: string,
    pageTypeName: string,
    urlPatterns: string[]
  ): PageType | null {
    const website = this.index.websites[domain];
    if (!website) {
      console.error(`Website "${domain}" not found in the index`);
      return null;
    }
    
    const pageType: PageType = {
      name: pageTypeName,
      urlPatterns,
      actions: {}
    };
    
    website.pageTypes[pageTypeName] = pageType;
    this.index.lastUpdated = new Date().toISOString();
    
    return pageType;
  }

  /**
   * Convert a user-created action to TypeScript schema
   * @param actionDefinition The action definition
   * @param plan The plan for executing the action
   * @returns The TypeScript schema as a string
   */
  public convertActionToTypeScriptSchema(actionDefinition: ActionDefinition, plan: Plan): string {
    // This is a simplified implementation
    // In a real application, you would generate the appropriate TypeScript code
    
    const parameterTypes = actionDefinition.parameters?.map(param => {
      return `  ${param.shortName}: ${param.type};`;
    }).join('\n') || '';
    
    const schemaCode = `
// Generated schema for ${actionDefinition.actionName}
export interface ${actionDefinition.actionName}Params {
${parameterTypes}
}

export const ${actionDefinition.actionName}Plan = {
  planName: "${plan.planName}",
  intentSchemaName: "${plan.intentSchemaName}",
  description: "${plan.description}",
  steps: ${JSON.stringify(plan.steps, null, 2)}
};
`;
    
    return schemaCode;
  }

  /**
   * Process a page - find its type, actions, or analyze it if unknown
   * @param url The URL of the page
   * @param pageContent The content of the page
   * @returns Promise resolving to the processed page information
   */
  public async processPage(url: string, pageContent: string): Promise<{
    pageType: PageType | null,
    actions: Record<string, ActionSource> | null,
    isNewPage: boolean
  }> {
    // Try to find the page type in the index
    const match = this.findPageTypeForUrl(url);
    
    if (match) {
      // We already know this page type
      return {
        pageType: match.pageType,
        actions: match.pageType.actions,
        isNewPage: false
      };
    }
    
    // We don't know this page type yet, so analyze it with the LLM
    const domain = this.getDomainFromUrl(url);
    
    // Get the website or create a new one
    let website = this.index.websites[domain];
    if (!website) {
      website = this.addWebsite(domain, domain); // Using domain as name for now
    }
    
    // Get all existing page type names for this website
    const existingPageTypes = Object.keys(website.pageTypes);
    
    // Analyze the page with the LLM
    const analysisResult = await this.analyzePageWithLLM(url, pageContent, existingPageTypes);
    
    if (analysisResult.isNewType) {
      // This is a new page type, so add it to the index
      const urlPattern = `^${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/[^\/]+$/, '/[\\w-]+')}`;
      const pageType = this.addPageType(domain, analysisResult.pageType, [urlPattern]);
      
      if (pageType) {
        // Add the actions to the page type
        for (const actionDef of analysisResult.actions) {
          // For demonstration, we're creating a simple plan for each action
          const plan: Plan = {
            planName: `${actionDef.actionName}Plan`,
            intentSchemaName: actionDef.actionName,
            description: `Plan for ${actionDef.actionName}`,
            steps: [
              {
                actionName: 'clickOnElement',
                parameters: {
                  elementText: `${actionDef.actionName}Button`
                }
              }
            ]
          };
          
          this.addUserCreatedAction(domain, analysisResult.pageType, actionDef, plan);
        }
        
        // Save the updated index
        await this.saveIndex();
        
        return {
          pageType,
          actions: pageType.actions,
          isNewPage: true
        };
      }
    } else {
      // This is a known page type but with a URL pattern we haven't seen before
      // Update the URL patterns for the existing page type
      const pageType = website.pageTypes[analysisResult.pageType];
      if (pageType) {
        const urlPattern = `^${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/[^\/]+$/, '/[\\w-]+')}`;
        pageType.urlPatterns.push(urlPattern);
        
        // Save the updated index
        await this.saveIndex();
        
        return {
          pageType,
          actions: pageType.actions,
          isNewPage: false
        };
      }
    }
    
    return {
      pageType: null,
      actions: null,
      isNewPage: true
    };
  }

  /**
   * Analyze a page with an LLM to determine its type and actions
   * @param url The URL of the page
   * @param pageContent The content of the page
   * @param existingPageTypes The existing page types for this website
   * @returns Promise resolving to the analysis result
   */
  private async analyzePageWithLLM(
    url: string,
    pageContent: string,
    existingPageTypes: string[]
  ): Promise<{ pageType: string, isNewType: boolean, actions: ActionDefinition[] }> {
    // In a real implementation, this would call your LLM API
    // For demonstration purposes, we'll return mock data
    
    console.log(`Analyzing page: ${url}`);
    console.log(`Existing page types: ${existingPageTypes.join(', ')}`);
    
    // Mock response - in reality, this would come from your LLM
    // The LLM would analyze the page content and identify the page type and actions
    
    // For demonstration, let's pretend this is a search results page
    const isNewType = !existingPageTypes.includes('searchResultsPage');
    
    return {
      pageType: 'searchResultsPage',
      isNewType,
      actions: [
        {
          actionName: 'selectSearchResult',
          parameters: [
            {
              name: 'Result Number',
              shortName: 'resultNum',
              description: 'The number of the search result to select',
              type: 'number',
              required: true
            }
          ]
        },
        {
          actionName: 'filterResults',
          parameters: [
            {
              name: 'Filter Category',
              shortName: 'category',
              description: 'The category to filter by',
              type: 'string',
              required: true
            }
          ]
        }
      ]
    };
  }

  /**
   * Get the current index
   * @returns The current index
   */
  public getIndex(): PageActionIndex {
    return this.index;
  }

  /**
   * Set the index
   * @param index The new index
   */
  public setIndex(index: PageActionIndex): void {
    this.index = index;
  }

  /**
   * Write a file to disk
   * @param filePath The path to the file
   * @param content The content to write
   * @returns Promise resolving when the file is written
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    return new Promise((resolve) => {
      // In a Chrome extension, you might use chrome.storage.local.set
      console.log(`Writing to ${filePath}...`);
      // chrome.storage.local.set({ [filePath]: content }, resolve);
      resolve();
    });
  }

  /**
   * Read a file from disk
   * @param filePath The path to the file
   * @returns Promise resolving to the file content
   */
  private async readFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // In a Chrome extension, you might use chrome.storage.local.get
      console.log(`Reading from ${filePath}...`);
      // chrome.storage.local.get([filePath], (result) => {
      //   if (result[filePath]) {
      //     resolve(result[filePath]);
      //   } else {
      //     reject(new Error(`File ${filePath} not found`));
      //   }
      // });
      reject(new Error(`File ${filePath} not found`));
    });
  }
}

// Export the class and types
export {
  PageActionIndexManager,
  ActionParameter,
  ActionDefinition,
  PlanStep,
  Plan,
  ActionSource,
  PageType,
  Website,
  PageActionIndex
};