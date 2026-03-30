// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    generateAriaTree,
    serializeAriaTree,
} from "./playwright/ariaSnapshot";

let currentRefMap: Map<string, Element> = new Map();
let snapshotVersion = 0;

export interface AriaSnapshotOptions {
    includeTextContent?: boolean;
    maxTextPerNode?: number;
}

export interface AriaSnapshotResult {
    version: number;
    tree: string;
    textContent?: string;
    refCount: number;
    frameId: number;
}

export interface InteractionRequest {
    ref: string;
    action: "click" | "fill" | "select" | "check" | "focus";
    value?: string;
    snapshotVersion?: number;
}

export interface InteractionResult {
    success: boolean;
    error?: string;
}

export function captureAriaSnapshot(
    frameId: number,
    options: AriaSnapshotOptions = {},
): AriaSnapshotResult {
    snapshotVersion++;
    currentRefMap.clear();

    const framePrefix = `f${frameId}`;

    const tree = generateAriaTree(document.body, {
        onRef: (ref: string, element: Element) => {
            currentRefMap.set(ref, element);
        },
        includeHiddenInteractive: true,
    });

    const yamlText = serializeAriaTree(tree, {
        refPrefix: framePrefix,
        includeTextContent: options.includeTextContent,
        maxTextPerNode: options.maxTextPerNode ?? 500,
    });

    let textContent: string | undefined;
    if (options.includeTextContent && tree.textContent) {
        textContent = tree.textContent;
    }

    return {
        version: snapshotVersion,
        tree: yamlText,
        textContent,
        refCount: currentRefMap.size,
        frameId,
    };
}

export function interactByRef(request: InteractionRequest): InteractionResult {
    if (
        request.snapshotVersion !== undefined &&
        request.snapshotVersion !== snapshotVersion
    ) {
        return {
            success: false,
            error: `Stale snapshot: expected v${snapshotVersion}, got v${request.snapshotVersion}`,
        };
    }

    const element = currentRefMap.get(request.ref);
    if (!element || !element.isConnected) {
        return {
            success: false,
            error: `Element ref=${request.ref} not found or disconnected`,
        };
    }

    element.scrollIntoView({ block: "center", behavior: "instant" });

    switch (request.action) {
        case "click":
            (element as HTMLElement).click();
            break;
        case "fill":
            if (
                element instanceof HTMLInputElement ||
                element instanceof HTMLTextAreaElement
            ) {
                element.focus();
                element.value = request.value ?? "";
                element.dispatchEvent(
                    new Event("input", { bubbles: true }),
                );
                element.dispatchEvent(
                    new Event("change", { bubbles: true }),
                );
            }
            break;
        case "select":
            if (element instanceof HTMLSelectElement) {
                const option = Array.from(element.options).find(
                    (o) =>
                        o.text === request.value ||
                        o.value === request.value,
                );
                if (option) {
                    element.value = option.value;
                    element.dispatchEvent(
                        new Event("change", { bubbles: true }),
                    );
                }
            }
            break;
        case "check":
            if (element instanceof HTMLInputElement) {
                element.checked = !element.checked;
                element.dispatchEvent(
                    new Event("change", { bubbles: true }),
                );
            }
            break;
        case "focus":
            (element as HTMLElement).focus();
            break;
    }

    return { success: true };
}
