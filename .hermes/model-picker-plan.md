# Interactive Model Picker for ProfileChat

Add an interactive model selection dialog to ProfileChat that works like the Hermes web UI Models page.

## Current State
- ProfileChat.tsx has `/model <name>` which only changes local state (cosmetic)
- modelInfo signal has hardcoded default `{ name: 'Qwen3.6-27B-FP8', context: 262111 }`
- fetchModelInfo() calls `/gp/v1/models` which returns only `hermes-agent` (the gateway, not the actual model)
- Backend has `GET /api/hermes/profiles/config/raw?name=xxx` that returns the profile's config.yaml with `model.default` field

## What to Build

### 1. Curated Model List
Add a curated list of agentic models grouped by provider (same as Hermes web UI). Use this structure:

```typescript
interface ModelEntry {
  id: string;       // e.g. 'anthropic/claude-sonnet-4'
  label: string;    // e.g. 'Claude Sonnet 4'
  provider: string; // e.g. 'Anthropic'
  context: number;  // context window
}

const AVAILABLE_MODELS: ModelEntry[] = [
  // Nous/Hermes
  { id: 'nous/hermes-3', label: 'Hermes 3', provider: 'Nous', context: 128000 },
  // DeepSeek
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', provider: 'DeepSeek', context: 10000000 },
  // OpenAI
  { id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI', context: 128000 },
  { id: 'openai/o3-mini', label: 'o3-mini', provider: 'OpenAI', context: 200000 },
  // Anthropic
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', provider: 'Anthropic', context: 200000 },
  { id: 'anthropic/claude-opus-4', label: 'Claude Opus 4', provider: 'Anthropic', context: 200000 },
  // Google
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', context: 1000000 },
  // Qwen (our local)
  { id: 'Qwen3.6-27B-FP8', label: 'Qwen 3.6 27B FP8 (Local)', provider: 'Local (SGLang)', context: 262111 },
  // Meta
  { id: 'meta/llama-4', label: 'Llama 4', provider: 'Meta', context: 128000 },
  // Mistral
  { id: 'mistral/mistral-large', label: 'Mistral Large', provider: 'Mistral', context: 128000 },
  // xAI
  { id: 'xai/grok-4', label: 'Grok 4', provider: 'xAI', context: 10000000 },
  // Cohere
  { id: 'cohere/command-r7', label: 'Command R7', provider: 'Cohere', context: 128000 },
];
```

### 2. State Signals
Add to ProfileChat component state (near line 120):
```typescript
const [showModelPicker, setShowModelPicker] = createSignal(false);
const [modelSearch, setModelSearch] = createSignal('');
const [savingModel, setSavingModel] = createSignal(false);
```

### 3. Fetch Actual Model from Config
Replace the hardcoded modelInfo default. On mount, fetch the profile's config via the backend API and parse the model section:

```typescript
async function loadConfig() {
  try {
    const res = await fetch(apiUrl(`/api/hermes/profiles/config/raw?name=${encodeURIComponent(props.profileName)}`));
    if (res.ok) {
      const data = await res.json();
      const yaml = data.yaml;
      // Parse model.default from YAML
      const modelMatch = yaml.match(/^model:\s*\n\s+default:\s+(.+)/m);
      if (modelMatch) {
        setModelInfo(prev => ({ ...prev, name: modelMatch[1].trim() }));
      }
      // Parse context_length
      const ctxMatch = yaml.match(/context_length:\s*(\d+)/);
      if (ctxMatch) {
        setModelInfo(prev => ({ ...prev, context: parseInt(ctxMatch[1]) }));
      }
    }
  } catch (e) {
    console.warn('[ProfileChat] Failed to load config', e);
  }
}
```

### 4. Save Model to Config
When user picks a model, update the profile's config.yaml:

```typescript
async function saveModel(modelId: string) {
  setSavingModel(true);
  try {
    // Read existing config
    const getRes = await fetch(apiUrl(`/api/hermes/profiles/config/raw?name=${encodeURIComponent(props.profileName)}`));
    let yaml = '';
    if (getRes.ok) {
      const data = await getRes.json();
      yaml = data.yaml;
    }
    
    // Update model.default in YAML
    if (yaml.includes('model:')) {
      if (yaml.includes('default:')) {
        yaml = yaml.replace(/^(\s+)default:\s.*$/m, `$1default: ${modelId}`);
      } else {
        yaml = yaml.replace(/^model:\s*$/m, `model:\n  default: ${modelId}`);
      }
    } else {
      yaml = `model:\n  default: ${modelId}\n` + yaml;
    }

    // Write back
    const putRes = await fetch(apiUrl(`/api/hermes/profiles/config/raw?name=${encodeURIComponent(props.profileName)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml_text: yaml }),
    });
    
    if (putRes.ok) {
      setModelInfo(prev => ({ ...prev, name: modelId }));
    }
  } catch (e) {
    console.warn('[ProfileChat] Failed to save model', e);
  }
  setSavingModel(false);
  setShowModelPicker(false);
}
```

### 5. Model Picker UI
Add a modal/overlay that shows when showModelPicker is true. It should:
- Show a search input to filter models
- Group models by provider (as sections)
- Show the current model highlighted
- Click on a model to select and save
- Show a "saving..." state while writing config
- Close on escape or clicking outside

Place the picker UI inside the ProfileChat component, near the bottom of the JSX return (before or after the existing chat UI elements).

### 6. Wire /model Command
Change the /model handler to open the picker:
```typescript
if (cmd === '/model' || cmd.startsWith('/model ')) {
  setShowModelPicker(true);
  return true;
}
```

### 7. Load Config on Mount
Call loadConfig() in the onMount handler, alongside fetchModelInfo().

## Boundaries
- DO NOT modify any files outside ProfileChat.tsx
- DO NOT modify backend code
- DO NOT change the existing modelInfo signal structure
- Keep the existing fetchModelInfo() as-is (it still sets the model name from /v1/models)

## Verification
- /model command opens the picker
- Picker shows current model highlighted
- Selecting a model writes to config.yaml
- Page reload shows the saved model
