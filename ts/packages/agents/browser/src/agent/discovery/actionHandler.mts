// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ActionContext } from "@typeagent/agent-sdk";
import { BrowserActionContext } from "../actionHandler.mjs";
import { BrowserConnector } from "../browserConnector.mjs";
import { createDiscoveryPageTranslator } from "./translator.mjs";

export async function handleSchemaDiscoveryAction(
  action: any,
  context: ActionContext<BrowserActionContext>,
) {
  let message = "OK";
  if (!context.sessionContext.agentContext.browserConnector) {
    throw new Error("No connection to browser session.");
  }

  const browser: BrowserConnector =
    context.sessionContext.agentContext.browserConnector;

  const agent = await createDiscoveryPageTranslator("GPT_4_O_MINI");

  switch (action.actionName) {
    case "findUserActions":
      await handleFindUserActions(action);
      break;
    case "summarizePage":
      await handleGetPageSummary(action);
      break;
  }

  async function handleFindUserActions(action: any) {
    const htmlFragments = await browser.getHtmlFragments();
    // const screenshot = await browser.getCurrentPageScreenshot();
    const screenshot = "";
    let pageSummary = "";

    const summaryResponse = await agent.getPageSummary(
      undefined,
      htmlFragments,
      screenshot,
    );

    if (summaryResponse.success) {
      pageSummary =
        "Page summary: \n" + JSON.stringify(summaryResponse.data, null, 2);
    }

    const timerName = `Analyzing page actions`;
    console.time(timerName);

    const response = await agent.getCandidateUserActions(
      undefined,
      htmlFragments,
      screenshot,
      pageSummary,
    );

    if (!response.success) {
      console.error("Attempt to get page actions failed");
      console.error(response.message);
      return;
    }

    console.timeEnd(timerName);
    message =
      "Possible user actions: \n" + JSON.stringify(response.data, null, 2);
    return response.data;
  }

  async function handleGetPageSummary(action: any) {
    const htmlFragments = await browser.getHtmlFragments();
    const timerName = `Summarizing page`;
    console.time(timerName);
    const response = await agent.getPageSummary(undefined, htmlFragments);

    if (!response.success) {
      console.error("Attempt to get page summary failed");
      console.error(response.message);
      return;
    }

    console.timeEnd(timerName);
    message = "Page summary: \n" + JSON.stringify(response.data, null, 2);
    return response.data;
  }

  return message;
}
