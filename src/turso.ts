import { createClient, Client } from "@libsql/client"
import type {
    FullResult,
    TestCase,
    TestResult
} from "@playwright/test/reporter"
import { Database } from "./database-interface"
// Implement the Database interface to connect to your database
// In this example, we are using Turso
// https://www.turso.dev/docs/getting-started

export class TursoDB implements Database {
    readonly client: Client
    private runId: number | undefined
    constructor() {
        this.client = createClient({
            url: "libsql://" + process.env.TURSO_URL,
            authToken: process.env.TURSO_TOKEN
        })
    }
    async dropTables(): Promise<void> {
        await this.client.execute("DROP TABLE IF EXISTS test_runs;")
        await this.client.execute("DROP TABLE IF EXISTS tests;")
        await this.client.execute("DROP TABLE IF EXISTS attachments;")
    }
    async createTables(): Promise<void> {
        // Test Runs table
        // Create a new table if it doesn't exist
        await this.client.execute(`
            CREATE TABLE IF NOT EXISTS test_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT,
                start_time TIMESTAMP,
                end_time TIMESTAMP
            );
        `)
        // Tests table
        // Create a new table if it doesn't exist
        await this.client.execute(`
            CREATE TABLE IF NOT EXISTS tests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                history_id STRING,
                run_id INTEGER,
                title TEXT,
                status TEXT,
                duration INTEGER,
                error TEXT,
                stdout TEXT,
                stderr TEXT,
                retry INTEGER
            );
        `)

        // Attachments table
        // Create a new table if it doesn't exist
        await this.client.execute(`
            CREATE TABLE IF NOT EXISTS attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                test_id INTEGER,
                name TEXT,
                path TEXT,
                body BYTEA,
                content_type TEXT,
                is_screenshot BOOLEAN,
                is_video BOOLEAN
            );
        `)
    }
    async createTestRun(): Promise<void> {
        const results = await this.client.execute({
            sql: `
              INSERT INTO test_runs (status, start_time)
              VALUES ('running', ?)
            `,
            args: [new Date().toISOString()]
        })
        if (!results.lastInsertRowid) {
            throw new Error("Failed to create test run")
        }
        this.runId = Number(results.lastInsertRowid)
    }

    async createTest(test: TestCase): Promise<void> {
        if (!this.runId) {
            throw new Error("Test run not created")
        }
        await this.client.execute({
            sql: `
                  INSERT INTO tests (run_id, title, history_id)
                  VALUES(?, ?, ?)
              `,
            args: [this.runId, test.title, test.id]
        })
    }
    async updateTest(test: TestCase, result: TestResult): Promise<void> {
        if (!this.runId) {
            throw new Error("Test run not created")
        }
        await this.client.execute({
            sql: `
                UPDATE tests
                SET status = ?, duration = ?, error = ?, stdout = ?, stderr = ?, retry = ?
                WHERE history_id = ? AND run_id = ?
            `,
            args: [
                result.status,
                result.duration,
                result.error && result.error.message
                    ? result.error.message
                    : "",
                result.stdout ? result.stdout.toString() : "",
                result.stderr ? result.stderr.toString() : "",
                result.retry,
                test.title,
                this.runId
            ]
        })
    }
    async updateTestRun(result: FullResult): Promise<void> {
        if (!this.runId) {
            throw new Error("Test run not created")
        }
        await this.client.execute({
            sql: `
                UPDATE test_runs
                SET status = ?, end_time = ?
                WHERE id = ?
            `,
            args: [result.status, new Date().toISOString(), this.runId]
        })
    }
}