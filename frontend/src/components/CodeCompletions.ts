import * as monaco from 'monaco-editor';
import { apiUrl } from '../lib/api-base';

interface CompletionRequest {
  prefix: string;
  suffix: string;
  language: string;
  filePath?: string;
}

export function registerCodeCompletions(editor: monaco.editor.IStandaloneCodeEditor) {
  let timeout: number | null = null;
  let currentRequest: AbortController | null = null;

  const provider = monaco.languages.registerInlineCompletionsProvider('*', {
    provideInlineCompletions: async (model, position, context, token) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      return new Promise<monaco.languages.InlineCompletions | null>((resolve) => {
        timeout = setTimeout(async () => {
          if (token.isCancellationRequested) {
            resolve(null);
            return;
          }

          // Cancel previous request
          if (currentRequest) {
            currentRequest.abort();
          }

          currentRequest = new AbortController();

          try {
            const modelValue = model.getValue();
            const offset = model.getOffsetAt(position);

            let prefix = modelValue.substring(0, offset);
            let suffix = modelValue.substring(offset);

            // Limit size to keep requests small
            const MAX_CHARS = 2000;
            if (prefix.length > MAX_CHARS) {
              prefix = prefix.substring(prefix.length - MAX_CHARS);
            }
            if (suffix.length > MAX_CHARS) {
              suffix = suffix.substring(0, MAX_CHARS);
            }

            const language = model.getLanguageId();
            const filePath = (model as any).uri?.fsPath || model.uri?.toString() || '';

            const response = await fetch(apiUrl('/api/completions'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prefix,
                suffix,
                language,
                filePath,
              } as CompletionRequest),
              signal: currentRequest.signal,
            });

            if (!response.ok || token.isCancellationRequested) {
              resolve({ items: [] });
              return;
            }

            const data = await response.json();
            const completionText = data.completion || data.text || '';

            if (!completionText) {
              resolve({ items: [] });
              return;
            }

            const item: monaco.languages.InlineCompletion = {
              insertText: completionText,
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
              ),
            };

            resolve({
              items: [item],
            });
          } catch (err) {
            // Graceful error handling - return empty
            if (!token.isCancellationRequested) {
              console.debug('Completion request failed:', err);
            }
            resolve({ items: [] });
          } finally {
            currentRequest = null;
          }
        }, 400);
      });
    },

    handleItemDidShow: () => {
      // Optional: can be used for telemetry
    },

    disposeInlineCompletions: () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      if (currentRequest) {
        currentRequest.abort();
        currentRequest = null;
      }
    },
  });

  // Return disposer
  return {
    dispose: () => {
      provider.dispose();
      if (timeout) clearTimeout(timeout);
      if (currentRequest) currentRequest.abort();
    },
  };
}
