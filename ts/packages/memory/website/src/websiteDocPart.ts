// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DocPart } from "conversation-memory";
import { conversation as kpLib } from "knowledge-processor";
import * as kp from "knowpro";
import { WebsiteDocPartMeta } from "./websiteDocPartMeta.js";
import { WebsiteMeta } from "./websiteMeta.js";

/**
 * A document part specifically for website content.
 * Maintains compatibility with DocPart while providing website-specific functionality.
 */
export class WebsiteDocPart extends DocPart {
    declare public metadata: WebsiteDocPartMeta;

    constructor(
        websiteMeta: WebsiteMeta,
        textChunks: string | string[] = [],
        tags?: string[] | undefined,
        timestamp?: string | undefined,
        knowledge?: kpLib.KnowledgeResponse | undefined,
        deletionInfo?: kp.DeletionInfo | undefined,
    ) {
        const metadata = new WebsiteDocPartMeta(websiteMeta);
        timestamp =
            timestamp || websiteMeta.visitDate || websiteMeta.bookmarkDate;

        super(textChunks, metadata, tags, timestamp, knowledge, deletionInfo);
    }

    // Convenience accessors for website-specific properties
    public get url(): string {
        return this.metadata.url;
    }

    public get title(): string | undefined {
        return this.metadata.title;
    }

    public get domain(): string | undefined {
        return this.metadata.domain;
    }

    public get visitDate(): string | undefined {
        return this.metadata.visitDate;
    }

    public get bookmarkDate(): string | undefined {
        return this.metadata.bookmarkDate;
    }

    public get websiteSource(): "bookmark" | "history" | "reading_list" {
        return this.metadata.websiteSource;
    }

    public get folder(): string | undefined {
        return this.metadata.folder;
    }

    public get visitCount(): number | undefined {
        return this.metadata.visitCount;
    }

    // Compatibility properties for UI components
    public get snippet(): string {
        // Return first chunk or empty string as snippet
        return this.textChunks[0] || "";
    }

    public get score(): number {
        // Default score - UI component expects this
        return 0.8;
    }

    public get lastVisited(): string | undefined {
        return this.visitDate;
    }

    // Override getKnowledge to provide compatibility properties for UI
    public override getKnowledge(): any {
        const knowledge = super.getKnowledge();
        if (!knowledge) return undefined;

        // Add compatibility properties expected by UI components
        return {
            ...knowledge,
            hasKnowledge:
                knowledge.entities.length > 0 || knowledge.topics.length > 0,
            status: "extracted",
            confidence: 0.8,
            entityCount: knowledge.entities.length,
            topicCount: knowledge.topics.length,
            suggestionCount: knowledge.actions.length,
        };
    }
}
