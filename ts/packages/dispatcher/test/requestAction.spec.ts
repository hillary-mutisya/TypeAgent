// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { getPackageFilePath } from "../src/utils/getPackageFilePath.js";
import { readTestData } from "../src/utils/test/testData.js";
import { Actions, RequestAction } from "agent-cache";
import { glob } from "glob";

const dataFiles = ["test/data/**/**/*.json"];

const inputs = await Promise.all(
    (await glob(dataFiles)).map((f) => readTestData(getPackageFilePath(f))),
);

const testInput = inputs.flatMap((f) =>
    f.entries.map(
        (data) =>
            new RequestAction(data.request, Actions.fromJSON(data.action)),
    ),
);

describe("RequestAction toString <=> fromString", () => {
    it.each(testInput)("%s", (requestAction) => {
        const str = requestAction.toString();
        const newRequestAction = RequestAction.fromString(str);
        expect(requestAction).toMatchObject(newRequestAction);
        expect(newRequestAction.toString()).toBe(str);
    });
});
