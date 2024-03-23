import { createClient, Client } from "@libsql/client"
import type {
    FullResult,
    TestCase,
    TestResult,
    Reporter
} from "@playwright/test/reporter"

export default class SqlReporter implements Reporter {
  private db: Database;
  constructor(options: { db?: Database; dropTables?: boolean } = {}) {
    this.db = options.db || new TursoDB();
    if (options.dropTables) {
      this.db.dropTables();
    }
  }
  async onBegin() {
    // await this.db.dropTables()
    await this.db.createTables()
  }

  async onTestBegin(test: TestCase) {
    await this.db.createTest(test)
  }

  async onTestEnd(test: TestCase, result: TestResult) {
    await this.db.updateTest(test, result);
  }

  async onEnd(result: FullResult) {
    await this.db.updateTestRun(result);
  }
}

// Implement the Database interface to connect to your database
// In this example, we are using Turso
// https://www.turso.dev/docs/getting-started

export class TursoDB implements Database {
    readonly client: Client
    runId: number | undefined
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
    async createTestRun(): Promise<number> {
        const results = await this.client.execute({
            sql: `
              INSERT INTO test_runs (status, start_time)
              VALUES ('running', ?)
            `,
            args: [new Date().toISOString()]
        })
        return Number(results.lastInsertRowid)
    }

    async createTest(test: TestCase): Promise<void> {
        if (this.runId === undefined) {
            const runId = await this.createTestRun()
            this.runId = Number(runId)
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
        if (this.runId === undefined) {
            const runId = await this.createTestRun()
            this.runId = Number(runId)
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
        if (this.runId === undefined) {
            const runId = await this.createTestRun()
            this.runId = Number(runId)
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

// Define the Database interface
export interface Database {
  dropTables(): Promise<void>
  createTables(): Promise<void>
  createTestRun(): Promise<number>
  createTest(test: TestCase): Promise<void>
  updateTest(test: TestCase, result: TestResult): Promise<void>
  updateTestRun(result: FullResult): Promise<void>
}
