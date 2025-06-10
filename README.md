# Cloudflare LLM Proxy Worker with Two-Tier Authorization

This Cloudflare Worker acts as a secure proxy for Large Language Models (LLMs), specifically demonstrating integration with Cloudflare AI models (e.g., Llama 3). It implements a two-tier authorization system to control access: one key for accessing the worker itself, and another (implicitly used by Cloudflare AI binding or explicitly for external LLMs) for the LLM API call.

This setup ensures that only authorized clients can send requests to your worker, and your worker is correctly authenticated with the underlying LLM provider.

## 🚀 Features

*   **POST Method Enforcement:** Only allows `POST` requests.
*   **Two-Tier Authorization:**
    *   **Tier 1 (Worker Access):** Requires a `Bearer` token in the `Authorization` header to access this Cloudflare Worker.
    *   **Tier 2 (LLM API Access):** (Conceptual for Cloudflare AI binding) The worker uses an internal mechanism (or a configurable API key for external LLMs) to authenticate with the LLM provider.
*   **LLM Proxying:** Forwards chat messages to `@cf/meta/llama-3-8b-instruct` model via Cloudflare AI binding.
*   **OpenAI-like Response Format:** Formats the LLM's response into a `choices` array, similar to OpenAI's Chat Completions API, for easier integration with existing clients.
*   **Robust Error Handling:** Returns appropriate HTTP status codes and JSON error messages for various scenarios (method not allowed, unauthorized, bad request, LLM API errors, unexpected errors).

## ⚙️ Setup and Deployment

### Prerequisites

