// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import sqlite from "better-sqlite3";
import * as ms from "memory-storage";

// Website visit frequency table
export interface VisitFrequency {
    domain: string;
    visitCount: number;
    lastVisitDate: string;
    averageTimeSpent?: number;
}

export class VisitFrequencyTable extends ms.sqlite.SqliteDataFrame {
    constructor(public db: sqlite.Database) {
        super(db, "visitFrequency", [
            ["domain", { type: "string" }],
            ["visitCount", { type: "number" }],
            ["lastVisitDate", { type: "string" }],
            ["averageTimeSpent", { type: "number", optional: true }],
        ]);
    }

    public getTopDomainsByVisits(limit: number = 10): VisitFrequency[] {
        const stmt = this.db.prepare(`
            SELECT * FROM visitFrequency 
            ORDER BY visitCount DESC 
            LIMIT ?
        `);
        return stmt.all(limit) as VisitFrequency[];
    }
}

// Website categories table
export interface WebsiteCategory {
    domain: string;
    category: string;
    confidence: number;
}

export class WebsiteCategoryTable extends ms.sqlite.SqliteDataFrame {
    constructor(public db: sqlite.Database) {
        super(db, "websiteCategories", [
            ["domain", { type: "string" }],
            ["category", { type: "string" }],
            ["confidence", { type: "number" }],
        ]);
    }

    public getCategoriesForDomain(domain: string): WebsiteCategory[] {
        const stmt = this.db.prepare(`
            SELECT * FROM websiteCategories 
            WHERE domain = ? 
            ORDER BY confidence DESC
        `);
        return stmt.all(domain) as WebsiteCategory[];
    }

    public getDomainsByCategory(category: string): WebsiteCategory[] {
        const stmt = this.db.prepare(`
            SELECT * FROM websiteCategories 
            WHERE category = ? 
            ORDER BY confidence DESC
        `);
        return stmt.all(category) as WebsiteCategory[];
    }
}

// Bookmark folder structure table
export interface BookmarkFolder {
    folderPath: string;
    url: string;
    title: string;
    dateAdded: string;
}

export class BookmarkFolderTable extends ms.sqlite.SqliteDataFrame {
    constructor(public db: sqlite.Database) {
        super(db, "bookmarkFolders", [
            ["folderPath", { type: "string" }],
            ["url", { type: "string" }],
            ["title", { type: "string" }],
            ["dateAdded", { type: "string" }],
        ]);
    }

    public getBookmarksByFolder(folderPath: string): BookmarkFolder[] {
        const stmt = this.db.prepare(`
            SELECT * FROM bookmarkFolders 
            WHERE folderPath LIKE ? 
            ORDER BY dateAdded DESC
        `);
        return stmt.all(`${folderPath}%`) as BookmarkFolder[];
    }

    public getAllFolders(): string[] {
        const stmt = this.db.prepare(`
            SELECT DISTINCT folderPath FROM bookmarkFolders 
            ORDER BY folderPath
        `);
        return stmt.all().map((row: any) => row.folderPath);
    }
}

// Knowledge entities table
export interface KnowledgeEntity {
    url: string;
    domain: string;
    entityName: string;
    entityType: string;
    confidence: number;
    extractionDate: string;
}

export class KnowledgeEntityTable extends ms.sqlite.SqliteDataFrame {
    constructor(public db: sqlite.Database) {
        super(db, "knowledgeEntities", [
            ["url", { type: "string", index: true }],
            ["domain", { type: "string", index: true }],
            ["entityName", { type: "string", index: true }],
            ["entityType", { type: "string" }],
            ["confidence", { type: "number" }],
            ["extractionDate", { type: "string", index: true }],
        ]);
        
        // Add composite indexes for Phase 2 optimization
        this.createCompositeIndexes();
    }

