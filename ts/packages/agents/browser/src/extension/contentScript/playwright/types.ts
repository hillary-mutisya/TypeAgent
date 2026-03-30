// Copyright (c) Microsoft Corporation.
// Licensed under the Apache License, Version 2.0.
// Derived from microsoft/playwright — see LICENSE in this directory.

export type AriaRole =
    | "alert"
    | "alertdialog"
    | "application"
    | "article"
    | "banner"
    | "blockquote"
    | "button"
    | "caption"
    | "cell"
    | "checkbox"
    | "code"
    | "columnheader"
    | "combobox"
    | "complementary"
    | "contentinfo"
    | "definition"
    | "deletion"
    | "dialog"
    | "directory"
    | "document"
    | "emphasis"
    | "feed"
    | "figure"
    | "form"
    | "generic"
    | "grid"
    | "gridcell"
    | "group"
    | "heading"
    | "img"
    | "insertion"
    | "link"
    | "list"
    | "listbox"
    | "listitem"
    | "log"
    | "main"
    | "marquee"
    | "math"
    | "meter"
    | "menu"
    | "menubar"
    | "menuitem"
    | "menuitemcheckbox"
    | "menuitemradio"
    | "navigation"
    | "none"
    | "note"
    | "option"
    | "paragraph"
    | "presentation"
    | "progressbar"
    | "radio"
    | "radiogroup"
    | "region"
    | "row"
    | "rowgroup"
    | "rowheader"
    | "scrollbar"
    | "search"
    | "searchbox"
    | "separator"
    | "slider"
    | "spinbutton"
    | "status"
    | "strong"
    | "subscript"
    | "superscript"
    | "switch"
    | "tab"
    | "table"
    | "tablist"
    | "tabpanel"
    | "term"
    | "textbox"
    | "time"
    | "timer"
    | "toolbar"
    | "tooltip"
    | "tree"
    | "treegrid"
    | "treeitem";

export interface AriaNode {
    role: AriaRole | "text" | "fragment";
    name?: string;
    children?: AriaNode[];
    checked?: boolean | "mixed";
    disabled?: boolean;
    expanded?: boolean;
    level?: number;
    pressed?: boolean | "mixed";
    selected?: boolean;
    element?: Element;
    textContent?: string;
}
