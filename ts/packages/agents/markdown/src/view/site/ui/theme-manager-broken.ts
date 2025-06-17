import { getElementById } from "../utils";

// Import all theme CSS files directly (this is how it should be done!)
import '@milkdown/crepe/lib/theme/crepe/style.css';
import '@milkdown/crepe/lib/theme/crepe-dark/style.css';
import '@milkdown/crepe/lib/theme/nord/style.css';
import '@milkdown/crepe/lib/theme/nord-dark/style.css';
import '@milkdown/crepe/lib/theme/frame/style.css';
import '@milkdown/crepe/lib/theme/frame-dark/style.css';

// Available themes - matching actual Milkdown themes
const availableThemes = ['crepe', 'crepe-dark', 'nord', 'nord-dark', 'frame', 'frame-dark'] as const;
type ThemeName = typeof availableThemes[number];

// Map display names to theme names
const themeDisplayNames: Record<ThemeName, string> = {
    'crepe': 'Light',
    'crepe-dark': 'Dark', 
    'nord': 'Nord',
    'nord-dark': 'Nord Dark',
    'frame': 'Frame',
    'frame-dark': 'Frame Dark'
};

export class ThemeManager {
    private currentTheme: ThemeName = 'crepe';
    private menuVisible = false;

    public async initialize(): Promise<void> {
        this.setupThemeMenu();
        this.loadSavedTheme();
        this.updateMenuVisuals();
    }