    private createCompositeIndexes(): void {
        try {
            // Composite index for co-occurrence queries (url + entityName)
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_knowledgeEntities_url_entity 
                ON knowledgeEntities(url, entityName);
            `);

            // Composite index for domain-based relationships (domain + entityName)
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_knowledgeEntities_domain_entity 
                ON knowledgeEntities(domain, entityName);
            `);

            // Composite index for entity stats queries (entityName + extractionDate + confidence)
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_knowledgeEntities_entity_stats 
                ON knowledgeEntities(entityName, extractionDate, confidence);
            `);

            // Composite index for temporal analysis (extractionDate + entityName)
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_knowledgeEntities_temporal 
                ON knowledgeEntities(extractionDate, entityName);
            `);

            // Composite index for domain analysis (domain + extractionDate)
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_knowledgeEntities_domain_temporal 
                ON knowledgeEntities(domain, extractionDate);
            `);

            // Composite index for confidence filtering (confidence + entityName + url)
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_knowledgeEntities_confidence_filter 
                ON knowledgeEntities(confidence, entityName, url);
            `);
        } catch (error) {
            console.warn("Failed to create composite indexes:", error);
        }
    }

    public getEntitiesByDomain(domain: string): KnowledgeEntity[] {
        const stmt = this.db.prepare(`
            SELECT * FROM knowledgeEntities 
            WHERE domain = ? 
            ORDER BY confidence DESC
        `);
        return stmt.all(domain) as KnowledgeEntity[];
    }

    public getTopEntities(
        limit: number = 20,
    ): Array<{ entityName: string; count: number }> {
        const stmt = this.db.prepare(`
            SELECT entityName, COUNT(*) as count 
            FROM knowledgeEntities 
            GROUP BY entityName 
            ORDER BY count DESC 
            LIMIT ?
        `);
        return stmt.all(limit) as Array<{ entityName: string; count: number }>;
    }

    public getEntitiesByType(entityType: string): KnowledgeEntity[] {
        const stmt = this.db.prepare(`
            SELECT * FROM knowledgeEntities 
            WHERE entityType = ? 
            ORDER BY confidence DESC
        `);
        return stmt.all(entityType) as KnowledgeEntity[];
    }

    // Phase 1 optimization methods
    public searchByEntities(entities: string[]): KnowledgeEntity[] {
        if (entities.length === 0) return [];
        
        const placeholders = entities.map(() => '?').join(',');
        const stmt = this.db.prepare(`
            SELECT DISTINCT * FROM knowledgeEntities 
            WHERE entityName IN (${placeholders})
            ORDER BY confidence DESC, extractionDate DESC
        `);
        return stmt.all(...entities) as KnowledgeEntity[];
    }

    public getEntityStats(entityName: string): any {
        const basicStatsStmt = this.db.prepare(`
            SELECT 
                COUNT(*) as totalMentions,
                COUNT(DISTINCT url) as uniqueUrls,
                COUNT(DISTINCT domain) as uniqueDomains,
                AVG(confidence) as avgConfidence,
                MIN(extractionDate) as firstSeen,
                MAX(extractionDate) as lastSeen
            FROM knowledgeEntities 
            WHERE entityName = ?
        `);

        const topDomainsStmt = this.db.prepare(`
            SELECT domain, COUNT(*) as count
            FROM knowledgeEntities 
            WHERE entityName = ?
            GROUP BY domain
            ORDER BY count DESC
            LIMIT 5
        `);

        const basicStats = basicStatsStmt.get(entityName);
        const topDomains = topDomainsStmt.all(entityName);

        return {
            ...(basicStats || {}),
            topDomains: topDomains.map((d: any) => d.domain),
        };
    }

    public getEntityRelationships(entityName: string): any[] {
        const stmt = this.db.prepare(`
            SELECT 
                e2.entityName as relatedEntity,
                e2.entityType,
                COUNT(*) as coOccurrenceCount,
                AVG(e2.confidence) as avgConfidence,
                GROUP_CONCAT(e2.url) as evidenceUrls
            FROM knowledgeEntities e1
            JOIN knowledgeEntities e2 ON e1.url = e2.url
            WHERE e1.entityName = ? AND e2.entityName != ?
            GROUP BY e2.entityName, e2.entityType
            ORDER BY coOccurrenceCount DESC, avgConfidence DESC
            LIMIT 20
        `);

        const results = stmt.all(entityName, entityName);
        return results.map((row: any) => ({
            relatedEntity: row.relatedEntity,
            entityType: row.entityType,
            relationshipType: "co_occurs_with",
            strength: Math.min(0.9, (row.coOccurrenceCount * row.avgConfidence) / 10),
            evidenceSources: row.evidenceUrls?.split(',') || [],
            coOccurrenceCount: row.coOccurrenceCount,
            confidence: row.avgConfidence,
        }));
    }
}

