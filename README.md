# AI PDF Reader

A lightweight, browser-based application that allows you to view PDF documents and interact with them using an AI assistant. Built with Vanilla JavaScript and PDF.js, it requires no backend server or complex build process—just open it in your browser.

## Overview

AI PDF Reader combines a full-featured PDF viewer with a context-aware chat interface. When you ask a question, the app extracts text from the PDF (either the specific page you're viewing or the entire document) and uses it as context for the AI model. This allows for precise, grounded answers to questions about your documents.

## Features & Implementation

1. **In-Browser PDF Viewing**  
   *Implementation:* `pdfjsLib` renders the PDF view in `index.html` with pagination and zoom controls.

2. **Text Extraction + Caching**  
   *Implementation:* `getPageText` in `app.js` pulls text content via `page.getTextContent()` and stores it in the `currentPdfText` map so repeated questions/ searches stay fast. `getFullPdfText` reuses the cache to stitch multi-page context.

3. **Context-Aware Chat (Page & Full Document Modes)**  
   *Implementation:* `handleSendMessage` builds the system/user prompts based on either the current page or the requested range, then streams LLM responses back into the chat UI. The context toggle, page-count input, and the `contextModeCheckbox` wiring live in `index.html` + `app.js`.

4. **Bring-Your-Own-Key API Settings**  
   *Implementation:* The settings modal stores `apiKey`, `apiUrl`, and `modelName` in `localStorage`, wiring the inputs to the `settings` object so the app works with OpenAI, compatible APIs, or local proxies.

5. **Streaming Responses (API Mode)**  
   *Implementation:* A `fetch` call to the OpenAI-compatible `/chat/completions` endpoint is read via `ReadableStream.getReader()`. Each SSE `data:` chunk updates the most recent AI message, rendered with `marked` for lightweight Markdown formatting.

6. **Local Model Execution (WebGPU Mode)**  
   *Implementation:* Selecting “Local Device (WebGPU)” swaps the UI to local LLM use (ONNX models), spawns a Blob-based worker (`initWorker`), and loads the inlined Transformers.js bundle (`public/transformers_lib.js`). The worker code manages tokenizer/model caching, WebGPU/CPU fallback, streaming via `TextStreamer`, and progress updates.

7. **Privacy-Focused Storage**  
   *Implementation:* PDFs stay entirely in-browser; only extracted text and the user’s prompt are sent to the API endpoint they configure. API keys remain in `localStorage` and are never transmitted elsewhere.

> **Security Note:** Your API Key is stored in your browser's **Local Storage** (`localStorage`). It remains on your device and is only sent directly to the AI provider you configure.


## How it Works

The application communicates with the AI model by sending a structured prompt that includes your question and the relevant text extracted from the PDF.

### Prompts
1.  **System Prompt**: Defines the AI's role.
    *   *Single Page*: "You are a helpful AI PDF assistant. You have access to the content of PAGE {pageNum} of the document provided below..."
    *   *Full Document*: "You are a helpful AI PDF assistant. You have access to the full content of the document provided below..."
2.  **User Message**: Contains the context and your query.
    ```text
    Document Content:
    {extracted_text_from_pdf}

    Question: {your_question}
    ```

## Technology Stack

-   **Frontend**: HTML5, CSS3, Vanilla JavaScript
-   **PDF Rendering**: [PDF.js](https://mozilla.github.io/pdf.js/)
-   **Markdown Rendering**: [Marked.js](https://marked.js.org/)
-   **No Build Step**: No Webpack, Vite, or Node.js required for the core app.

## Getting Started

### Prerequisites
-   A modern web browser (Chrome, Firefox, Safari, Edge).
-   An API Key from an OpenAI-compatible provider (e.g., OpenAI, DeepSeek, or a local server).

### Installation
1.  Clone or download this repository.
2.  That's it! There are no dependencies to install.

### Usage
1.  **Open the App**: Double-click `index.html` to open it in your web browser.
2.  **Configure API**:
    -   Click the **Settings (⚙️)** icon in the chat header.
    -   Enter your **API Key**.
    -   (Optional) Update the Base URL (default: `https://api.openai.com/v1`) or Model Name (default: `gpt-4o-mini`).
    -   Click **Save**.
3.  **Upload a PDF**: Click the **Upload PDF** button and select a file.
4.  **Start Chatting**: Navigate to a page and ask a question!

## Customization

You can easily modify the `style.css` to change the look and feel, or update `app.js` to add support for different API formats if needed.
