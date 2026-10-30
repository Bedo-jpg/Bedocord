# Bedocord Media Feedback Design

## Intent

Make solo testing and daily voice/chat actions understandable. A sender must see their own stream at a small, intentionally reduced preview resolution. Common actions should have short, optional sounds. A solo message must not imply a send failure.

## Scope

- Keep group creation and invitation permissions as they are; the user deferred multi-group work.
- Show a 320×180, muted local canvas preview while sharing; render at about 8 frames per second without capturing the screen twice. The user can hide and restore it without stopping the stream.
- Play brief synthesized cues only after successful message, room, microphone, screen and leave actions. Sounds start enabled and can be disabled in Settings. Persist this choice with existing appearance preferences and send cues to the selected speaker when one is chosen.
- For own messages, display local save and backup status in words. One-person groups show local save, not an hourglass. Keep actual peer backup semantics unchanged.

## Approach

Use the existing MediaController stream as the preview source. Web Audio generates cues locally, avoiding bundled media files. Keep database receipts as they are and change only the display of their status. This is preferable to creating a second screen capture or treating a message as delivered to another PC before an acknowledgement arrives.

## Constraints

Windows Electron app; Radmin VPN remains private. Never play captured screen/system audio through the preview. Existing preference files lack the new sound flag and must default to enabled.
