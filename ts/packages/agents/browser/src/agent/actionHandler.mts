// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WebSocketMessage, createWebSocket } from "common-utils/ws";
import { WebSocket } from "ws";
import {
  ActionContext,
  AppAction,
  AppAgent,
  AppAgentEvent,
  SessionContext,
} from "@typeagent/agent-sdk";
import { createActionResult } from "@typeagent/agent-sdk/helpers/action";
import { Crossword } from "./crossword/schema/pageSchema.mjs";
import {
  getBoardSchema,
  handleCrosswordAction,
} from "./crossword/actionHandler.mjs";

import { BrowserConnector } from "./browserConnector.mjs";
import { handleCommerceAction } from "./commerce/actionHandler.mjs";
import { TabTitleIndex, createTabTitleIndex } from "./tabTitleIndex.mjs";
import { ChildProcess, fork } from "child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  CommandHandlerNoParams,
  CommandHandlerTable,
  getCommandInterface,
} from "@typeagent/agent-sdk/helpers/command";

// import { handleInstacartAction } from "./instacart/actionHandler.mjs";
import { handleInstacartAction } from "./instacart/planHandler.mjs";

import { processWebAgentMessage, WebAgentChannels } from "./webTypeAgent.mjs";
import { isWebAgentMessage } from "../common/webAgentMessageTypes.mjs";

export function instantiate(): AppAgent {
  return {
    initializeAgentContext: initializeBrowserContext,
    updateAgentContext: updateBrowserContext,
    executeAction: executeBrowserAction,
    ...getCommandInterface(handlers),
  };
}

export type BrowserActionContext = {
  webSocket: WebSocket | undefined;
  webAgentChannels: WebAgentChannels | undefined;
  crossWordState: Crossword | undefined;
  browserConnector: BrowserConnector | undefined;
  browserProcess: ChildProcess | undefined;
  tabTitleIndex: TabTitleIndex | undefined;
};

async function initializeBrowserContext(): Promise<BrowserActionContext> {
  return {
    webSocket: undefined,
    webAgentChannels: undefined,
    crossWordState: undefined,
    browserConnector: undefined,
    browserProcess: undefined,
    tabTitleIndex: undefined,
  };
}

async function updateBrowserContext(
  enable: boolean,
  context: SessionContext<BrowserActionContext>,
  schemaName: string,
): Promise<void> {
  if (schemaName !== "browser") {
    // REVIEW: ignore sub-translator updates.
    return;
  }
  if (enable) {
    if (!context.agentContext.tabTitleIndex) {
      context.agentContext.tabTitleIndex = createTabTitleIndex();
    }

    if (context.agentContext.webSocket?.readyState === WebSocket.OPEN) {
      return;
    }

    const webSocket = await createWebSocket("browser", "dispatcher");
    if (webSocket) {
      context.agentContext.webSocket = webSocket;
      context.agentContext.browserConnector = new BrowserConnector(context);

      webSocket.onclose = (event: object) => {
        console.error("Browser webSocket connection closed.");
        context.agentContext.webSocket = undefined;
      };
      webSocket.addEventListener("message", async (event: any) => {
        const text = event.data.toString();
        const data = JSON.parse(text) as WebSocketMessage;
        if (isWebAgentMessage(data)) {
          await processWebAgentMessage(data, context);
          return;
        }

        if (data.target !== "dispatcher" || data.source !== "browser") {
          return;
        }

        if (data.body) {
          switch (data.messageType) {
            case "enableSiteTranslator": {
              if (data.body == "browser.crossword") {
                // initialize crossword state
                sendSiteTranslatorStatus(data.body, "initializing", context);
                context.agentContext.crossWordState =
                  await getBoardSchema(context);
                sendSiteTranslatorStatus(data.body, "initialized", context);

                if (context.agentContext.crossWordState) {
                  context.notify(
                    AppAgentEvent.Info,
                    "Crossword board initialized.",
                  );
                } else {
                  context.notify(
                    AppAgentEvent.Error,
                    "Crossword board initialization failed.",
                  );
                }
              }
              await context.toggleTransientAgent(data.body, true);
              break;
            }
            case "disableSiteTranslator": {
              await context.toggleTransientAgent(data.body, false);
              break;
            }
            case "browserActionResponse": {
              break;
            }
            case "debugBrowserAction": {
              await executeBrowserAction(
                data.body,
                context as unknown as ActionContext<BrowserActionContext>,
              );

              break;
            }
            case "tabIndexRequest": {
              await handleTabIndexActions(data.body, context, data.id);
              break;
            }
          }
        }
      });
    }
  } else {
    const webSocket = context.agentContext.webSocket;
    if (webSocket) {
      webSocket.onclose = null;
      webSocket.close();
    }

    context.agentContext.webSocket = undefined;

    // shut down service
    if (context.agentContext.browserProcess) {
      context.agentContext.browserProcess.kill();
    }
  }
}

