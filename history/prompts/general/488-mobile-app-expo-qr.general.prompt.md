---
id: 488
title: Mobile app QR code to open on a phone
stage: general
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Start the mobile app's Expo server and give a QR code to scan on a phone
labels: ["mobile", "expo", "qr"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none in the repo (scratchpad expo.log, expo-qr.png)
tests:
 - Metro answers on the Wi-Fi address: http://192.168.1.105:8081/status = packager-status:running
---

## Prompt

iski mobile app ka wo do scanner mobile pe scan krni ha jaldi

## Response snapshot

- Started Expo (SDK 57) in mobile/ on the PC's Wi-Fi address (REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.105, --lan, port 8081); the 172.31.x addresses are virtual adapters a phone cannot reach.
- Made a QR code for exp://192.168.1.105:8081 and opened it on the PC's screen; told the owner: Expo Go on the phone, same Wi-Fi, scan (Android in Expo Go, iPhone with the Camera), or type the address; if it does not connect, allow Node.js through the Windows firewall or switch to a tunnel.
- The app talks to the live backend (app.json extra.apiUrl), so sign-in is a real account.

## Outcome

- ✅ Impact: the owner can open the mobile app on a phone.
- 🧪 Tests: Metro status check only.
- 📁 Files: none in the repo.
- 🔁 Next prompts: tunnel if the phone is on another network; the pending push of c6bc08e + 4acc356.
- 🧠 Reflection: Expo prints no QR without a terminal; a QR picture opened on screen is what a person can scan.
