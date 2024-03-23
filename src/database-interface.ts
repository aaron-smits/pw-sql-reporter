import type {
    FullResult,
    TestCase,
    TestResult
} from "@playwright/test/reporter"

// Define the Database interface
export interface Database {
    dropTables(): Promise<void>
    createTables(): Promise<void>
    createTestRun(): Promise<void>
    createTest(test: TestCase): Promise<void>
    updateTest(test: TestCase, result: TestResult): Promise<void>
    updateTestRun(result: FullResult): Promise<void>
}