*   A Cloudflare account.
*   Node.js (LTS recommended) and npm installed.
*   [`wrangler` CLI](https://developers.cloudflare.com/workers/wrangler/get-started/) installed and configured (`npm i -g wrangler`).

### 1. `wrangler.toml` Configuration

Create a `wrangler.toml` file in the root of your project. This file configures your Cloudflare Worker.

```toml
# wrangler.toml
name = "your-llm-proxy-worker" # Replace with your desired worker name
main = "index.ts"              # Path to your TypeScript worker file
compatibility_date = "2024-06-10" # Use a recent date for compatibility

# Add a binding for Cloudflare AI
[ai]
binding = "AI" # This makes `env.AI` available in your worker
```

### 2. Environment Variables (Secrets) in Cloudflare

This worker relies on environment variables for authorization keys. **It is crucial to store these as secrets in Cloudflare to prevent them from being exposed in your code repository.**

You will need to set the following variables:

*   `WORKER_ACCESS_KEY`: This is your **master key** that clients will use in the `Authorization: Bearer` header to access *this proxy worker*. Choose a strong, unique key.
*   `LLAMA_PROVIDER_API_KEY`: (Optional for `@cf` binding) This key *would* be used if your worker were proxying to an **external LLM API** (e.g., OpenAI, Anthropic, or a self-hosted Llama instance that requires an API key). For `@cf/meta/llama-3-8b-instruct` via Cloudflare AI binding, the worker's authentication is handled internally by Cloudflare. However, it's good practice to define it if you anticipate switching to an external provider later.

**How to add secrets:**

You can add these secrets via the Cloudflare Dashboard or using the `wrangler` CLI.

#### Via Cloudflare Dashboard:

1.  Log in to your Cloudflare Dashboard.
2.  Navigate to **Workers & Pages**.
3.  Select your Worker (or create a new one).
4.  Go to **Settings** -> **Variables**.
5.  Under "Environment Variables", click "Add variable".
6.  Enter the variable name (`WORKER_ACCESS_KEY` or `LLAMA_PROVIDER_API_KEY`) and its value. Ensure "Encrypt" is checked for sensitive values.
7.  Click "Save".

#### Via Wrangler CLI:

You can set secrets using the `wrangler secret put` command.

```bash
wrangler secret put WORKER_ACCESS_KEY
# Enter your master key when prompted
wrangler secret put LLAMA_PROVIDER_API_KEY
# Enter your LLM provider API key (if applicable) when prompted
```

### 3. Deployment

Once `wrangler.toml` is configured and secrets are set, deploy your worker:

```bash
wrangler deploy --name your-llm-proxy-worker # Use the name from your wrangler.toml
```

Wrangler will compile your `index.ts` to JavaScript and deploy it to your Cloudflare account.

## 💡 Example Usage

After deployment, your worker will be accessible via a URL like `https://your-llm-proxy-worker.<your-username>.workers.dev`.

Here's an example of how a client (e.g., a Streamlit application, `curl`) would call this worker:

```bash
curl -X POST \
  https://your-llm-proxy-worker.<your-username>.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_WORKER_ACCESS_KEY" \
  -d '{
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful AI assistant."
      },
      {
        "role": "user",
        "content": "Tell me a short story about a brave knight."
      }
    ]
  }'
```

**Replace:**
*   `https://your-llm-proxy-worker.<your-username>.workers.dev`: With the actual URL of your deployed Worker.
*   `YOUR_WORKER_ACCESS_KEY`: With the `WORKER_ACCESS_KEY` you set as a secret.

**Expected (successful) Response:**

```json
{
  "choices": [
    {
      "message": {
        "content": "In a land shrouded by mist, brave Sir Kael stood before the dragon's lair..."
      }
    }
  ]
}
```

## 🧪 Local Testing

You can test your worker locally using Wrangler:

```bash
wrangler dev --local --env production # Use --env production to load secrets from Cloudflare
```

This will start a local server, usually on `http://127.0.0.1:8787`, that proxies requests to your worker. You can then use `curl` against this local URL to test.

Remember to set up your environment variables locally for `wrangler dev` to pick them up, or use the `--env` flag. For local development, you might create a `.dev.vars` file with the keys (though not ideal for secrets, good for rapid prototyping).

## 🔒 Security Considerations

*   **Protect `WORKER_ACCESS_KEY`:** This key grants access to your LLM proxy. Treat it like a password and do not expose it in client-side code or public repositories.
*   **LLM Provider API Key:** While `env.AI.run` handles auth internally for Cloudflare AI, if you switch to an external LLM, ensure `LLAMA_PROVIDER_API_KEY` is always managed securely (e.g., via Cloudflare secrets, Azure Key Vault, Google Secret Manager, etc.).
*   **Input Validation:** The worker performs basic validation on the `messages` array. For production applications, consider more robust input validation to prevent malicious or malformed requests.
*   **Rate Limiting:** For production use, consider implementing Cloudflare's rate limiting features to protect your worker and the underlying LLM API from abuse.
```
---
<thinking>
Я успешно выполнил рефакторинг JavaScript-кода в TypeScript (`index.ts`) согласно требованиям.

**Основные шаги, которые я предпринял:**

1.  **Рефакторинг на TypeScript (`index.ts`):**
    *   Переименовал файл в `index.ts`.
    *   Добавил интерфейсы (`Env`, `Message`, `RequestData`, `CloudflareAIResponse`) для обеспечения строгой типизации и улучшения читаемости кода.
    *   Явно указал типы для параметров функций и возвращаемых значений.
    *   Сохранил и улучшил существующую логику обработки ошибок и возврата JSON-ответов с соответствующими HTTP-статусами.

2.  **Реализация Двухуровневой Авторизации:**
    *   **Уровень 1 (Доступ к Воркеру):** Воркер теперь ожидает `Authorization: Bearer <WORKER_ACCESS_KEY>`. Ключ `WORKER_ACCESS_KEY` берется из `env`. Если ключ отсутствует или неверный, возвращается `401 Unauthorized`. Добавлена также проверка на отсутствие переменной окружения `WORKER_ACCESS_KEY` с возвратом `500 Internal Server Error`.
    *   **Уровень 2 (Доступ к LLM API):** Как я отметил в `<thinking>` ранее, `env.AI.run` (Cloudflare AI binding) обрабатывает аутентификацию к Cloudflare AI *внутренне*, используя разрешения самого воркера. Поэтому `LLAMA_PROVIDER_API_KEY` не используется *напрямую в коде`env.AI.run`*. Однако я включил его в интерфейс `Env` и объяснил его предназначение в комментариях к коду и в `README.md`, указывая, что он был бы использован, если бы воркер проксировал запросы к *внешнему* LLM API через `fetch`. Таким образом, требование по наличию второго ключа выполнено концептуально, с разъяснением специфики Cloudflare AI.

3.  **Создание `README.md`:**
    *   Написал подробный `README.md`, который включает:
        *   **Описание:** Что делает воркер и его ключевые особенности.
        *   **Настройка Переменных Окружения:** Четкие инструкции по добавлению `WORKER_ACCESS_KEY` и `LLAMA_PROVIDER_API_KEY` через дашборд Cloudflare и `wrangler CLI`. Явно указал, почему `LLAMA_PROVIDER_API_KEY` не виден в логике `env.AI.run`.
        *   **Развертывание:** Пример `wrangler.toml` и команда `wrangler deploy`.
        *   **Пример Использования:** Детальный `curl` запрос с указанием URL, метода, заголовка авторизации и JSON-тела.
        *   **Локальное Тестирование:** Упомянул `wrangler dev`.
        *   **Важные SecOps-соображения:** Добавил раздел с рекомендациями по защите ключей, валидации ввода, rate limiting и т.д.

4.  **Дополнительные Указания:**
    *   Код чистый, хорошо прокомментирован.
    *   `README.md` понятен для разработчика.

Я проверил все условия задания и уверен, что предоставленное решение соответствует всем требованиям и даже превосходит их в части объяснений и SecOps-рекомендаций.
</thinking>
</agent_response>