    private setupThemeMenu(): void {
        const themeToggle = getElementById("theme-toggle");
        const themeMenu = getElementById("theme-menu");
        
        if (!themeToggle || !themeMenu) return;

        // Toggle menu on button click
        themeToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // Setup theme option clicks
        const themeOptions = themeMenu.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                const themeName = (e.currentTarget as HTMLElement).dataset.theme as ThemeName;
                if (themeName && themeName !== this.currentTheme) {
                    this.setTheme(themeName);
                }
                this.hideMenu();
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!themeToggle.contains(e.target as Node) && !themeMenu.contains(e.target as Node)) {
                this.hideMenu();
            }
        });

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.menuVisible) {
                this.hideMenu();
            }
        });
    }
    private toggleMenu(): void {
        if (this.menuVisible) {
            this.hideMenu();
        } else {
            this.showMenu();
        }
    }

    private showMenu(): void {
        const themeMenu = getElementById("theme-menu");
        if (themeMenu) {
            themeMenu.classList.add('show');
            this.menuVisible = true;
        }
    }

    private hideMenu(): void {
        const themeMenu = getElementById("theme-menu");
        if (themeMenu) {
            themeMenu.classList.remove('show');
            this.menuVisible = false;
        }
    }

    private updateMenuVisuals(): void {
        const themeMenu = getElementById("theme-menu");
        if (!themeMenu) return;

        const themeOptions = themeMenu.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            const themeName = (option as HTMLElement).dataset.theme;
            if (themeName === this.currentTheme) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }

    public async setTheme(themeName: ThemeName): Promise<void> {
        if (!availableThemes.includes(themeName)) {
            console.warn(`Unknown theme: ${themeName}`);
            return;
        }

        const oldTheme = this.currentTheme;
        this.currentTheme = themeName;

        try {
            await this.applyTheme(themeName);
            this.saveTheme(themeName);
            this.updateMenuVisuals();
            console.log(`✅ Theme switched to: ${themeName}`);
        } catch (error) {
            console.error(`❌ Failed to switch to theme: ${themeName}`, error);
            this.currentTheme = oldTheme;
        }
    }
    private async applyTheme(themeName: ThemeName): Promise<void> {
        // Since all CSS is imported, we just need to set the correct CSS classes
        
        // Remove all existing theme classes from body
        const body = document.body;
        availableThemes.forEach(theme => {
            body.classList.remove(`theme-${theme}`);
        });
        
        // Add new theme class
        body.classList.add(`theme-${themeName}`);
        
        // Set CSS custom property to tell Milkdown which theme to use
        document.documentElement.style.setProperty('--milkdown-theme', themeName);
        
        // Wait a bit for CSS to apply, then propagate colors to page UI
        setTimeout(() => {
            this.propagateThemeColors(themeName);
        }, 100);
    }

    private propagateThemeColors(themeName: ThemeName): void {
        // Find the milkdown editor element to read CSS variables from
        const milkdownElement = document.querySelector('.milkdown') || 
                              document.querySelector('#editor') || 
                              document.querySelector('[data-theme]') ||
                              document.documentElement;
        
        const computedStyle = window.getComputedStyle(milkdownElement);
        
        // Read Milkdown CSS variables (these are set by the imported theme CSS)
        const backgroundColor = computedStyle.getPropertyValue('--color-background')?.trim() ||
                              computedStyle.getPropertyValue('--milkdown-color-background')?.trim() ||
                              computedStyle.getPropertyValue('--crepe-color-background')?.trim();
        
        const textColor = computedStyle.getPropertyValue('--color-on-background')?.trim() ||
                         computedStyle.getPropertyValue('--milkdown-color-on-background')?.trim() ||
                         computedStyle.getPropertyValue('--crepe-color-on-background')?.trim();
        
        const surfaceColor = computedStyle.getPropertyValue('--color-surface')?.trim() ||
                           computedStyle.getPropertyValue('--milkdown-color-surface')?.trim() ||
                           computedStyle.getPropertyValue('--crepe-color-surface')?.trim();
        
        const borderColor = computedStyle.getPropertyValue('--color-outline')?.trim() ||
                          computedStyle.getPropertyValue('--milkdown-color-outline')?.trim() ||
                          computedStyle.getPropertyValue('--crepe-color-outline')?.trim();

        // Apply fallback colors if Milkdown variables aren't found
        this.applyFallbackColors(themeName, backgroundColor, textColor, surfaceColor, borderColor);
        
        console.log(`🎨 Applied ${themeName} theme colors to page UI`);
    }
    private applyFallbackColors(themeName: ThemeName, bg?: string, text?: string, surface?: string, border?: string): void {
        const root = document.documentElement;
        
        // Use detected colors if available, otherwise use theme-specific fallbacks
        if (bg && text) {
            root.style.setProperty('--page-background', bg);
            root.style.setProperty('--page-text', text);
            root.style.setProperty('--toolbar-background', surface || bg);
            root.style.setProperty('--border-color', border || '#ddd');
        } else {
            // Fallback color schemes for each theme
            switch (themeName) {
                case 'crepe':
                    root.style.setProperty('--page-background', '#ffffff');
                    root.style.setProperty('--page-text', '#1a1a1a');
                    root.style.setProperty('--toolbar-background', '#f5f5f5');
                    root.style.setProperty('--border-color', '#ddd');
                    break;
                case 'crepe-dark':
                    root.style.setProperty('--page-background', '#1a1a1a');
                    root.style.setProperty('--page-text', '#e0e0e0');
                    root.style.setProperty('--toolbar-background', '#2d2d2d');
                    root.style.setProperty('--border-color', '#444');
                    break;
                case 'nord':
                    root.style.setProperty('--page-background', '#2e3440');
                    root.style.setProperty('--page-text', '#d8dee9');
                    root.style.setProperty('--toolbar-background', '#3b4252');
                    root.style.setProperty('--border-color', '#4c566a');
                    break;
                case 'nord-dark':
                    root.style.setProperty('--page-background', '#242933');
                    root.style.setProperty('--page-text', '#d8dee9');
                    root.style.setProperty('--toolbar-background', '#2e3440');
                    root.style.setProperty('--border-color', '#4c566a');
                    break;
                case 'frame':
                    root.style.setProperty('--page-background', '#fefefe');
                    root.style.setProperty('--page-text', '#2d2d2d');
                    root.style.setProperty('--toolbar-background', '#f8f8f8');
                    root.style.setProperty('--border-color', '#e0e0e0');
                    break;
                case 'frame-dark':
                    root.style.setProperty('--page-background', '#1e1e1e');
                    root.style.setProperty('--page-text', '#e0e0e0');
                    root.style.setProperty('--toolbar-background', '#2a2a2a');
                    root.style.setProperty('--border-color', '#404040');
                    break;
            }
        }
    }

    private loadSavedTheme(): void {
        const savedTheme = localStorage.getItem('markdown-editor-theme') as ThemeName;
        if (savedTheme && availableThemes.includes(savedTheme)) {
            this.setTheme(savedTheme);
        } else {
            this.setTheme('crepe'); // Default theme
        }
    }

    private saveTheme(themeName: ThemeName): void {
        localStorage.setItem('markdown-editor-theme', themeName);
    }

    public getCurrentTheme(): ThemeName {
        return this.currentTheme;
    }
}