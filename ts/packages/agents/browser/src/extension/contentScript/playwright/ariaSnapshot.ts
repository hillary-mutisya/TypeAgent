// Copyright (c) Microsoft Corporation.
// Licensed under the Apache License, Version 2.0.
// Derived from microsoft/playwright — see LICENSE in this directory.
// Simplified for TypeAgent: tree generation only.

import type { AriaNode, AriaRole } from "./types";
import {
    getRole,
    getAccessibleName,
    isInteractable,
    isElementVisible,
    getHeadingLevel,
} from "./roleUtils";

export interface AriaTreeOptions {
    onRef?: (ref: string, element: Element) => void;
    /** Include hidden elements that have meaningful form/interactive roles.
     *  Useful for action discovery on pages with progressive disclosure. */
    includeHiddenInteractive?: boolean;
}

let refCounter = 0;

const MAX_DEPTH = 100;

// Roles worth including even when the element is hidden, because they
// represent form controls behind progressive disclosure (collapsed
// sections, modal dialogs, etc.)
const hiddenInteractiveRoles: Set<string> = new Set([
    "combobox", "listbox", "option", "select", "textbox", "searchbox",
    "slider", "spinbutton", "switch", "checkbox", "radio", "menuitem",
    "menuitemcheckbox", "menuitemradio", "tab", "treeitem",
]);

export function generateAriaTree(
    root: Element,
    options: AriaTreeOptions = {},
): AriaNode {
    refCounter = 0;
    return buildNode(root, options, 0);
}

function buildNode(
    element: Element,
    options: AriaTreeOptions,
    depth: number,
): AriaNode {
    if (depth >= MAX_DEPTH) {
        return { role: "text", name: "[max depth exceeded]" };
    }
    const role = getRole(element);
    const children: AriaNode[] = [];

    for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = child.textContent?.trim();
            if (text) {
                children.push({
                    role: "text",
                    name: text,
                    textContent: text,
                });
            }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const childElement = child as Element;
            if (!isElementVisible(childElement)) {
                // If includeHiddenInteractive, check if this hidden
                // element (or its subtree) has interactive form roles
                // worth including for action discovery
                if (options.includeHiddenInteractive) {
                    const childRole = getRole(childElement);
                    if (
                        childRole &&
                        hiddenInteractiveRoles.has(childRole)
                    ) {
                        // Include this hidden interactive element
                        // but fall through to normal processing
                    } else {
                        // Not interactive — but scan children in case
                        // a hidden container wraps interactive elements
                        const hiddenChild = buildNode(
                            childElement,
                            options,
                            depth + 1,
                        );
                        if (
                            hiddenChild.children?.some(
                                (c) =>
                                    c.role !== "text" &&
                                    c.role !== "fragment",
                            )
                        ) {
                            // Has meaningful children, include as fragment
                            if (shouldIncludeNode(hiddenChild)) {
                                children.push(hiddenChild);
                            }
                        }
                        continue;
                    }
                } else {
                    continue;
                }
            }

            // Recurse into shadow DOM
            if (childElement.shadowRoot) {
                for (const shadowChild of childElement.shadowRoot.childNodes) {
                    if (shadowChild.nodeType === Node.ELEMENT_NODE) {
                        const shadowNode = buildNode(
                            shadowChild as Element,
                            options,
                            depth + 1,
                        );
                        if (shouldIncludeNode(shadowNode)) {
                            children.push(shadowNode);
                        }
                    }
                }
                continue;
            }

            const childNode = buildNode(childElement, options, depth + 1);
            if (shouldIncludeNode(childNode)) {
                children.push(childNode);
            }
        }
    }

    const node: AriaNode = {
        role: role || "fragment",
        element,
    };

    const name = role ? getAccessibleName(element) : undefined;
    if (name) node.name = name;

    if (children.length > 0) node.children = children;

    // Collect text content from descendants
    node.textContent = collectNodeText(node);

    // ARIA states
    if (role) {
        const checked = element.getAttribute("aria-checked");
        if (checked === "true") node.checked = true;
        else if (checked === "false") node.checked = false;
        else if (checked === "mixed") node.checked = "mixed";
        else if (
            element instanceof HTMLInputElement &&
            (element.type === "checkbox" || element.type === "radio")
        ) {
            node.checked = element.checked;
        }

        const disabled =
            element.getAttribute("aria-disabled") === "true" ||
            (element as HTMLElement & { disabled?: boolean }).disabled === true;
        if (disabled) node.disabled = true;

        const expanded = element.getAttribute("aria-expanded");
        if (expanded === "true") node.expanded = true;
        else if (expanded === "false") node.expanded = false;

        const pressed = element.getAttribute("aria-pressed");
        if (pressed === "true") node.pressed = true;
        else if (pressed === "false") node.pressed = false;
        else if (pressed === "mixed") node.pressed = "mixed";

        const selected = element.getAttribute("aria-selected");
        if (selected === "true") node.selected = true;

        const level = getHeadingLevel(element);
        if (level !== undefined) node.level = level;
    }

    // Assign ref for interactable elements
    if (role && isInteractable(element) && options.onRef) {
        const ref = `e${++refCounter}`;
        options.onRef(ref, element);
        // Attach ref to the node for serialization (stored transiently)
        (node as any)._ref = ref;
    }

    return node;
}

