import { getElementById } from "../utils";

// Available themes
const availableThemes = ['light', 'dark', 'nord', 'dracula', 'github', 'material'] as const;
type ThemeName = typeof availableThemes[number];

interface ThemeConfig {
    name: string;
    displayName: string;
    cssFile?: string;
    bodyClass: string;
}

const themeConfigs: Record<ThemeName, ThemeConfig> = {
    light: {
        name: 'light',
        displayName: 'Light',
        bodyClass: 'theme-light'
    },
    dark: {
        name: 'dark', 
        displayName: 'Dark',
        bodyClass: 'theme-dark'
    },
    nord: {
        name: 'nord',
        displayName: 'Nord',
        bodyClass: 'theme-nord'
    },
    dracula: {
        name: 'dracula',
        displayName: 'Dracula', 
        bodyClass: 'theme-dracula'
    },
    github: {
        name: 'github',
        displayName: 'GitHub',
        bodyClass: 'theme-github'
    },
    material: {
        name: 'material',
        displayName: 'Material',
        bodyClass: 'theme-material'
    }
};

export class ThemeManager {
    private currentTheme: ThemeName = 'light';
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
        const config = themeConfigs[themeName];
        
        // Remove existing theme classes
        Object.values(themeConfigs).forEach(themeConfig => {
            document.body.classList.remove(themeConfig.bodyClass);
        });

        // Add new theme class
        document.body.classList.add(config.bodyClass);

        // Load theme-specific CSS if needed
        await this.loadThemeCSS(themeName);

        // Apply theme-specific styling
        this.applyThemeStyles(themeName);
    }

    private async loadThemeCSS(themeName: ThemeName): Promise<void> {
        // Remove existing theme stylesheets
        const existingThemeLinks = document.querySelectorAll('link[data-theme]');
        existingThemeLinks.forEach(link => link.remove());

        // Load Milkdown theme CSS if available
        if (themeName === 'nord') {
            await this.loadMilkdownTheme('nord');
        } else if (themeName === 'dark') {
            await this.loadMilkdownTheme('crepe-dark');
        } else {
            await this.loadMilkdownTheme('crepe'); // Default light theme
        }
    }

    private async loadMilkdownTheme(milkdownTheme: string): Promise<void> {
        return new Promise((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.setAttribute('data-theme', milkdownTheme);
            
            // Load from node_modules (now served by backend)
            link.href = `/node_modules/@milkdown/crepe/lib/theme/${milkdownTheme}/style.css`;
            
            link.onload = () => {
                // Wait for CSS variables to be available, then apply to page UI
                setTimeout(() => {
                    this.applyMilkdownThemeToPageUI(milkdownTheme);
                    resolve();
                }, 100);
            };
            link.onerror = () => {
                console.warn(`Could not load Milkdown theme: ${milkdownTheme}`);
                resolve(); // Don't fail completely
            };
            
            // document.head.appendChild(link);
        });
    }

    private applyMilkdownThemeToPageUI(milkdownTheme: string): void {
        // Wait for next frame to ensure CSS variables are computed
        requestAnimationFrame(() => {
            // Get the milkdown element or fall back to document element
            const milkdownElement = document.querySelector('.milkdown') || document.querySelector('#editor') || document.documentElement;
            const computedStyle = window.getComputedStyle(milkdownElement);
            
            // Read Milkdown theme variables
            const backgroundColor = computedStyle.getPropertyValue('--crepe-color-background').trim();
            const onBackground = computedStyle.getPropertyValue('--crepe-color-on-background').trim();
            const surface = computedStyle.getPropertyValue('--crepe-color-surface').trim();
            const onSurface = computedStyle.getPropertyValue('--crepe-color-on-surface').trim();
            //const onSurfaceVariant = computedStyle.getPropertyValue('--crepe-color-on-surface-variant').trim();
            const outline = computedStyle.getPropertyValue('--crepe-color-outline').trim();
            const primary = computedStyle.getPropertyValue('--crepe-color-primary').trim();
            const hover = computedStyle.getPropertyValue('--crepe-color-hover').trim();
            
            // Only apply if we have valid values
            if (backgroundColor && onBackground) {
                // Apply variables to document root for page UI
                document.documentElement.style.setProperty('--page-background', backgroundColor);
                document.documentElement.style.setProperty('--page-text', onBackground);
                document.documentElement.style.setProperty('--toolbar-background', surface || backgroundColor);
                document.documentElement.style.setProperty('--border-color', outline || '#ddd');
                document.documentElement.style.setProperty('--page-surface', surface || backgroundColor);
                document.documentElement.style.setProperty('--page-on-surface', onSurface || onBackground);
                document.documentElement.style.setProperty('--page-primary', primary || '#805610');
                document.documentElement.style.setProperty('--page-hover', hover || surface || backgroundColor);
                
                console.log(`🎨 Applied ${milkdownTheme} theme colors to page UI`);
            } else {
                console.warn('⚠️ Milkdown theme variables not yet available, retrying...');
                // Retry after a longer delay
                setTimeout(() => this.applyMilkdownThemeToPageUI(milkdownTheme), 200);
            }
        });
    }

    private applyThemeStyles(themeName: ThemeName): void {
        // Apply theme body class for additional styling if needed
        document.body.className = `theme-${themeName}`;
        
        // Note: The actual theme colors are now applied by applyMilkdownThemeToPageUI()
        // which reads the CSS variables from the loaded Milkdown theme
    }

    private loadSavedTheme(): void {
        const savedTheme = localStorage.getItem('markdown-editor-theme') as ThemeName;
        if (savedTheme && availableThemes.includes(savedTheme)) {
            this.setTheme(savedTheme);
        } else {
            this.setTheme('light'); // Default theme
        }
    }

    private saveTheme(themeName: ThemeName): void {
        localStorage.setItem('markdown-editor-theme', themeName);
    }

    public getCurrentTheme(): ThemeName {
        return this.currentTheme;
    }
}