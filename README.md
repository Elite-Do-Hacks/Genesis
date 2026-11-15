# 🤖 Genesis — Smart Minecraft AI Companion

> **Not a command bot. A teammate that listens.**  
> 🌐 **Official Website & Download:** [Genesismc.netlify.app](https://netlify.app)

**Genesis** is an intelligent, self-sufficient Minecraft AI companion built with **Mineflayer** and **Google Gemini** by **Shubh Rastogi**. Instead of memorizing rigid syntax like `!craft diamond_sword 2`, you can talk to Genesis naturally in chat—and its AI brain translates casual phrasing, slang, and typos into real-time in-game actions.

---

## ✨ Key Features

* 🧠 **Gemini Intent Brain:** Parses natural player chat into strict JSON schemas to execute 7 core AI actions (`craft_item`, `smelt_item`, `give_item`, `follow`, `attack`, `stop`, and conversational replies).
* 🔨 **Smart Crafting & Smelting:** Automatically searches for nearby crafting tables or furnaces—and if none exist, crafts and places them from inventory materials before completing your request.
* ⚔️ **Adaptive Combat & Self-Healing:** Snipes with a bow beyond 5 blocks, switches to the strongest melee weapon up close, and retreats to eat high-tier food (prioritizing Enchanted Golden Apples) when health drops below 6 hearts.
* 🛡️ **Auto-Gear & Totem Priority:** Automatically equips the highest-tier armor across all slots and prioritizes a **Totem of Undying** in the off-hand over shields.
* 🧭 **Pathfinding & Item Delivery:** Navigates terrain via `mineflayer-pathfinder` to follow players at a two-block distance or fuzzy-match and toss requested items.
* 🌐 **Any-Version Auto-Detect:** Automatically detects the Minecraft server version upon connecting with zero manual configuration.
* 💻 **Live Host Terminal Control:** Server admins can type directly into the Node.js host console to relay messages straight into in-game chat.

---

## 💬 Example Interactions

| What You Say in Chat | Intent Triggered | What Genesis Does |
| :--- | :--- | :--- |
| *"Yo Genesis, can u make me 2 diamond swords?"* | `craft_item` | Crafts 2 diamond swords (builds & places a table if needed). |
| *"Smelt 8 iron ore for me."* | `smelt_item` | Places a furnace, adds fuel, smelts the ore, and collects results. |
| *"Bring me 16 torches pls."* | `give_item` | Finds torches in inventory, walks over, and tosses them to you. |
| *"Follow me, we are going to the Nether."* | `follow` | Tracks you through terrain until told to stop. |
| *"Take down Zombie_King."* | `attack` | Engages with bow at range and sword up close. |
| *"Ok, that's enough. Chill."* | `stop` | Disengages from combat/tasks and re-gears. |

---

## 🛠️ Tech Stack

* **Bot Engine & World API:** [Mineflayer](https://github.com)
* **AI Intent Parsing:** Google Gemini (Structured JSON Output)
* **Navigation & Movement:** `mineflayer-pathfinder`
* **Combat & Survival:** `@nxg-org/custom-pvp` & `mineflayer-auto-eat`
* **Runtime & Console Control:** Node.js (`readline`)

---

## 🔗 Links & Credits

* **Website & Beta Release:** [https://netlify.app](https://netlify.app)
* **Designed & Built by:** Shubh Rastogi (2026)

*Disclaimer: Genesis is an independent project and is not an official Minecraft product, nor is it approved by or associated with Mojang or Microsoft.*
