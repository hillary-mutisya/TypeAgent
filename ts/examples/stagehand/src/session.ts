// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    localBrowser,
    Stagehand,
    type Page,
    type StagehandBrowser,
} from "@browserbasehq/stagehand";
import {
    initRuntimeConfigFromProcessEnv,
    warmupCopilotFromConfig,
} from "@typeagent/aiclient";
import { loadConfig } from "@typeagent/config";

import { createTypeAgentClientLlm } from "./typeAgentClientLlm.js";

export type PrototypeSession = {
    browser: StagehandBrowser;
    stagehand: Stagehand;
    page: Page;
    close(): Promise<void>;
};

export type PrototypeSessionOptions = {
    headless: boolean;
    modelName?: string;
    userDataDir?: string;
};

export async function createPrototypeSession(
    options: PrototypeSessionOptions,
): Promise<PrototypeSession> {
    await loadConfig({ strict: false });
    initRuntimeConfigFromProcessEnv();
    await warmupCopilotFromConfig();

    const browser = await localBrowser.launch({
        headless: options.headless,
        ...(options.userDataDir === undefined
            ? {}
            : { userDataDir: options.userDataDir }),
    });

    let stagehand: Stagehand;
    try {
        stagehand = await Stagehand.create({
            browser,
            model: createTypeAgentClientLlm({
                ...(options.modelName === undefined
                    ? {}
                    : { modelName: options.modelName }),
            }),
            cache: false,
            selfHeal: true,
            logging: { level: "info", format: "pretty" },
        });
    } catch (error) {
        await browser.close();
        throw error;
    }

    const page =
        (await browser.context.activePage()) ??
        (await browser.context.newPage());

    return {
        browser,
        stagehand,
        page,
        async close() {
            try {
                await stagehand.close();
            } finally {
                await browser.close();
            }
        },
    };
}
