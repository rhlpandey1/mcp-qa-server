"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("@modelcontextprotocol/server");
const stdio_1 = require("@modelcontextprotocol/server/stdio");
const z = __importStar(require("zod/v4"));
function createServer() {
    const server = new server_1.McpServer({
        name: "hello-mcp-server",
        version: "1.0.0"
    });
    server.registerTool("say_hello", {
        title: "Say Hello",
        description: "Returns a greeting for the supplied name",
        inputSchema: z.object({
            name: z.string().describe("Name of the person to greet")
        })
    }, async ({ name }) => {
        return {
            content: [
                {
                    type: "text",
                    text: `Hello ${name}! Welcome to MCP.`
                }
            ]
        };
    });
    server.registerTool("calculate_sum", {
        title: "Calculate Sum",
        description: "Returns the summation of the provided numbers",
        inputSchema: z.object({
            a: z.int().describe("First number"),
            b: z.int().describe("second number")
        })
    }, async ({ a, b }) => {
        return {
            content: [
                {
                    type: "text",
                    text: `summation of ${a} and ${b} is ${a + b}.`
                }
            ]
        };
    });
    server.registerTool("calculate_percentage", {
        title: "Calculate Percentage",
        description: "Calculates the percentage of passed test cases from the total number of test cases",
        inputSchema: z.object({
            total: z.int().describe("Total number of test cases"),
            passed: z.int().describe("Number of passed test cases")
        })
    }, async ({ total, passed }) => {
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
    });
    return server;
}
void (0, stdio_1.serveStdio)(createServer);
console.error("Hello MCP server started");
