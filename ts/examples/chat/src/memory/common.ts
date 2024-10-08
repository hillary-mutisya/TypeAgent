// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ArgDef } from "interactive-app";

export function argSourceFile(defaultValue?: string | undefined): ArgDef {
    return {
        description: "Path to source file",
        type: "path",
        defaultValue,
    };
}
export function argDestFile(defaultValue?: string | undefined): ArgDef {
    return {
        description: "Path to output file",
        type: "string",
        defaultValue,
    };
}

export function argConcurrency(value: number): ArgDef {
    return {
        description: "Concurrency",
        type: "number",
        defaultValue: value,
    };
}

export function argMinScore(value: number): ArgDef {
    return {
        description: "Minimum score",
        type: "number",
        defaultValue: value,
    };
}
