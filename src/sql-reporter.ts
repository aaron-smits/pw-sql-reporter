import type {
    FullResult,
    TestCase,
    TestResult,
    Reporter
} from "@playwright/test/reporter"
import { Database, TursoDB } from "./database"

export default class SqlReporter implements Reporter {
    private db: Database
    constructor(options: { db?: Database, dropTables?: boolean } = {}) {
        this.db = options.db || new TursoDB()
        if (options.dropTables) {
            this.db.dropTables()
        }
    }
    async onBegin() {
        // await this.db.dropTables()
        await this.db.createTables()
        await this.db.createTestRun()
    }

    async onTestBegin(test: TestCase) {
        await this.db.createTest(test)
    }

    async onTestEnd(test: TestCase, result: TestResult) {
        await this.db.updateTest(test, result)
    }

    async onEnd(result: FullResult) {
        await this.db.updateTestRun(result)
    }
}

