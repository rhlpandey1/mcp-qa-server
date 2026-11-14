import {
    McpServer,
    ResourceTemplate,
    completable,
    inputRequired,
    acceptedContent,
    type McpRequestContext
} from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

function createServer(reqCtx: McpRequestContext) {

    const server = new McpServer(
        {
            name: "hello-mcp-server",
            version: "1.0.0"
        },
        {
            capabilities: {
                resources: {
                    subscribe: true
                }
            }
        }
    );

    const TEST_RUN_URI = "qa://test-runs/latest";

    let latestTestRun = {
        runId: "RUN-001",
        total: 100,
        passed: 95,
        failed: 5,
        updatedAt: new Date().toISOString()
    };

    const subscribedUris = new Set<string>();



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

    server.registerTool(
        "simulate_test_run_update",
        {
            title: "Simulate Test Run Update",
            description: "Simulates completion of a test run and updates the latest QA report",
            inputSchema: z.object({
                passed: z.int().min(0),
                failed: z.int().min(0)
            })
        },
        async ({ passed, failed }) => {

            latestTestRun = {
                ...latestTestRun,
                total: passed + failed,
                passed,
                failed,
                updatedAt: new Date().toISOString()
            };

            if (subscribedUris.has(TEST_RUN_URI)) {
                await server.server.sendResourceUpdated({
                    uri: TEST_RUN_URI
                });
            }

            return {
                content: [
                    {
                        type: "text",
                        text: `Test run updated. Total: ${latestTestRun.total}, Passed: ${passed}, Failed: ${failed}`
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

    server.registerResource(
        "latest-test-run",
        TEST_RUN_URI,
        {
            title: "Latest QA Test Run",
            description: "Latest Playwright test execution summary",
            mimeType: "application/json"
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(latestTestRun, null, 2)
                }
            ]
        })
    );

    server.server.setRequestHandler(
        "resources/subscribe",
        async (request) => {
            const uri = request.params.uri;

            if (uri !== TEST_RUN_URI) {
                throw new Error(`Unknown resource: ${uri}`);
            }

            subscribedUris.add(uri);

            console.error(`Subscribed to: ${uri}`);

            return {};
        }
    );

    server.server.setRequestHandler(
        "resources/unsubscribe",
        async (request) => {
            const uri = request.params.uri;

            subscribedUris.delete(uri);

            console.error(`Unsubscribed from: ${uri}`);

            return {};
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

    //     server.registerTool(
    //         "analyze_failure_with_sampling",
    //         {
    //             title: "Analyze Test Failure with AI",
    //             description: "Uses the connected MCP client's LLM to analyze a Playwright test failure",
    //             inputSchema: z.object({
    //                 testName: z.string(),
    //                 errorMessage: z.string(),
    //                 stackTrace: z.string()
    //             })
    //         },
    //         async ({ testName, errorMessage, stackTrace }, ctx) => {

    //             const messages = [
    //                 {
    //                     role: "user" as const,
    //                     content: {
    //                         type: "text" as const,
    //                         text: `
    // You are a Senior QA Automation Engineer.

    // Analyze this Playwright test failure.

    // Test Name: ${testName}

    // Error Message: ${errorMessage}

    // Stack Trace: ${stackTrace}

    // Provide:
    // 1. Failure category
    // 2. Likely root cause
    // 3. Recommended debugging steps
    // 4. Suggested automation improvements

    // Do not assume the root cause without sufficient evidence.
    //                     `
    //                     }
    //                 }
    //             ];

    //             try {
    //                 // Request AI assistance through the MCP client
    //                 const response = await ctx.mcpReq.requestSampling({
    //                     messages,
    //                     maxTokens: 500
    //                 });

    //                 const content = response.content;

    //                 const analysis =
    //                     !Array.isArray(content) && content.type === "text"
    //                         ? content.text
    //                         : "Unable to generate analysis";

    //                 return {
    //                     content: [
    //                         {
    //                             type: "text" as const,
    //                             text: analysis
    //                         }
    //                     ]
    //                 };

    //             } catch (error) {
    //                 return {
    //                     isError: true,
    //                     content: [
    //                         {
    //                             type: "text" as const,
    //                             text: `Sampling failed: ${error instanceof Error
    //                                     ? error.message
    //                                     : "Unknown error"
    //                                 }`
    //                         }
    //                     ]
    //                 };
    //             }
    //         }
    //     );


    //     server.registerTool(
    //         "analyze_failure_with_ai",
    //         {
    //             title: "Analyze Test Failure with AI",
    //             description: "Uses Claude API to analyze a Playwright test failure",
    //             inputSchema: z.object({
    //                 testName: z.string(),
    //                 errorMessage: z.string(),
    //                 stackTrace: z.string()
    //             })
    //         },
    //         async ({ testName, errorMessage, stackTrace }) => {

    //             try {
    //                 const apiKey = process.env.ANTHROPIC_API_KEY;
    //                 const model = process.env.ANTHROPIC_MODEL;

    //                 if (!apiKey || !model) {
    //                     throw new Error(
    //                         "ANTHROPIC_API_KEY and ANTHROPIC_MODEL must be configured"
    //                     );
    //                 }

    //                 const anthropic = new Anthropic({
    //                     apiKey
    //                 });

    //                 const response = await anthropic.messages.create({
    //                     model,
    //                     max_tokens: 500,
    //                     messages: [
    //                         {
    //                             role: "user",
    //                             content: `
    // You are a Senior QA Automation Engineer.

    // Analyze this Playwright test failure.

    // Test Name: ${testName}

    // Error Message: ${errorMessage}

    // Stack Trace: ${stackTrace}

    // Provide:
    // 1. Failure category
    // 2. Likely root cause
    // 3. Recommended debugging steps
    // 4. Suggested automation improvements

    // Do not assume the root cause without sufficient evidence.
    //                         `
    //                         }
    //                     ]
    //                 });

    //                 const analysis = response.content
    //                     .filter(block => block.type === "text")
    //                     .map(block => block.text)
    //                     .join("\n");

    //                 return {
    //                     content: [
    //                         {
    //                             type: "text" as const,
    //                             text: analysis || "No analysis generated."
    //                         }
    //                     ]
    //                 };

    //             } catch (error) {

    //                 console.error("AI analysis failed:", error);

    //                 return {
    //                     isError: true,
    //                     content: [
    //                         {
    //                             type: "text" as const,
    //                             text: `AI analysis failed: ${error instanceof Error
    //                                 ? error.message
    //                                 : "Unknown error"
    //                                 }`
    //                         }
    //                     ]
    //                 };
    //             }
    //         }
    //     );


    server.registerTool(
        "analyze_failure_with_ai",
        {
            title: "Analyze Test Failure with AI",
            description:
                "Returns a mock AI-style analysis of a Playwright test failure without calling an external LLM API",

            inputSchema: z.object({
                testName: z.string()
                    .describe("Name of the failed Playwright test"),

                errorMessage: z.string()
                    .describe("Error message produced by the test"),

                stackTrace: z.string()
                    .describe("Stack trace associated with the failure")
            })
        },

        async ({ testName, errorMessage, stackTrace }) => {

            console.error("Analyzing test failure using mock implementation");

            const analysis = `
# Playwright Test Failure Analysis

## 1. Test Details

Test Name: ${testName}

Error Message: ${errorMessage}

Stack Trace:
${stackTrace}

## 2. Failure Category

Backend/API Server Error

The test received an unexpected HTTP 500 response instead of the expected HTTP 200 response.

## 3. Likely Root Causes

1. Backend service failure during request processing.
2. Database connection or transaction failure.
3. Unhandled exception in the checkout API.
4. Payment gateway integration failure.
5. Incorrect test data or environment configuration.

## 4. Recommended Debugging Steps

1. Capture and inspect the API response body.
2. Check backend application logs.
3. Verify database connectivity.
4. Inspect the request payload.
5. Check external service dependencies.
6. Verify the test environment configuration.

## 5. Suggested Automation Improvements

1. Add detailed API request and response logging.
2. Capture correlation IDs for failed requests.
3. Include response payloads in Allure reports.
4. Add meaningful assertions for API responses.
5. Improve failure diagnostics in the Playwright framework.

## 6. Final Assessment

Failure Classification: Backend/API Error

Confidence: Medium

Note: This is a predefined mock analysis for development and testing.
It is not an actual AI-generated diagnosis.
`;

            return {
                content: [
                    {
                        type: "text" as const,
                        text: analysis
                    }
                ]
            };
        }
    );


    const qaExecutionConfigSchema = z.object({
        environment: z.enum(["QA", "Staging", "Production"])
            .describe("Environment in which tests should execute"),

        browser: z.enum(["Chromium", "Firefox", "WebKit"])
            .describe("Browser for test execution"),

        testSuite: z.enum(["Smoke", "Regression"])
            .describe("Test suite to execute")
    });

    server.registerTool(
        "collect_qa_execution_config",
        {
            title: "Collect QA Execution Configuration",

            description:
                "Collects environment, browser and test suite details before executing QA tests",

            // Explicit input schema ensures proper TypeScript inference.
            inputSchema: z.object({})
        },

        async (_args, ctx) => {

            // Check whether the user has already supplied the configuration.
            const config = acceptedContent(
                ctx.mcpReq.inputResponses,
                "qaConfig",
                qaExecutionConfigSchema
            );

            // If configuration is missing, request it from the client.
            if (!config) {

                return inputRequired({
                    inputRequests: {
                        qaConfig: inputRequired.elicit({
                            message:
                                "Please provide the QA test execution configuration.",

                            requestedSchema: qaExecutionConfigSchema
                        })
                    }
                });
            }

            // Configuration received successfully.
            console.error("QA execution configuration received:", config);

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `
QA Execution Configuration Received:

Environment: ${config.environment}
Browser: ${config.browser}
Test Suite: ${config.testSuite}

Configuration successfully collected.
                    `
                    }
                ]
            };
        }
    );


    return server;
}

void serveStdio(createServer);

console.error("Hello MCP server started");