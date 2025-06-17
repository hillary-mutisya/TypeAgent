import { getElementById } from "../utils";

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
    private loadedThemes = new Set<ThemeName>();

    public async initialize(): Promise<void> {
        this.setupThemeMenu();
        await this.loadSavedTheme();
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
            await this.loadTheme(themeName);
            this.saveTheme(themeName);
            this.updateMenuVisuals();
            console.log(`✅ Theme switched to: ${themeName}`);
        } catch (error) {
            console.error(`❌ Failed to switch to theme: ${themeName}`, error);
            this.currentTheme = oldTheme;
        }
    }
    private async loadTheme(themeName: ThemeName): Promise<void> {
        try {
            // Remove existing theme stylesheets
            const existingThemeLinks = document.querySelectorAll('link[data-theme]');
            existingThemeLinks.forEach(link => link.remove());
            
            // Import the theme CSS dynamically
            await this.importThemeCSS(themeName);
            
            // Apply theme to body
            this.applyThemeToBody(themeName);
            
            // Wait for CSS to apply, then propagate colors
            setTimeout(() => {
                this.propagateThemeColors(themeName);
            }, 100);
            
        } catch (error) {
            console.error(`Failed to load theme: ${themeName}`, error);
            throw error;
        }
    }

    private async importThemeCSS(themeName: ThemeName): Promise<void> {
        // Create a link element to load the theme CSS
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.setAttribute('data-theme', themeName);
            
            // Use dynamic import path that Vite can resolve
            // This works because Vite serves node_modules during development
            // and bundles dependencies for production
            link.href = `/@milkdown/crepe/lib/theme/${themeName}/style.css`;
            
            link.onload = () => {
                this.loadedThemes.add(themeName);
                setTimeout(resolve, 50); // Small delay for CSS variables
            };
            
            link.onerror = () => {
                // Fallback: try alternative path
                link.href = `/node_modules/@milkdown/crepe/lib/theme/${themeName}/style.css`;
                
                link.onload = () => {
                    this.loadedThemes.add(themeName);
                    setTimeout(resolve, 50);
                };
                
                link.onerror = () => {
                    console.warn(`Could not load theme CSS: ${themeName}`);
                    resolve(); // Don't fail completely, use fallback colors
                };
            };
            
            document.head.appendChild(link);
        });
    }
    private applyThemeToBody(themeName: ThemeName): void {
        // Remove all existing theme classes
        const body = document.body;
        availableThemes.forEach(theme => {
            body.classList.remove(`theme-${theme}`);
        });
        
        // Add new theme class
        body.classList.add(`theme-${themeName}`);
    }

    private propagateThemeColors(themeName: ThemeName): void {
        // Wait for next frame to ensure CSS variables are computed
        requestAnimationFrame(() => {
            // Find elements that might have the Milkdown CSS variables
            const possibleElements = [
                document.querySelector('.milkdown'),
                document.querySelector('#editor'),
                document.querySelector('[data-theme]'),
                document.documentElement
            ].filter(Boolean);
            
            let themeColors = null;
            
            // Try to read CSS variables from Milkdown elements
            for (const element of possibleElements) {
                const computedStyle = window.getComputedStyle(element as Element);
                
                // Try different possible variable names
                const backgroundColor = 
                    computedStyle.getPropertyValue('--crepe-color-background')?.trim() ||
                    computedStyle.getPropertyValue('--color-background')?.trim() ||
                    computedStyle.getPropertyValue('--milkdown-color-background')?.trim();
                
                const textColor = 
                    computedStyle.getPropertyValue('--crepe-color-on-background')?.trim() ||
                    computedStyle.getPropertyValue('--color-on-background')?.trim() ||
                    computedStyle.getPropertyValue('--milkdown-color-on-background')?.trim();
                
                if (backgroundColor && textColor) {
                    themeColors = {
                        background: backgroundColor,
                        text: textColor,
                        surface: computedStyle.getPropertyValue('--crepe-color-surface')?.trim() || backgroundColor,
                        border: computedStyle.getPropertyValue('--crepe-color-outline')?.trim() || '#ddd'
                    };
                    break;
                }
            }
            
            // Apply colors to page UI
            this.applyColorsToPageUI(themeName, themeColors);
        });
    }
    private async loadSavedTheme(): Promise<void> {
        const savedTheme = localStorage.getItem('markdown-editor-theme') as ThemeName;
        if (savedTheme && availableThemes.includes(savedTheme)) {
            await this.setTheme(savedTheme);
        } else {
            await this.setTheme('crepe'); // Default theme
        }
    }

    private saveTheme(themeName: ThemeName): void {
        localStorage.setItem('markdown-editor-theme', themeName);
    }

    public getCurrentTheme(): ThemeName {
        return this.currentTheme;
    }
}