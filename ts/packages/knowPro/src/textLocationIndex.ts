// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ListIndexingResult, TextLocation } from "./interfaces.js";
import { IndexingEventHandlers } from "./interfaces.js";
import {
    addTextBatchToEmbeddingIndex,
    addTextToEmbeddingIndex,
    EmbeddingIndex,
    indexOfNearestTextInIndex,
    indexOfNearestTextInIndexSubset,
    TextEmbeddingIndexSettings,
} from "./fuzzyIndex.js";

export type ScoredTextLocation = {
    score: number;
    textLocation: TextLocation;
};

export interface ITextToTextLocationIndex {
    addTextLocation(
        text: string,
        textLocation: TextLocation,
    ): Promise<ListIndexingResult>;
    addTextLocations(
        textAndLocations: [string, TextLocation][],
        eventHandler?: IndexingEventHandlers,
    ): Promise<ListIndexingResult>;
    lookupText(
        text: string,
        maxMatches?: number,
        thresholdScore?: number,
    ): Promise<ScoredTextLocation[]>;

    serialize(): ITextToTextLocationIndexData;
    deserialize(data: ITextToTextLocationIndexData): void;
}

export interface ITextToTextLocationIndexData {
    textLocations: TextLocation[];
    embeddings: Float32Array[];
}

export class TextToTextLocationIndex implements ITextToTextLocationIndex {
    private textLocations: TextLocation[];
    private embeddingIndex: EmbeddingIndex;

    constructor(public settings: TextEmbeddingIndexSettings) {
        this.textLocations = [];
        this.embeddingIndex = new EmbeddingIndex();
    }

    public get size(): number {
        return this.embeddingIndex.size;
    }

    public get(pos: number): TextLocation {
        return this.textLocations[pos];
    }

    public async addTextLocation(
        text: string,
        textLocation: TextLocation,
    ): Promise<ListIndexingResult> {
        const result = await addTextToEmbeddingIndex(
            this.embeddingIndex,
            this.settings.embeddingModel,
            [text],
        );
        if (result.numberCompleted > 0) {
            this.textLocations.push(textLocation);
        }
        return result;
    }

    public async addTextLocations(
        textAndLocations: [string, TextLocation][],
        eventHandler?: IndexingEventHandlers,
        batchSize?: number,
    ): Promise<ListIndexingResult> {
        const result = await addTextBatchToEmbeddingIndex(
            this.embeddingIndex,
            this.settings.embeddingModel,
            textAndLocations.map((tl) => tl[0]),
            batchSize ?? this.settings.batchSize,
            eventHandler,
        );
        if (result.numberCompleted > 0) {
            textAndLocations =
                result.numberCompleted === textAndLocations.length
                    ? textAndLocations
                    : textAndLocations.slice(0, result.numberCompleted);
            this.textLocations.push(...textAndLocations.map((tl) => tl[1]));
        }
        return result;
    }

    public async lookupText(
        text: string,
        maxMatches?: number,
        thresholdScore?: number,
    ): Promise<ScoredTextLocation[]> {
        const matches = await indexOfNearestTextInIndex(
            this.embeddingIndex,
            this.settings.embeddingModel,
            text,
            maxMatches,
            thresholdScore,
        );
        return matches.map((m) => {
            return {
                textLocation: this.textLocations[m.item],
                score: m.score,
            };
        });
    }

    public async lookupTextInSubset(
        text: string,
        indicesToSearch: number[],
        maxMatches?: number,
        thresholdScore?: number,
    ): Promise<ScoredTextLocation[]> {
        const matches = await indexOfNearestTextInIndexSubset(
            this.embeddingIndex,
            this.settings.embeddingModel,
            text,
            indicesToSearch,
            maxMatches,
            thresholdScore,
        );
        return matches.map((m) => {
            return {
                textLocation: this.textLocations[m.item],
                score: m.score,
            };
        });
    }

    public clear(): void {
        this.textLocations = [];
        this.embeddingIndex.clear();
    }

    public serialize(): ITextToTextLocationIndexData {
        return {
            textLocations: this.textLocations,
            embeddings: this.embeddingIndex.serialize(),
        };
    }

    public deserialize(data: ITextToTextLocationIndexData): void {
        if (data.textLocations.length !== data.embeddings.length) {
            throw new Error(
                `TextToTextLocationIndexData corrupt. textLocation.length ${data.textLocations.length} != ${data.embeddings.length}`,
            );
        }
        this.textLocations = data.textLocations;
        this.embeddingIndex.deserialize(data.embeddings);
    }
}
