import { McpServer, ResourceTemplate, completable } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

function createServer() {
    const server = new McpServer({
        name: "hello-mcp-server",
        version: "1.0.0"
    });

    server.registerTool(
        "say_hello",
        {
            title: "Say Hello",
            description: "Returns a greeting for the supplied name",
            inputSchema: z.object({
                name: z.string().describe("Name of the person to greet")
            })
        },
        async ({ name }) => {
            return {
                content: [
                    {
                        type: "text",
                        text: `Hello ${name}! Welcome to MCP.`
                    }
                ]
            };
        }
    );
    server.registerTool(
        "calculate_sum",
        {
            title: "Calculate Sum",
            description: "Returns the summation of the provided numbers",
            inputSchema: z.object({
                a: z.int().describe("First number"),
                b: z.int().describe("second number")
            })
        },
        async ({ a, b }) => {
            return {
                content: [
                    {
                        type: "text",
                        text: `summation of ${a} and ${b} is ${a + b}.`
                    }
                ]
            };
        }
    );
    const percentageSchema = z.object({
        total: z.int()
            .nonnegative()
            .describe("Total number of test cases"),

        passed: z.int()
            .nonnegative()
            .describe("Number of passed test cases")
    }).refine(
        data => data.passed <= data.total,
        {
            message: "Passed tests cannot be greater than total tests"
        }
    );
    server.registerTool(
        "calculate_percentage",
        {
            title: "Calculate Percentage",
            description:
                "Calculates the percentage of passed test cases from the total number of test cases",
            inputSchema: percentageSchema
        },
        async ({ total, passed }) => {

            if (total === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Cannot calculate percentage because total test cases is 0."
                        }
                    ]
                };
            }

            const percentage = (passed / total) * 100;

            return {
                content: [
                    {
                        type: "text",
                        text: `Percentage of passed tests is ${percentage}%.`
                    }
                ]
            };
        }
    );

    server.registerResource(
        "qa-test-cases",
        "qa://test-cases",
        {
            title: "QA Test Cases",
            description: "Contains available QA test cases and their metadata",
            mimeType: "application/json"
        },
        async (uri) => {
            const testCases = {
                testCases: [
                    {
                        id: "TC001",
                        name: "Valid Login",
                        module: "Authentication",
                        priority: "High"
                    },
                    {
                        id: "TC002",
                        name: "Invalid Login",
                        module: "Authentication",
                        priority: "High"
                    },
                    {
                        id: "TC003",
                        name: "Successful Checkout",
                        module: "Checkout",
                        priority: "Critical"
                    }
                ]
            };

            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(testCases, null, 2)
                    }
                ]
            };
        }
    );

    const testCaseData = [
        {
            id: "TC001",
            name: "Valid Login",
            module: "Authentication",
            priority: "High"
        },
        {
            id: "TC002",
            name: "Invalid Login",
            module: "Authentication",
            priority: "High"
        },
        {
            id: "TC003",
            name: "Successful Checkout",
            module: "Checkout",
            priority: "Critical"
        }
    ];

    server.registerResource(
        "individual-test-case",

        new ResourceTemplate(
            "qa://test-cases/{testId}",
            {
                list: async () => ({
                    resources: testCaseData.map(testCase => ({
                        uri: `qa://test-cases/${testCase.id}`,
                        name: testCase.name,
                        description: `Test case for ${testCase.module}`,
                        mimeType: "application/json"
                    }))
                })
            }
        ),

        {
            title: "Individual QA Test Case",
            description: "Retrieve an individual QA test case using its ID",
            mimeType: "application/json"
        },

        async (uri, { testId }) => {

            const testCase = testCaseData.find(
                test => test.id === testId
            );

            if (!testCase) {
                throw new Error(`Test case ${testId} not found`);
            }

            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(testCase, null, 2)
                    }
                ]
            };
        }
    );

    server.registerPrompt(
        "analyze-test-failure",
        {
            title: "Analyze Test Failure",
            description:
                "Analyze a failed automated test, identify its likely root cause, classify the failure, and recommend debugging steps.",

            argsSchema: z.object({
                testName: completable(
                    z.string().describe("Name of the failed automated test"),
                    (value) => {
                        return availableTestNames.filter(testName =>
                            testName.toLowerCase().includes(value.toLowerCase())
                        );
                    }
                ),

                errorMessage: z.string()
                    .describe("Error message produced by the test"),

                stackTrace: z.string()
                    .describe("Stack trace associated with the failure")
            })
        },

        async ({ testName, errorMessage, stackTrace }) => {

            const prompt = `
You are an experienced Senior SDET and QA Automation Engineer.

Analyze the following automated test failure.

TEST NAME:
${testName}

ERROR MESSAGE:
${errorMessage}

STACK TRACE:
${stackTrace}

Perform the following analysis:

1. Identify the failure category:
   - Application defect
   - Automation script defect
   - Test data issue
   - Environment or infrastructure issue
   - Timing or synchronization issue

2. Explain the likely root cause.

3. Identify the relevant stack trace information.

4. Recommend debugging steps.

5. Suggest possible automation code improvements.

6. Provide a final assessment with your confidence level.

Do not claim certainty when the available evidence is insufficient.
`;

            return {
                messages: [
                    {
                        role: "user",
                        content: {
                            type: "text",
                            text: prompt
                        }
                    }
                ]
            };
        }
    );
    const availableTestNames = [
        "checkout_should_complete",
        "checkout_invalid_coupon",
        "checkout_payment_failure",
        "login_with_valid_credentials",
        "login_with_invalid_credentials",
        "registration_with_existing_email"
    ];


    return server;
}

void serveStdio(createServer);

console.error("Hello MCP server started");