// Knowledge topics table
export interface KnowledgeTopic {
    url: string;
    domain: string;
    topic: string;
    relevance: number;
    extractionDate: string;
}

export class KnowledgeTopicTable extends ms.sqlite.SqliteDataFrame {
    constructor(public db: sqlite.Database) {
        super(db, "knowledgeTopics", [
            ["url", { type: "string" }],
            ["domain", { type: "string" }],
            ["topic", { type: "string" }],
            ["relevance", { type: "number" }],
            ["extractionDate", { type: "string" }],
        ]);
    }

    public getTopicsByDomain(domain: string): KnowledgeTopic[] {
        const stmt = this.db.prepare(`
            SELECT * FROM knowledgeTopics 
            WHERE domain = ? 
            ORDER BY relevance DESC
        `);
        return stmt.all(domain) as KnowledgeTopic[];
    }

    public getTopTopics(
        limit: number = 20,
    ): Array<{ topic: string; count: number }> {
        const stmt = this.db.prepare(`
            SELECT topic, COUNT(*) as count 
            FROM knowledgeTopics 
            GROUP BY topic 
            ORDER BY count DESC 
            LIMIT ?
        `);
        return stmt.all(limit) as Array<{ topic: string; count: number }>;
    }

    public getRelatedTopics(
        topic: string,
        limit: number = 10,
    ): KnowledgeTopic[] {
        const stmt = this.db.prepare(`
            SELECT DISTINCT kt.* FROM knowledgeTopics kt
            WHERE kt.url IN (
                SELECT url FROM knowledgeTopics 
                WHERE topic LIKE ?
            ) AND kt.topic != ?
            ORDER BY kt.relevance DESC
            LIMIT ?
        `);
        return stmt.all(`%${topic}%`, topic, limit) as KnowledgeTopic[];
    }
}

// Action-Knowledge correlation table
export interface ActionKnowledgeCorrelation {
    url: string;
    domain: string;
    actionType: string;
    relatedEntity: string;
    relatedTopic: string;
    confidence: number;
    correlationDate: string;
}

export class ActionKnowledgeCorrelationTable extends ms.sqlite.SqliteDataFrame {
    constructor(public db: sqlite.Database) {
        super(db, "actionKnowledgeCorrelations", [
            ["url", { type: "string" }],
            ["domain", { type: "string" }],
            ["actionType", { type: "string" }],
            ["relatedEntity", { type: "string" }],
            ["relatedTopic", { type: "string" }],
            ["confidence", { type: "number" }],
            ["correlationDate", { type: "string" }],
        ]);
    }

    public getCorrelationsByAction(
        actionType: string,
    ): ActionKnowledgeCorrelation[] {
        const stmt = this.db.prepare(`
            SELECT * FROM actionKnowledgeCorrelations 
            WHERE actionType = ? 
            ORDER BY confidence DESC
        `);
        return stmt.all(actionType) as ActionKnowledgeCorrelation[];
    }

    public getActionsByEntity(entity: string): ActionKnowledgeCorrelation[] {
        const stmt = this.db.prepare(`
            SELECT * FROM actionKnowledgeCorrelations 
            WHERE relatedEntity = ? 
            ORDER BY confidence DESC
        `);
        return stmt.all(entity) as ActionKnowledgeCorrelation[];
    }

    public getActionTopicMatrix(): Array<{
        actionType: string;
        topic: string;
        count: number;
    }> {
        const stmt = this.db.prepare(`
            SELECT actionType, relatedTopic as topic, COUNT(*) as count 
            FROM actionKnowledgeCorrelations 
            GROUP BY actionType, relatedTopic 
            ORDER BY count DESC
        `);
        return stmt.all() as Array<{
            actionType: string;
            topic: string;
            count: number;
        }>;
    }
}
