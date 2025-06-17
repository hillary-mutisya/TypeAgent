import { EDITOR_CONFIG } from "../config";
import { getElementById, toggleClass } from "../utils";

export class ThemeManager {
    public async initialize(): Promise<void> {
        this.setupThemeToggle();
        this.loadSavedTheme();
    }

    private setupThemeToggle(): void {
        const themeToggle = getElementById("theme-toggle");
        if (themeToggle) {
            themeToggle.addEventListener("click", () => {
                this.toggleTheme();
            });
        }
    }

    private toggleTheme(): void {
        toggleClass(document.body, "dark-theme");

        const isDark = document.body.classList.contains("dark-theme");
        const theme = isDark
            ? EDITOR_CONFIG.THEMES.DARK
            : EDITOR_CONFIG.THEMES.LIGHT;

        localStorage.setItem(EDITOR_CONFIG.STORAGE_KEYS.THEME, theme);
    }

    private loadSavedTheme(): void {
        const savedTheme = localStorage.getItem(
            EDITOR_CONFIG.STORAGE_KEYS.THEME,
        );

        if (savedTheme === EDITOR_CONFIG.THEMES.DARK) {
            document.body.classList.add("dark-theme");
        }
    }

    public getCurrentTheme(): string {
        return document.body.classList.contains("dark-theme")
            ? EDITOR_CONFIG.THEMES.DARK
            : EDITOR_CONFIG.THEMES.LIGHT;
    }

    public setTheme(theme: string): void {
        if (theme === EDITOR_CONFIG.THEMES.DARK) {
            document.body.classList.add("dark-theme");
        } else {
            document.body.classList.remove("dark-theme");
        }

        localStorage.setItem(EDITOR_CONFIG.STORAGE_KEYS.THEME, theme);
    }
}
