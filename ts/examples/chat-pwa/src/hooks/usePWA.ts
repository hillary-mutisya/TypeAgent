// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePWA() {
    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

    useEffect(() => {
        // Check if already installed
        const isStandalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            (navigator as Navigator & { standalone?: boolean }).standalone === true;
        setIsInstalled(isStandalone);

        // Listen for install prompt
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            setInstallPrompt(e as BeforeInstallPromptEvent);
        };

        // Listen for app installed
        const handleAppInstalled = () => {
            setIsInstalled(true);
            setInstallPrompt(null);
        };

        // Listen for online/offline
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener("beforeinstallprompt", handleBeforeInstall);
        window.addEventListener("appinstalled", handleAppInstalled);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
            window.removeEventListener("appinstalled", handleAppInstalled);
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    useEffect(() => {
        // Register service worker
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js")
                .then((reg) => {
                    setRegistration(reg);

                    // Check for updates
                    reg.addEventListener("updatefound", () => {
                        const newWorker = reg.installing;
                        if (newWorker) {
                            newWorker.addEventListener("statechange", () => {
                                if (
                                    newWorker.state === "installed" &&
                                    navigator.serviceWorker.controller
                                ) {
                                    setUpdateAvailable(true);
                                }
                            });
                        }
                    });
                })
                .catch((err) => {
                    console.error("Service worker registration failed:", err);
                });
        }
    }, []);

    const promptInstall = useCallback(async () => {
        if (!installPrompt) return false;

        await installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;

        if (outcome === "accepted") {
            setInstallPrompt(null);
            return true;
        }
        return false;
    }, [installPrompt]);

    const dismissInstall = useCallback(() => {
        setInstallPrompt(null);
        localStorage.setItem("pwa-install-dismissed", Date.now().toString());
    }, []);

    const applyUpdate = useCallback(() => {
        if (registration?.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
            window.location.reload();
        }
    }, [registration]);

    // Check if install was recently dismissed
    const wasRecentlyDismissed = useCallback(() => {
        const dismissed = localStorage.getItem("pwa-install-dismissed");
        if (!dismissed) return false;
        const dismissedTime = parseInt(dismissed, 10);
        const dayInMs = 24 * 60 * 60 * 1000;
        return Date.now() - dismissedTime < dayInMs;
    }, []);

    return {
        canInstall: !!installPrompt && !isInstalled && !wasRecentlyDismissed(),
        isInstalled,
        isOnline,
        updateAvailable,
        promptInstall,
        dismissInstall,
        applyUpdate,
    };
}
