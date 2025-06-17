// Editor initialization and management

import { Editor } from "@milkdown/core";
import { editorViewCtx, parserCtx } from "@milkdown/core";
import { Crepe } from "@milkdown/crepe";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { history } from "@milkdown/plugin-history";
import { collab, collabServiceCtx } from "@milkdown/plugin-collab";

import type { EditorState, EditorConfig } from "../types";
import {
    createEditorConfig,
    createCrepeFeatures,
    createCrepeFeatureConfigs,
} from "../config";
import { DocumentManager } from "./document-manager";
import { CollaborationManager } from "./collaboration-manager";

export class EditorManager {
    private state: EditorState = {
        editor: null,
        yjsDoc: null,
        websocketProvider: null,
    };

    private documentManager: DocumentManager;
    private collaborationManager: CollaborationManager;
    private config: EditorConfig;

    constructor() {
        this.documentManager = new DocumentManager();
        this.collaborationManager = new CollaborationManager();
        this.config = createEditorConfig();
    }

    public async initialize(container: HTMLElement): Promise<Editor> {
        console.log("📝 Initializing Editor Manager...");

        // Load initial content
        const initialContent = await this.documentManager.loadInitialContent();
        this.config.defaultContent = initialContent;

        // Initialize editor with full features
        const editor = await this.initializeFullEditor(
            container,
            initialContent,
        );

        console.log("✅ Editor Manager initialized successfully");
        return editor;
    }

    private async initializeFullEditor(
        container: HTMLElement,
        initialContent: string,
    ): Promise<Editor> {
        // Clean up any existing editor
        if (this.state.editor) {
            this.state.editor.destroy();
            this.state.editor = null;
        }

        // Clear container
        container.innerHTML = "";

        // Initialize collaboration if enabled
        if (this.config.enableCollaboration) {
            await this.collaborationManager.initialize();
            this.state.yjsDoc = this.collaborationManager.getYjsDoc();
            this.state.websocketProvider =
                this.collaborationManager.getWebsocketProvider();
        }

        // Create Crepe editor with all features
        const crepe = new Crepe({
            root: container,
            defaultValue: initialContent,
            features: createCrepeFeatures(),
            featureConfigs: createCrepeFeatureConfigs(),
        });

        // Configure editor with plugins
        await this.configureEditorPlugins(crepe);

        this.state.editor = crepe.editor;

        // Setup collaboration after editor is created
        if (
            this.config.enableCollaboration &&
            this.state.yjsDoc &&
            this.state.websocketProvider
        ) {
            this.setupCollaboration(crepe.editor);
        }

        this.logSuccessMessage();

        return crepe.editor;
    }

    private async configureEditorPlugins(crepe: Crepe): Promise<void> {
        // Import plugins dynamically to avoid circular dependencies
        const { mermaidPlugin } = await import("../mermaid-plugin");
        const { slashCommandHandler, slashCommandPreview } = await import("../slash-commands");

        await crepe.editor
            .use(commonmark) // Basic markdown support
            .use(mermaidPlugin) // Mermaid diagram support - BEFORE GFM
            .use(gfm) // GitHub flavored markdown
            .use(history) // Undo/redo
            .use(collab) // Yjs collaboration plugin
            .use(slashCommandHandler) // Enhanced slash command handling
            .use(slashCommandPreview) // Real-time command styling
            .create();
    }

    private setupCollaboration(editor: Editor): void {
        if (!this.state.yjsDoc || !this.state.websocketProvider) return;

        editor.action((ctx) => {
            const collabService = ctx.get(collabServiceCtx);
            collabService
                .bindDoc(this.state.yjsDoc!)
                .setAwareness(this.state.websocketProvider!.awareness)
                .connect();
            console.log("🔄 Collaboration connected (no auto-save conflicts)");
        });
    }

    private logSuccessMessage(): void {
        console.log(
            "✅ Full Editor with AI integration, Mermaid support and collaboration initialized successfully",
        );
        console.log("🤖 Available AI commands:");
        console.log('   • Type "/" to open block edit menu with AI tools');
        console.log(
            "   • Type slash commands directly: /test:continue, /test:diagram, /test:augment",
        );
        console.log(
            "   • Mermaid diagrams: Type ```mermaid code ``` or click diagrams to edit",
        );
        console.log(
            "   • Available: Continue Writing, Generate Diagram, Augment Document",
        );
        console.log(
            "   • Test versions available for testing without API calls",
        );
        console.log("🔄 Real-time collaboration enabled");
    }

    public getEditor(): Editor | null {
        return this.state.editor;
    }

    public getCollaborationManager(): CollaborationManager {
        return this.collaborationManager;
    }

    public async setContent(content: string): Promise<void> {
        if (!this.state.editor) {
            throw new Error("Editor not initialized");
        }

        // Parse markdown to ProseMirror document and update editor content
        await this.state.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const parser = ctx.get(parserCtx);
            
            // Parse the markdown content to a ProseMirror document
            const doc = parser(content);
            if (!doc) {
                throw new Error("Failed to parse markdown content");
            }
            
            // Create transaction to replace all content with new content
            const transaction = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
            view.dispatch(transaction);
        });
    }

    public destroy(): void {
        if (this.state.editor) {
            this.state.editor.destroy();
            this.state.editor = null;
        }

        this.collaborationManager.destroy();
    }
}
