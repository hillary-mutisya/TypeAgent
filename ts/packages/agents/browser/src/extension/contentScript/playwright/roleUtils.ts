// Copyright (c) Microsoft Corporation.
// Licensed under the Apache License, Version 2.0.
// Derived from microsoft/playwright — see LICENSE in this directory.
// Simplified for TypeAgent: core role computation and accessible name calculation.

import type { AriaRole } from "./types";

// HTML element to implicit ARIA role mapping (WAI-ARIA 1.2 spec)
const implicitRoleMap: Record<string, AriaRole | ((el: Element) => AriaRole | undefined)> = {
    A: (el) => el.hasAttribute("href") ? "link" : undefined,
    ARTICLE: "article",
    ASIDE: "complementary",
    BUTTON: "button",
    DETAILS: "group",
    DIALOG: "dialog",
    FIELDSET: "group",
    FIGURE: "figure",
    FOOTER: (el) => isLandmarkContext(el) ? "contentinfo" : undefined,
    FORM: (el) => hasExplicitLabel(el) ? "form" : undefined,
    H1: "heading",
    H2: "heading",
    H3: "heading",
    H4: "heading",
    H5: "heading",
    H6: "heading",
    HEADER: (el) => isLandmarkContext(el) ? "banner" : undefined,
    HR: "separator",
    IMG: (el) => {
        const alt = el.getAttribute("alt");
        if (alt === "") return "presentation";
        return "img";
    },
    INPUT: (el) => {
        const type = (el as HTMLInputElement).type?.toLowerCase() || "text";
        switch (type) {
            case "button":
            case "image":
            case "reset":
            case "submit":
                return "button";
            case "checkbox":
                return "checkbox";
            case "radio":
                return "radio";
            case "range":
                return "slider";
            case "number":
                return "spinbutton";
            case "search":
                return "searchbox";
            case "email":
            case "tel":
            case "text":
            case "url":
            case "password":
                return el.hasAttribute("list") ? "combobox" : "textbox";
            default:
                return "textbox";
        }
    },
    LI: "listitem",
    MAIN: "main",
    MATH: "math",
    MENU: "list",
    NAV: "navigation",
    OL: "list",
    OPTGROUP: "group",
    OPTION: "option",
    OUTPUT: "status",
    P: "paragraph",
    PROGRESS: "progressbar",
    SECTION: (el) => hasExplicitLabel(el) ? "region" : undefined,
    SELECT: (el) => (el as HTMLSelectElement).multiple ? "listbox" : "combobox",
    SUMMARY: "button",
    TABLE: "table",
    TBODY: "rowgroup",
    TD: "cell",
    TEXTAREA: "textbox",
    TFOOT: "rowgroup",
    TH: (el) => {
        const scope = el.getAttribute("scope");
        if (scope === "col" || scope === "colgroup") return "columnheader";
        return "rowheader";
    },
    THEAD: "rowgroup",
    TR: "row",
    UL: "list",
};

// Check if an element has an explicit label without triggering full
// accessible name computation. Used by FORM/SECTION implicit role to
// avoid circular calls (getAccessibleName → getRole → getImplicitRole).
function hasExplicitLabel(el: Element): boolean {
    if (el.getAttribute("aria-label")?.trim()) return true;
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
        for (const id of labelledBy.split(/\s+/)) {
            if (el.ownerDocument.getElementById(id)) return true;
        }
    }
    if (el.getAttribute("title")?.trim()) return true;
    return false;
}

function isLandmarkContext(el: Element): boolean {
    let parent = el.parentElement;
    while (parent) {
        const tag = parent.tagName;
        if (tag === "ARTICLE" || tag === "ASIDE" || tag === "MAIN" ||
            tag === "NAV" || tag === "SECTION") {
            return false;
        }
        parent = parent.parentElement;
    }
    return true;
}

export function getImplicitRole(element: Element): AriaRole | undefined {
    const entry = implicitRoleMap[element.tagName];
    if (!entry) return undefined;
    if (typeof entry === "function") return entry(element);
    return entry;
}