function collectNodeText(node: AriaNode): string {
    if (node.role === "text") return node.name || "";
    if (!node.children) return "";
    return node.children
        .map((c) => collectNodeText(c))
        .filter(Boolean)
        .join(" ");
}

function shouldIncludeNode(node: AriaNode): boolean {
    // Always include nodes with a meaningful role
    if (node.role !== "fragment" && node.role !== "text") return true;
    // Include text nodes
    if (node.role === "text" && node.name) return true;
    // Include fragments that have children (structural passthrough)
    if (node.children && node.children.length > 0) return true;
    return false;
}

// Roles that are structural and whose children should be flattened
// when the node has no name (reduces tree noise)
const structuralRoles: Set<string> = new Set([
    "generic",
    "none",
    "presentation",
    "group",
]);

export interface SerializeOptions {
    refPrefix?: string;
    includeTextContent?: boolean;
    maxTextPerNode?: number;
}

export function serializeAriaTree(
    node: AriaNode,
    options: SerializeOptions = {},
): string {
    const lines: string[] = [];
    serializeNode(node, 0, lines, options);
    return lines.join("\n");
}

function serializeNode(
    node: AriaNode,
    depth: number,
    lines: string[],
    options: SerializeOptions,
): void {
    const indent = "  ".repeat(depth);
    const ref = (node as any)._ref;
    const refStr = ref
        ? ` [ref=${options.refPrefix ? `${options.refPrefix}-${ref}` : ref}]`
        : "";

    if (node.role === "text") {
        const text = node.name || "";
        if (text.length > 0) {
            // Only emit standalone text nodes when they're not already captured as a parent's name
            lines.push(`${indent}- text "${truncate(text, 80)}"`);
        }
        return;
    }

    if (node.role === "fragment") {
        // Flatten: just render children at current depth
        if (node.children) {
            for (const child of node.children) {
                serializeNode(child, depth, lines, options);
            }
        }
        return;
    }

    // Skip structural roles with no name and flatten their children
    if (structuralRoles.has(node.role) && !node.name && !ref) {
        if (node.children) {
            for (const child of node.children) {
                serializeNode(child, depth, lines, options);
            }
        }
        return;
    }

    // Build the node line
    let line = `${indent}- ${node.role}`;
    if (node.name) {
        line += ` "${truncate(node.name, 80)}"`;
    }

    // Append states
    const states: string[] = [];
    if (node.checked === true) states.push("checked");
    else if (node.checked === false) states.push("unchecked");
    else if (node.checked === "mixed") states.push("mixed");
    if (node.disabled) states.push("disabled");
    if (node.expanded === true) states.push("expanded");
    else if (node.expanded === false) states.push("collapsed");
    if (node.pressed === true) states.push("pressed");
    if (node.selected) states.push("selected");
    if (node.level !== undefined) states.push(`level=${node.level}`);

    if (states.length > 0) {
        line += ` [${states.join(", ")}]`;
    }

    line += refStr;
    lines.push(line);

    // Optionally include text content
    if (
        options.includeTextContent &&
        node.textContent &&
        node.textContent.length > 0
    ) {
        const maxLen = options.maxTextPerNode ?? 500;
        const text = truncate(node.textContent, maxLen);
        // Only include text if it's different from the name (avoid duplication)
        if (text !== node.name) {
            lines.push(`${indent}    text: "${text}"`);
        }
    }

    // Render children
    if (node.children) {
        for (const child of node.children) {
            serializeNode(child, depth + 1, lines, options);
        }
    }
}

function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen - 3) + "...";
}
