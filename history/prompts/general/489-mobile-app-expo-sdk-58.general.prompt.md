---
id: 489
title: Mobile app moved to Expo SDK 58 for Expo Go
stage: general
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Expo Go on the phone is for SDK 58, the project was on SDK 57; make it open
labels: ["mobile", "expo", "upgrade"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - mobile/package.json
 - mobile/package-lock.json
 - mobile/app.json
tests:
 - Metro on the Wi-Fi address answers packager-status:running and reports sdkVersion 58.0.0
 - npm run typecheck: 3 errors in src/admin/ListScreen.tsx (FlatList list components no longer take null under React Native 0.88); not changed, the file holds someone else's unfinished work
---

## Prompt

error ye arha ha ke the installed version of expo go is for sdk 58 the project you uses uses sdk 57 to plz dekho yar isey bhai mere

## Response snapshot

- Upgraded the app with `npx expo install expo@^58.0.0` and `npx expo install --fix`: expo 58.0.20, React 19.3.0, React Native 0.88.0, the expo-* modules on 58. Removed `newArchEnabled` from app.json (SDK 58 no longer accepts it; the new architecture is always on). Expo Go on iPhone only ever runs the latest SDK, so moving the project was the way.
- A stuck SDK 57 server held port 8081 and the PC's Wi-Fi address had changed from 192.168.1.105 to 192.168.1.102: stopped it, started Expo on the new address, checked it reports SDK 58, made a new QR (exp://192.168.1.102:8081) and opened it on screen.

## Outcome

- ✅ Impact: the app opens in the current Expo Go.
- 🧪 Tests: server status and SDK version from the phone's address.
- 📁 Files: listed above.
- 🔁 Next prompts: the 3 ListScreen type errors for whoever owns that work; the pending push of c6bc08e + 4acc356.
- 🧠 Reflection: a Wi-Fi address can change between sessions; read it again before making a QR.
