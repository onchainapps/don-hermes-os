# Plan: Per-Profile Chat Tabs

## Goal
Allow users to open a dedicated chat interface for any Hermes profile (e.g., don-researcher, don-mirror-trader) directly from the ProfileManager.

## Requirements
- Reuse existing chat infrastructure (FloatingChat, GatewayClient, chatClient, conversations store).
- Support passing `profile` to the Hermes gateway run request.
- UI should feel like opening a "chat tab" for that profile.
- Keep it simple and non-breaking.

## High-Level Approach
1. Add a "Chat" button to each profile row in ProfileManager.tsx.
2. On click, open a chat modal or side panel that uses the existing chat logic but targets the specific profile.
3. Update the message sending path to include `profile` in the payload when a profile is selected.
4. Use per-conversation isolation so multiple profile chats can run independently.

## Detailed Steps

### Step 1: Backend (already supports it)
- The `/v1/runs` call in server.ts already forwards `profile` from the incoming message.
- No changes needed.

### Step 2: Frontend - ProfileManager
- Import necessary chat hooks/stores if needed.
- Add `handleChat(profileName)` function.
- Button: `<button onClick={() => handleChat(profile.name)}>Chat</button>`
- `handleChat` can:
  - Set a `selectedProfileForChat` signal.
  - Open a chat modal using a reusable chat component.

### Step 3: Chat Integration
- Create or reuse a `ProfileChatModal` or extend FloatingChat to accept a `profile` prop.
- When sending a chat message, include `{ ..., profile: selectedProfile }` in the parsed message.
- Use the existing `createHermesChat` or GatewayClient pattern for reactivity.

### Step 4: UI Polish
- Show which profile the chat is for in the chat header.
- Allow multiple chats (one per profile) using the tab/conversation system already in FloatingChat.

## Risks / Gotchas
- Shared GatewayClient may need to support per-profile connections or headers.
- State management for active profile in chat.
- Make sure stopping/starting profiles doesn't break open chats.

## Execution Order
1. Update ProfileManager with Chat button + basic handler.
2. Add profile support to the chat message payload.
3. Implement a simple modal chat for the profile.
4. Test with don-researcher and don-mirror-trader.
5. Polish and document.

This keeps us using what we already have instead of reinventing chat.