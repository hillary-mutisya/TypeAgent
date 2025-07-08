('Days should be between 1 and 365');
        });
    });

    describe('validateFileImportOptions', () => {
        test('should validate valid file import options', () => {
            const mockFile = new File(['<html><head><title>Test</title></head><body>Content</body></html>'], 'test.html', {
                type: 'text/html'
            });

            const options: FileImportOptions = {
                files: [mockFile]
            };

            const result = importManager.validateFileImportOptions(options);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should reject empty file list', () => {
            const options: FileImportOptions = {
                files: []
            };

            const result = importManager.validateFileImportOptions(options);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('At least one file is required');
        });

        test('should reject unsupported file types', () => {
            const mockFile = new File(['content'], 'test.txt', {
                type: 'text/plain'
            });

            const options: FileImportOptions = {
                files: [mockFile]
            };

            const result = importManager.validateFileImportOptions(options);

            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('Unsupported file types');
        });

        test('should warn about large files', () => {
            const largeContent = 'x'.repeat(60 * 1024 * 1024); // 60MB
            const mockFile = new File([largeContent], 'large.html', {
                type: 'text/html'
            });

            const options: FileImportOptions = {
                files: [mockFile]
            };

            const result = importManager.validateFileImportOptions(options);

            expect(result.isValid).toBe(true);
            expect(result.warnings[0]).toContain('Large files may impact performance');
        });
    });

    describe('preprocessBrowserData', () => {
        test('should preprocess bookmark data correctly', () => {
            const mockBookmarks: BrowserBookmark[] = [
                {
                    id: '1',
                    title: 'Test Bookmark',
                    url: 'https://example.com',
                    dateAdded: 1640995200000,
                    parentId: 'folder1',
                    index: 0
                }
            ];

            const options: ImportOptions = {
                source: 'chrome',
                type: 'bookmarks'
            };

            const result = importManager.preprocessBrowserData(mockBookmarks, options);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                url: 'https://example.com',
                title: 'Test Bookmark',
                domain: 'example.com',
                source: 'bookmarks',
                lastVisited: '2022-01-01T00:00:00.000Z',
                metadata: {
                    id: '1',
                    parentId: 'folder1',
                    index: 0
                }
            });
        });

        test('should preprocess history data correctly', () => {
            const mockHistory: BrowserHistoryItem[] = [
                {
                    id: '1',
                    title: 'Test Page',
                    url: 'https://example.com/page',
                    visitCount: 5,
                    typedCount: 2,
                    lastVisitTime: 1640995200000
                }
            ];

            const options: ImportOptions = {
                source: 'chrome',
                type: 'history'
            };

            const result = importManager.preprocessBrowserData(mockHistory, options);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                url: 'https://example.com/page',
                title: 'Test Page',
                domain: 'example.com',
                source: 'history',
                visitCount: 5,
                lastVisited: '2022-01-01T00:00:00.000Z',
                metadata: {
                    id: '1',
                    typedCount: 2
                }
            });
        });

        test('should handle invalid URLs gracefully', () => {
            const mockBookmarks: BrowserBookmark[] = [
                {
                    id: '1',
                    title: 'Invalid Bookmark',
                    url: 'invalid-url',
                    dateAdded: 1640995200000
                }
            ];

            const options: ImportOptions = {
                source: 'chrome',
                type: 'bookmarks'
            };

            const result = importManager.preprocessBrowserData(mockBookmarks, options);

            expect(result).toHaveLength(1);
            expect(result[0].domain).toBe('unknown');
        });
    });

    describe('parseHtmlFile', () => {
        test('should parse HTML file correctly', async () => {
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Test Page</title>
                    <meta name="description" content="A test page">
                    <meta name="keywords" content="test, html, parsing">
                </head>
                <body>
                    <h1>Test Content</h1>
                    <p>This is a test paragraph.</p>
                    <a href="https://example.com">Example Link</a>
                    <img src="image.jpg" alt="Test Image">
                </body>
                </html>
            `;

            const mockFile = new File([htmlContent], 'test.html', {
                type: 'text/html'
            });

            const result = await importManager.parseHtmlFile(mockFile);

            expect(result.title).toBe('Test Page');
            expect(result.content).toContain('Test Content');
            expect(result.links).toContain('https://example.com');
            expect(result.images).toContain('image.jpg');
            expect(result.metadata.description).toBe('A test page');
            expect(result.metadata.keywords).toBe('test, html, parsing');
        });

        test('should handle malformed HTML gracefully', async () => {
            const htmlContent = '<html><head><title>Broken HTML</title><body><p>Missing closing tags';

            const mockFile = new File([htmlContent], 'broken.html', {
                type: 'text/html'
            });

            const result = await importManager.parseHtmlFile(mockFile);

            expect(result.title).toBe('Broken HTML');
            expect(result.content).toContain('Missing closing tags');
        });

        test('should use filename as fallback title', async () => {
            const htmlContent = '<html><body>No title</body></html>';

            const mockFile = new File([htmlContent], 'notitle.html', {
                type: 'text/html'
            });

            const result = await importManager.parseHtmlFile(mockFile);

            expect(result.title).toBe('notitle.html');
        });
    });

    describe('extractContentFromHtml', () => {
        test('should extract clean text content', async () => {
            const htmlContent = `
                <html>
                <head>
                    <title>Test Page</title>
                    <script>console.log('script');</script>
                    <style>body { color: red; }</style>
                </head>
                <body>
                    <h1>Main Heading</h1>
                    <p>This is a paragraph with <strong>bold</strong> text.</p>
                    <div>Another section</div>
                </body>
                </html>
            `;

            const result = await importManager.extractContentFromHtml(htmlContent);

            expect(result.text).toContain('Main Heading');
            expect(result.text).toContain('This is a paragraph with bold text.');
            expect(result.text).toContain('Another section');
            expect(result.text).not.toContain('console.log');
            expect(result.text).not.toContain('color: red');
            expect(result.title).toBe('Test Page');
        });

        test('should handle empty or malformed HTML', async () => {
            const htmlContent = '';

            const result = await importManager.extractContentFromHtml(htmlContent);

            expect(result.text).toBe('');
            expect(result.title).toBeUndefined();
        });
    });

    describe('getBrowserData', () => {
        test('should get Chrome bookmarks', async () => {
            const mockBookmarkTree = [
                {
                    id: 'root',
                    title: 'Root',
                    children: [
                        {
                            id: '1',
                            title: 'Test Bookmark',
                            url: 'https://example.com',
                            dateAdded: 1640995200000
                        }
                    ]
                }
            ];

            mockChrome.bookmarks.getTree.mockResolvedValue(mockBookmarkTree);

            const result = await importManager.getBrowserData('chrome', 'bookmarks');

            expect(mockChrome.bookmarks.getTree).toHaveBeenCalled();
            expect(result).toHaveLength(1);
            expect(result[0].url).toBe('https://example.com');
        });

        test('should get Chrome history', async () => {
            const mockHistory = [
                {
                    id: '1',
                    title: 'Test Page',
                    url: 'https://example.com',
                    visitCount: 5,
                    lastVisitTime: 1640995200000
                }
            ];

            mockChrome.history.search.mockResolvedValue(mockHistory);

            const result = await importManager.getBrowserData('chrome', 'history');

            expect(mockChrome.history.search).toHaveBeenCalledWith({
                text: '',
                maxResults: 10000
            });
            expect(result).toHaveLength(1);
            expect(result[0].url).toBe('https://example.com');
        });

        test('should handle API errors gracefully', async () => {
            mockChrome.bookmarks.getTree.mockRejectedValue(new Error('Permission denied'));

            await expect(importManager.getBrowserData('chrome', 'bookmarks'))
                .rejects.toThrow('Unable to access chrome bookmarks. Please check permissions.');
        });
    });

    describe('startWebActivityImport', () => {
        test('should complete successful import', async () => {
            const options: ImportOptions = {
                source: 'chrome',
                type: 'bookmarks'
            };

            const mockBookmarkTree = [
                {
                    id: 'root',
                    title: 'Root',
                    children: [
                        {
                            id: '1',
                            title: 'Test Bookmark',
                            url: 'https://example.com'
                        }
                    ]
                }
            ];

            const mockServiceWorkerResponse = {
                success: true,
                itemCount: 1
            };

            mockChrome.bookmarks.getTree.mockResolvedValue(mockBookmarkTree);
            mockChrome.runtime.sendMessage.mockResolvedValue(mockServiceWorkerResponse);

            const result = await importManager.startWebActivityImport(options);

            expect(result.success).toBe(true);
            expect(result.itemCount).toBe(1);
            expect(result.errors).toHaveLength(0);
            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: "importWebsiteDataWithProgress",
                parameters: options,
                importId: expect.any(String)
            });
        });

        test('should handle validation errors', async () => {
            const options = {
                source: 'invalid'
            } as ImportOptions;

            const result = await importManager.startWebActivityImport(options);

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].type).toBe('processing');
        });

        test('should apply import limits', async () => {
            const options: ImportOptions = {
                source: 'chrome',
                type: 'bookmarks',
                limit: 1
            };

            const mockBookmarkTree = [
                {
                    id: 'root',
                    title: 'Root',
                    children: [
                        {
                            id: '1',
                            title: 'Bookmark 1',
                            url: 'https://example1.com'
                        },
                        {
                            id: '2',
                            title: 'Bookmark 2',
                            url: 'https://example2.com'
                        }
                    ]
                }
            ];

            mockChrome.bookmarks.getTree.mockResolvedValue(mockBookmarkTree);
            mockChrome.runtime.sendMessage.mockResolvedValue({ success: true, itemCount: 1 });

            const result = await importManager.startWebActivityImport(options);

            expect(result.itemCount).toBe(1);
        });
    });

    describe('cancelImport', () => {
        test('should cancel active import', async () => {
            const importId = 'test-import-id';
            
            // Simulate active import
            (importManager as any).activeImports.set(importId, true);

            mockChrome.runtime.sendMessage.mockResolvedValue({ success: true });

            await importManager.cancelImport(importId);

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: "cancelImport",
                importId
            });
        });

        test('should handle cancellation errors gracefully', async () => {
            const importId = 'test-import-id';
            
            (importManager as any).activeImports.set(importId, true);
            mockChrome.runtime.sendMessage.mockRejectedValue(new Error('Network error'));

            // Should not throw
            await expect(importManager.cancelImport(importId)).resolves.toBeUndefined();
        });
    });

    describe('progress tracking', () => {
        test('should register progress callbacks', () => {
            const mockCallback = jest.fn();

            importManager.onProgressUpdate(mockCallback);

            // Verify callback is stored (private method test)
            expect((importManager as any).progressCallbacks.has('global')).toBe(true);
        });
    });

    describe('utility methods', () => {
        test('should generate unique import IDs', () => {
            const id1 = (importManager as any).generateImportId();
            const id2 = (importManager as any).generateImportId();

            expect(id1).toMatch(/^import_\d+_[a-z0-9]+$/);
            expect(id2).toMatch(/^import_\d+_[a-z0-9]+$/);
            expect(id1).not.toBe(id2);
        });

        test('should extract domain from URL', () => {
            const extractDomain = (importManager as any).extractDomain.bind(importManager);

            expect(extractDomain('https://example.com/path')).toBe('example.com');
            expect(extractDomain('http://subdomain.example.com')).toBe('subdomain.example.com');
            expect(extractDomain('invalid-url')).toBe('unknown');
        });
    });
});

// Additional integration-style tests
describe('WebsiteImportManager Integration', () => {
    let importManager: WebsiteImportManager;

    beforeEach(() => {
        importManager = new WebsiteImportManager();
        jest.clearAllMocks();
    });

    test('should handle complete bookmark import workflow', async () => {
        const options: ImportOptions = {
            source: 'chrome',
            type: 'bookmarks',
            extractContent: true,
            enableIntelligentAnalysis: true
        };

        const mockBookmarkTree = [
            {
                id: 'root',
                title: 'Bookmarks Bar',
                children: [
                    {
                        id: '1',
                        title: 'GitHub',
                        url: 'https://github.com',
                        dateAdded: 1640995200000
                    },
                    {
                        id: '2',
                        title: 'Stack Overflow',
                        url: 'https://stackoverflow.com',
                        dateAdded: 1641081600000
                    }
                ]
            }
        ];

        mockChrome.bookmarks.getTree.mockResolvedValue(mockBookmarkTree);
        mockChrome.runtime.sendMessage.mockResolvedValue({
            success: true,
            itemCount: 2,
            summary: {
                totalProcessed: 2,
                successfullyImported: 2,
                knowledgeExtracted: 2,
                entitiesFound: 15,
                topicsIdentified: 8,
                actionsDetected: 3
            }
        });

        const result = await importManager.startWebActivityImport(options);

        expect(result.success).toBe(true);
        expect(result.itemCount).toBe(2);
        expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
            type: "importWebsiteDataWithProgress",
            parameters: options,
            importId: expect.any(String)
        });
    });

    test('should handle file import with multiple HTML files', async () => {
        const htmlFiles = [
            new File(['<html><head><title>Page 1</title></head><body>Content 1</body></html>'], 'page1.html'),
            new File(['<html><head><title>Page 2</title></head><body>Content 2</body></html>'], 'page2.html')
        ];

        const options: FileImportOptions = {
            files: htmlFiles,
            extractContent: true,
            enableIntelligentAnalysis: true
        };

        mockChrome.runtime.sendMessage.mockResolvedValue({
            success: true,
            itemCount: 2
        });

        const result = await importManager.startFileImport(options);

        expect(result.success).toBe(true);
        expect(result.itemCount).toBe(2);
        expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
            type: "importHtmlFiles",
            parameters: {
                files: expect.any(Array),
                options,
                importId: expect.any(String)
            }
        });
    });
});
