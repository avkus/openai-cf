// index.ts

// Define an interface for our environment variables for better type safety
interface Env {
  /**
   * The master key required in the Authorization: Bearer <WORKER_ACCESS_KEY> header
   * to access this Cloudflare Worker. This secures the worker itself.
   */
  WORKER_ACCESS_KEY: string;

  /**
   * The API key for the LLM provider (e.g., OpenAI, external Llama API).
   * NOTE: For Cloudflare AI bindings (env.AI.run()), this key is typically
   * not explicitly used in the worker's code as authentication is handled
   * by the Cloudflare Worker's associated account and AI binding configuration.
   * It would be used if this worker were proxying to an *external* LLM API
   * that requires a direct API key in its headers.
   */
  LLAMA_PROVIDER_API_KEY?: string; // Optional, as explained above

  /**
   * Cloudflare AI binding. This allows direct access to Cloudflare's AI models.
   * Automatically authenticated by Cloudflare's infrastructure.
   */
  AI: any; // The Cloudflare AI binding
}

/**
 * Interface for a chat message, typically conforming to OpenAI's message structure.
 */
interface Message {
  role: string;
  content: string;
}

/**
 * Interface for the incoming request body, expecting an array of messages.
 */
interface RequestData {
  messages: Message[];
  // Potentially other fields like model, temperature, etc., can be added here
}

/**
 * Interface for the response received from Cloudflare AI's env.AI.run().
 */
interface CloudflareAIResponse {
  response?: string; // The generated text content
  error?: string;     // Error message if the AI call fails
}

/**
 * Main worker default export, containing the fetch handler.
 */
export default {
  /**
   * Asynchronous fetch method to handle incoming requests.
   * Implements a two-tier authorization scheme.
   * @param request The incoming Request object.
   * @param env The environment variables object.
   * @param ctx The ExecutionContext object.
   * @returns A Promise that resolves to a Response object.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 1. Method Check: Ensure only POST requests are processed.
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed. Only POST requests are accepted." }), {
        status: 405, // 405 Method Not Allowed
        headers: { "Allow": "POST", "Content-Type": "application/json" }
      });
    }

    // 2. Tier 1 Authorization: Worker Access Key (Authorization: Bearer <WORKER_ACCESS_KEY>)
    const authHeader = request.headers.get("Authorization");
    const workerAccessKey = env.WORKER_ACCESS_KEY; // Master key for access to *this* worker

    // Basic validation for the presence of the WORKER_ACCESS_KEY in environment
    if (!workerAccessKey) {
        console.error("Configuration Error: WORKER_ACCESS_KEY environment variable is not set.");
        return new Response(JSON.stringify({ error: "Server configuration error: Worker access key is not configured." }), {
            status: 500, // 500 Internal Server Error for server-side misconfiguration
            headers: { "Content-Type": "application/json" }
        });
    }

    // Check if the Authorization header is present, starts with "Bearer ", and contains the correct key
    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== workerAccessKey) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing WORKER_ACCESS_KEY in Authorization header." }), {
        status: 401, // 401 Unauthorized
        headers: { "WWW-Authenticate": "Bearer", "Content-Type": "application/json" } // Inform client about expected auth scheme
      });
    }

    // 3. Process LLM Request: Parse request body and call Cloudflare AI binding.
    try {
      const requestData: RequestData = await request.json();

      // Validate incoming messages array
      if (!requestData.messages || !Array.isArray(requestData.messages) || requestData.messages.length === 0) {
        return new Response(JSON.stringify({ error: "Bad Request: 'messages' array is required and must not be empty in the request body." }), {
          status: 400, // 400 Bad Request
          headers: { "Content-Type": "application/json" }
        });
      }

      // Map messages to the format expected by Cloudflare AI (which is similar to OpenAI's)
      const messages: Message[] = requestData.messages.map((message: any) => ({
        role: message.role,
        content: message.content
      }));

      // Tier 2: LLM Provider API Key (Used internally by Cloudflare AI binding)
      // Note: For env.AI.run(), Cloudflare handles authentication to its own AI models internally.
      // The LLAMA_PROVIDER_API_KEY would be used here IF we were proxying to an *external* LLM API
      // that requires an API key in the request headers (e.g., fetch to OpenAI API).
      // Example of how it *would* be used for an external API:
      /*
      const llmProviderApiKey = env.LLAMA_PROVIDER_API_KEY;
      if (!llmProviderApiKey) {
          return new Response(JSON.stringify({ error: "Server configuration error: LLM_PROVIDER_API_KEY missing for external API." }), {
              status: 500, headers: { "Content-Type": "application/json" }
          });
      }
      const externalApiUrl = "https://api.example-llm.com/v1/chat/completions";
      const externalResponse = await fetch(externalApiUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${llmProviderApiKey}` // <-- Usage of LLAMA_PROVIDER_API_KEY
          },
          body: JSON.stringify({ messages, model: "@cf/meta/llama-3-8b-instruct" }) // Pass model or other params
      });
      const llmResult = await externalResponse.json();
      */

      // Call Cloudflare AI binding to run the Llama model
      const result: CloudflareAIResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
        messages
      });

      // Handle potential errors from the LLM API
      if (result.error) {
        console.error("LLM API Error:", result.error);
        return new Response(JSON.stringify({ error: `LLM API returned an error: ${result.error}` }), {
          status: 500, // 500 Internal Server Error if LLM API fails
          headers: { "Content-Type": "application/json" }
        });
      }

      // Format the LLM response to be OpenAI-like (choices array with message.content)
      const choices = [
        {
          message: {
            content: result.response // Cloudflare AI binding returns 'response' field
          }
        }
      ];

      // Return the successful response
      return new Response(JSON.stringify({ choices }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error: any) {
      // Catch any unexpected errors during request processing or LLM call
      console.error("Llama Forwarder Worker Error:", error.message || error);
      return new Response(JSON.stringify({ error: `An unexpected error occurred processing your request: ${error.message || "Unknown error"}` }), {
        status: 500, // 500 Internal Server Error for unhandled exceptions
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};