async function executeBrowserAction(
  action: AppAction,
  context: ActionContext<BrowserActionContext>,
) {
  const webSocketEndpoint = context.sessionContext.agentContext.webSocket;
  const connector = context.sessionContext.agentContext.browserConnector;
  if (webSocketEndpoint) {
    try {
      context.actionIO.setDisplay("Running remote action.");

      let messageType = "browserActionRequest";
      if (action.translatorName === "browser.paleoBioDb") {
        messageType = "browserActionRequest.paleoBioDb";
      } else if (action.translatorName === "browser.crossword") {
        const crosswordResult = await handleCrosswordAction(action, context);
        return createActionResult(crosswordResult);
      } else if (action.translatorName === "browser.commerce") {
        const commerceResult = await handleCommerceAction(action, context);
        return createActionResult(commerceResult);
      } else if (action.translatorName === "browser.instacart") {
        const instacartResult = await handleInstacartAction(action, context);

        return createActionResult(
          instacartResult.displayText,
          undefined,
          instacartResult.entities,
        );

        // return createActionResult(instacartResult);
      }

      await connector?.sendActionToBrowser(action, messageType);
    } catch (ex: any) {
      if (ex instanceof Error) {
        console.error(ex);
      } else {
        console.error(JSON.stringify(ex));
      }

      throw new Error("Unable to contact browser backend.");
    }
  } else {
    throw new Error("No websocket connection.");
  }
  return undefined;
}

function sendSiteTranslatorStatus(
  translatorName: string,
  status: string,
  context: SessionContext<BrowserActionContext>,
) {
  const webSocketEndpoint = context.agentContext.webSocket;
  const callId = new Date().getTime().toString();

  if (webSocketEndpoint) {
    webSocketEndpoint.send(
      JSON.stringify({
        source: "dispatcher",
        target: "browser",
        messageType: "siteTranslatorStatus",
        id: callId,
        body: {
          translator: translatorName,
          status: status,
        },
      }),
    );
  }
}

async function handleTabIndexActions(
  action: any,
  context: SessionContext<BrowserActionContext>,
  requestId: string | undefined,
) {
  const webSocketEndpoint = context.agentContext.webSocket;
  const tabTitleIndex = context.agentContext.tabTitleIndex;

  if (webSocketEndpoint && tabTitleIndex) {
    try {
      const actionName =
        action.actionName ?? action.fullActionName.split(".").at(-1);
      let responseBody;

      switch (actionName) {
        case "getTabIdFromIndex": {
          const matchedTabs = await tabTitleIndex.search(
            action.parameters.query,
            1,
          );
          let foundId = -1;
          if (matchedTabs && matchedTabs.length > 0) {
            foundId = matchedTabs[0].item.value;
          }
          responseBody = foundId;
          break;
        }
        case "addTabIdToIndex": {
          await tabTitleIndex.addOrUpdate(
            action.parameters.title,
            action.parameters.id,
          );
          responseBody = "OK";
          break;
        }
        case "deleteTabIdFromIndex": {
          await tabTitleIndex.remove(action.parameters.id);
          responseBody = "OK";
          break;
        }
        case "resetTabIdToIndex": {
          await tabTitleIndex.reset();
          responseBody = "OK";
          break;
        }
      }

      webSocketEndpoint.send(
        JSON.stringify({
          source: "dispatcher",
          target: "browser",
          messageType: "tabIndexResponse",
          id: requestId,
          body: responseBody,
        }),
      );
    } catch (ex: any) {
      if (ex instanceof Error) {
        console.error(ex);
      } else {
        console.error(JSON.stringify(ex));
      }

      throw new Error("Unable to contact browser backend.");
    }
  } else {
    throw new Error("No websocket connection.");
  }
  return undefined;
}

export async function createAutomationBrowser(isVisible?: boolean) {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<undefined>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(undefined), 10000);
  });

  const hiddenWindowPromise = new Promise<ChildProcess | undefined>(
    (resolve, reject) => {
      try {
        const expressService = fileURLToPath(
          new URL(path.join("..", "./puppeteer/index.mjs"), import.meta.url),
        );

        const childProcess = fork(expressService, [
          isVisible ? "true" : "false",
        ]);

        childProcess.on("message", function (message) {
          if (message === "Success") {
            resolve(childProcess);
          } else if (message === "Failure") {
            resolve(undefined);
          }
        });

        childProcess.on("exit", (code) => {
          console.log("Browser instance exited with code:", code);
        });
      } catch (e: any) {
        console.error(e);
        resolve(undefined);
      }
    },
  );

  return Promise.race([hiddenWindowPromise, timeoutPromise]).then((result) => {
    clearTimeout(timeoutHandle);
    return result;
  });
}

class OpenStandaloneBrowserHandler implements CommandHandlerNoParams {
  public readonly description = "Open a standalone browser instance";
  public async run(context: ActionContext<BrowserActionContext>) {
    if (context.sessionContext.agentContext.browserProcess) {
      context.sessionContext.agentContext.browserProcess.kill();
    }
    context.sessionContext.agentContext.browserProcess =
      await createAutomationBrowser(true);
  }
}

class OpenHiddenBrowserHandler implements CommandHandlerNoParams {
  public readonly description = "Open a hidden/headless browser instance";
  public async run(context: ActionContext<BrowserActionContext>) {
    if (context.sessionContext.agentContext.browserProcess) {
      context.sessionContext.agentContext.browserProcess.kill();
    }
    context.sessionContext.agentContext.browserProcess =
      await createAutomationBrowser(false);
  }
}

class CloseBrowserHandler implements CommandHandlerNoParams {
  public readonly description = "Close the new Web Content view";
  public async run(context: ActionContext<BrowserActionContext>) {
    if (context.sessionContext.agentContext.browserProcess) {
      context.sessionContext.agentContext.browserProcess.kill();
    }
  }
}

export const handlers: CommandHandlerTable = {
  description: "Browser App Agent Commands",
  commands: {
    launch: {
      description: "Launch a browser session",
      defaultSubCommand: "standalone",
      commands: {
        hidden: new OpenHiddenBrowserHandler(),
        standalone: new OpenStandaloneBrowserHandler(),
      },
    },
    close: new CloseBrowserHandler(),
  },
};
