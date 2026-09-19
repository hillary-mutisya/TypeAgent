// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export type CommandName =
    | "commerce-search"
    | "commerce-inspect"
    | "commerce-add-to-cart"
    | "crossword-inspect"
    | "crossword-enter";

export type CliOptions = {
    command: CommandName;
    url: string;
    query?: string;
    product?: string;
    clue?: string;
    answer?: string;
    model?: string;
    headless: boolean;
    userDataDir?: string;
};

const commands = new Set<CommandName>([
    "commerce-search",
    "commerce-inspect",
    "commerce-add-to-cart",
    "crossword-inspect",
    "crossword-enter",
]);

export function parseCliOptions(args: string[]): CliOptions {
    const [commandValue, ...optionArgs] = args;
    if (!commands.has(commandValue as CommandName)) {
        throw new Error(`Unknown or missing command: ${commandValue ?? ""}`);
    }

    const values = new Map<string, string>();
    let headless = false;
    for (let index = 0; index < optionArgs.length; index++) {
        const option = optionArgs[index];
        if (option === "--headless") {
            headless = true;
            continue;
        }
        if (!option.startsWith("--")) {
            throw new Error(`Unexpected argument: ${option}`);
        }
        const value = optionArgs[++index];
        if (value === undefined || value.startsWith("--")) {
            throw new Error(`Missing value for ${option}`);
        }
        values.set(option.slice(2), value);
    }

    const command = commandValue as CommandName;
    const url = required(values, "url");
    validateUrl(url);
    requireCommandOption(command, values, "query", "commerce-search");
    requireCommandOption(command, values, "product", "commerce-add-to-cart");
    requireCommandOption(command, values, "clue", "crossword-enter");
    requireCommandOption(command, values, "answer", "crossword-enter");

    return {
        command,
        url,
        headless,
        ...optionalValue(values, "query"),
        ...optionalValue(values, "product"),
        ...optionalValue(values, "clue"),
        ...optionalValue(values, "answer"),
        ...optionalValue(values, "model"),
        ...optionalValue(values, "user-data-dir", "userDataDir"),
    };
}

export const usage = `Usage:
  stagehand-typeagent commerce-search --url <url> --query <text> [--headless]
  stagehand-typeagent commerce-inspect --url <url> [--headless]
  stagehand-typeagent commerce-add-to-cart --url <url> --product <name> [--headless]
  stagehand-typeagent crossword-inspect --url <url> [--headless]
  stagehand-typeagent crossword-enter --url <url> --clue <clue> --answer <answer> [--headless]

Common options:
  --model <TypeAgent model name>
  --user-data-dir <dedicated browser profile directory>`;

function required(values: Map<string, string>, name: string): string {
    const value = values.get(name);
    if (!value) {
        throw new Error(`Missing required option: --${name}`);
    }
    return value;
}

function requireCommandOption(
    command: CommandName,
    values: Map<string, string>,
    option: string,
    expectedCommand: CommandName,
): void {
    if (command === expectedCommand) {
        required(values, option);
    }
}

function optionalValue(
    values: Map<string, string>,
    option: string,
    property: string = option,
): Record<string, string> {
    const value = values.get(option);
    return value === undefined ? {} : { [property]: value };
}

function validateUrl(value: string): void {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("--url must use http or https");
    }
}
