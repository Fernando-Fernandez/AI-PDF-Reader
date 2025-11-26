# AI PDF Reader

A lightweight, browser-based application that allows you to view PDF documents and interact with them using an AI assistant. Built with Vanilla JavaScript and PDF.js, it requires no backend server or complex build process—just open it in your browser.

## Overview

AI PDF Reader combines a full-featured PDF viewer with a context-aware chat interface. When you ask a question, the app extracts text from the PDF (either the specific page you're viewing or the entire document) and uses it as context for the AI model. This allows for precise, grounded answers to questions about your documents.

## Features

-   **In-Browser PDF Viewing**: Render PDFs directly in the browser using PDF.js.
-   **Context-Aware Chat**:
    -   **Page Mode**: Ask questions about the specific page you are currently viewing.
    -   **Full Document Mode**: (Beta) Send the entire document text to the AI for broader queries.
-   **Streaming Responses**: specific AI responses are streamed in real-time for a responsive experience.
-   **Bring Your Own Key**: Works with any OpenAI-compatible API (OpenAI, local LLMs via LM Studio/Ollama, etc.).
-   **Privacy-Focused**: The PDF is processed locally in your browser. Only the text content and your questions are sent to the AI API you configure.
    -   **Security Note**: Your API Key is stored in your browser's **Local Storage** (`localStorage`). It remains on your device and is never transmitted to any third-party server other than the AI provider you specify.


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
