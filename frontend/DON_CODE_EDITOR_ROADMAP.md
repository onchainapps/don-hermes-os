# Don Code Editor — Feature Roadmap

> "continue.dev but Don version, better version"
> Last updated: 2026-04-12

---

## ✅ Shipped

### Right-Click Context Menu
- Full custom context menu replacing Monaco's default
- Standard edit ops: Undo, Redo, Cut, Copy, Paste, Select All
- Code navigation: Go to Definition, Peek Definition, Find References
- Code editing: Format Document, Toggle Comment, Fold/Unfold
- File ops: Save (Ctrl+S), New File (Ctrl+N)

### ✦ Ask Don (AI Actions on Code)
- Right-click selected code → AI submenu
- Actions: Explain, Refactor, Find Bugs, Optimize, Write Tests, Add Docs
- Auto-sends to Don Assistant chat with file context

### Editor Context API
- `GET/POST /api/editor-context` — tracks active file, language, project
- Monaco dispatches `editor-context` custom event on tab switch
- Don Assistant can query what file/project the user is working in

### Resizable Panels
- FileTree ↔ GitPanel (vertical split)
- Editor ↔ Terminal+Chat (vertical split)
- Terminal ↔ EditorChat (horizontal split)
- All panels have min sizes to prevent collapse

### Project Dropdown
- Shows ALL `~/dev/` directories (not just git repos)
- Category folders (cardano, gamedev-research) included if they contain subdirs

---

## 🔜 Next Up (Priority Order)

### 1. Inline Code Completions (Copilot-style)
- Ghost text suggestions as you type
- Uses Hermes gateway for completions (single-line + multi-line)
- Debounced, non-blocking — doesn't slow down typing
- Accept with Tab, dismiss with Escape
- Trigger manually with Ctrl+Space
- **Implementation:** Register a Monaco `InlineCompletionItemProvider` that calls Hermes for suggestions

### 2. Diff Preview for Don's Suggestions
- When Don suggests code changes, show a diff view (not just text)
- Accept → apply to file. Reject → dismiss
- Side-by-side or inline diff in Monaco
- Keyboard shortcuts: Ctrl+Shift+Enter (accept), Escape (reject)
- **Implementation:** Don responds with ` ```diff ` blocks → parse → show in Monaco diff editor → accept/reject buttons

### 3. File-Aware Don Chat
- Don knows: current file, cursor position, selection, project root, git branch
- Automatic context injection (no need to paste code)
- "Ask about this file" button in editor header
- **Implementation:** EditorChat fetches `/api/editor-context` and prepends system context to each message

### 4. Multi-File Context
- Don can reference sibling files in the project
- "Add to context" button on files in FileTree
- Context panel showing which files Don can see
- **Implementation:** Collect file contents from `/api/files` and include as system message

### 5. Inline Edit (Highlight → Rewrite)
- Select code → "Edit with Don" → Don rewrites in-place
- Show replacement as ghost overlay → accept/reject
- Diff view for complex rewrites
- **Implementation:** Monaco content widget showing proposed replacement with accept/reject controls

### 6. Terminal Integration
- Don can run commands and show output in chat
- "Run this" button on code blocks in Don's responses
- Terminal output feeds back to Don for debugging
- **Implementation:** EditorChat can POST to terminal WebSocket, capture output

---

## 🧪 Future Ideas

### Code Actions (Lightbulb Menu)
- Monaco's built-in lightbulb (Ctrl+.) shows Don-powered actions
- "Don: Explain", "Don: Refactor", "Don: Add Tests"
- **Implementation:** Register a `CodeActionProvider` in Monaco

### Smart Rename
- Rename symbol → Don suggests better names based on usage
- Multi-file rename with preview

### Error Lens + Don Fix
- Show errors inline (like VS Code Error Lens)
- Click error → "Ask Don to fix" → auto-suggest fix
- **Implementation:** Monaco marker API + diagnostics → Don action

### Git Integration
- "Explain this commit" on git log entries
- "Write commit message" based on staged changes
- Diff viewer for unstaged changes
- **Implementation:** GitPanel extends to show commit history, wired to Don chat

### Project-Wide Search + Don
- Search results → "Ask Don about these matches"
- Refactor across files with Don
- **Implementation:** Wire Monaco's find widget to Don

### Custom Themes
- User-selectable editor themes (cyberpunk, minimal, etc.)
- Theme editor (adjust colors live)
- **Implementation:** Monaco theme API + localStorage persistence

### Snippet Library
- Save code snippets from editor
- Don suggests snippets based on context
- Shared snippet library per project
- **Implementation:** SQLite-backed snippet store, Monaco snippet provider

---

## Architecture Notes

### Data Flow
```
User selects code → Right-click → "Ask Don"
  → MonacoEditor dispatches event
  → App.tsx sets donPrompt signal
  → EditorChat picks up prompt → sends to /api/chat
  → Hermes gateway responds → streams to chat
```

### Context Injection (Future)
```
EditorChat.sendMessage()
  → GET /api/editor-context (active file, project, language)
  → GET /api/files?path=<current-file> (full file content)
  → Prepend as system message:
     "User is editing: {filePath} in project {projectRoot}
      Current file content:
      ```{language}
      {content}
      ```"
  → Send to /api/chat with enriched context
```

### Completion Provider (Future)
```
Monaco registers InlineCompletionProvider
  → On trigger (debounced 300ms):
     GET /api/editor-context
     POST /api/completions {
       prefix: text before cursor,
       suffix: text after cursor,
       language: current language,
       filePath: current file
     }
  → Hermes returns suggestion
  → Monaco shows ghost text
  → Tab to accept, Esc to dismiss
```
