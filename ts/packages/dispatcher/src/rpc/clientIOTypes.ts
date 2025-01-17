// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DisplayAppendMode } from "@typeagent/agent-sdk";
import { IAgentMessage, RequestId } from "../context/interactiveIO.js";
import { TemplateEditConfig } from "../translation/actionTemplate.js";

export type ClientIOInvokeFunctions = {
    askYesNo(params: {
        message: string;
        requestId: RequestId;
        defaultValue?: boolean | undefined;
    }): Promise<boolean>;
    proposeAction(params: {
        actionTemplates: TemplateEditConfig;
        requestId: RequestId;
        source: string;
    }): Promise<unknown>;
};

export type ClientIOCallFunctions = {
    clear(): void;
    exit(): void;

    setDisplay(params: { message: IAgentMessage }): void;
    appendDisplay(params: {
        message: IAgentMessage;
        mode: DisplayAppendMode;
    }): void;
    setDynamicDisplay(params: {
        source: string;
        requestId: RequestId;
        actionIndex: number;
        displayId: string;
        nextRefreshMs: number;
    }): void;

    notify(params: {
        event: string;
        requestId: RequestId;
        data: any;
        source: string;
    }): void;

    takeAction(params: { action: string; data: unknown }): void;
};