export function getRole(element: Element): AriaRole | undefined {
    const explicitRole = element.getAttribute("role")?.trim().toLowerCase();
    if (explicitRole) return explicitRole as AriaRole;
    return getImplicitRole(element);
}

export function getAccessibleName(element: Element): string {
    // aria-labelledby takes precedence
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
        const parts: string[] = [];
        for (const id of labelledBy.split(/\s+/)) {
            const ref = element.ownerDocument.getElementById(id);
            if (ref) parts.push(getTextContent(ref));
        }
        const name = parts.join(" ").trim();
        if (name) return name;
    }

    // aria-label
    const ariaLabel = element.getAttribute("aria-label")?.trim();
    if (ariaLabel) return ariaLabel;

    // <label> for input elements
    if (element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement) {
        const id = element.id;
        if (id) {
            const label = element.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
            if (label) return getTextContent(label);
        }
        // Wrapping label
        const parentLabel = element.closest("label");
        if (parentLabel) {
            return getTextContent(parentLabel);
        }
    }

    // alt text for images
    if (element.tagName === "IMG") {
        const alt = element.getAttribute("alt");
        if (alt !== null) return alt;
    }

    // title attribute for links and images
    if (element.tagName === "A" || element.tagName === "IMG") {
        const title = element.getAttribute("title");
        if (title) return title;
    }

    // placeholder for inputs
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const placeholder = element.getAttribute("placeholder");
        if (placeholder) return placeholder;
    }

    // For headings, buttons, links — use text content
    const role = getRole(element);
    if (role === "heading" || role === "button" || role === "link" ||
        role === "tab" || role === "menuitem" || role === "option" ||
        role === "treeitem" || role === "cell" || role === "columnheader" ||
        role === "rowheader" || role === "tooltip" || role === "caption") {
        return getTextContent(element);
    }

    // Value for inputs
    if (element instanceof HTMLInputElement) {
        if (element.type === "submit" || element.type === "button") {
            return element.value || element.type;
        }
    }

    // title as fallback
    const title = element.getAttribute("title");
    if (title) return title;

    return "";
}

function getTextContent(element: Element): string {
    // Skip hidden elements
    if (element instanceof HTMLElement && element.hidden) return "";
    if (element.getAttribute("aria-hidden") === "true") return "";

    let text = "";
    for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            text += child.textContent || "";
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            text += getTextContent(child as Element);
        }
    }
    return text.replace(/\s+/g, " ").trim();
}

export function isInteractable(element: Element): boolean {
    const role = getRole(element);
    if (!role) return false;

    const interactableRoles: Set<string> = new Set([
        "button", "checkbox", "combobox", "link", "listbox",
        "menuitem", "menuitemcheckbox", "menuitemradio", "option",
        "radio", "scrollbar", "searchbox", "slider", "spinbutton",
        "switch", "tab", "textbox", "treeitem",
    ]);

    if (interactableRoles.has(role)) return true;

    // contenteditable elements
    if (element instanceof HTMLElement && element.isContentEditable) return true;

    // tabindex makes elements focusable/interactable
    const tabindex = element.getAttribute("tabindex");
    if (tabindex !== null && tabindex !== "-1") return true;

    return false;
}

export function isElementVisible(element: Element): boolean {
    if (!(element instanceof HTMLElement)) return true;

    // Check hidden attribute
    if (element.hidden) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;

    // Check computed style
    const style = window.getComputedStyle(element);
    if (style.display === "none") return false;
    if (style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (parseFloat(style.opacity) === 0) return false;

    // Check dimensions — zero-sized elements are hidden
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;

    return true;
}

export function getHeadingLevel(element: Element): number | undefined {
    const tag = element.tagName;
    if (tag >= "H1" && tag <= "H6") {
        return parseInt(tag[1]);
    }
    const ariaLevel = element.getAttribute("aria-level");
    if (ariaLevel) return parseInt(ariaLevel) || undefined;
    return undefined;
}
