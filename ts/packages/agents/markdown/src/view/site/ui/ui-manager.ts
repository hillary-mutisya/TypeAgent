import { ToolbarManager } from "./toolbar-manager";
import { ThemeManager } from "./theme-manager";
import { PanelManager } from "./panel-manager";
import { NotificationManager } from "./notification-manager";

export class UIManager {
    private toolbarManager: ToolbarManager;
    private themeManager: ThemeManager;
    private panelManager: PanelManager;
    private notificationManager: NotificationManager;

    constructor() {
        this.toolbarManager = new ToolbarManager();
        this.themeManager = new ThemeManager();
        this.panelManager = new PanelManager();
        this.notificationManager = new NotificationManager();
    }

    public async initialize(): Promise<void> {
        // Initialize all UI components
        await this.toolbarManager.initialize();
        await this.themeManager.initialize();
        await this.panelManager.initialize();
        await this.notificationManager.initialize();

        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
    }

    public getNotificationManager(): NotificationManager {
        return this.notificationManager;
    }

    public getPanelManager(): PanelManager {
        return this.panelManager;
    }

    private setupKeyboardShortcuts(): void {
        document.addEventListener("keydown", (e) => {
            // Ctrl+S to save
            if (e.ctrlKey && e.key === "s") {
                e.preventDefault();
                this.toolbarManager.triggerSave();
            }
        });
    }
}
