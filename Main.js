import { createRequire } from 'module';
import { GoogleGenAI, Type } from '@google/genai';
import * as nbt from 'prismarine-nbt';
import fs from 'fs/promises';
import readline from 'readline';

// Bring back 'require' for ES Modules
const require = createRequire(import.meta.url);

const mineflayer = require('mineflayer');
const pathfinderPkg = require('mineflayer-pathfinder');
const pvpPkg = require('@nxg-org/mineflayer-custom-pvp');
const autoeatPkg = require('mineflayer-auto-eat');

// ==========================================
// 1. SAFE PLUGIN LOADER & SCHEMATIC HELPERS
// ==========================================
function safeLoadPlugin(bot, pkg) {
    if (!pkg) return;
    if (typeof pkg === 'function') { bot.loadPlugin(pkg); return; }
    if (typeof pkg.plugin === 'function') { bot.loadPlugin(pkg.plugin); return; }
    if (typeof pkg.default === 'function') { bot.loadPlugin(pkg.default); return; }
    if (pkg.default && typeof pkg.default.plugin === 'function') { bot.loadPlugin(pkg.default.plugin); return; }
    
    for (const key in pkg) {
        if (typeof pkg[key] === 'function') {
            bot.loadPlugin(pkg[key]);
            return;
        }
    }
}

function getProp(obj, name) {
    if (!obj) return null;
    for (let k of Object.keys(obj)) {
        if (k.toLowerCase() === name.toLowerCase()) return obj[k];
    }
    return null;
}

function isDelayedBlock(blockName) {
    if (!blockName) return false;
    const name = blockName.toLowerCase().replace('minecraft:', '');

    const allButtons = [
        'oak_button', 'spruce_button', 'birch_button', 'jungle_button',
        'acacia_button', 'dark_oak_button', 'mangrove_button', 'cherry_button',
        'bamboo_button', 'crimson_button', 'warped_button', 'stone_button',
        'polished_blackstone_button'
    ];
    if (allButtons.includes(name) || name.endsWith('_button')) return true;

    const allPressurePlates = [
        'oak_pressure_plate', 'spruce_pressure_plate', 'birch_pressure_plate',
        'jungle_pressure_plate', 'acacia_pressure_plate', 'dark_oak_pressure_plate',
        'mangrove_pressure_plate', 'cherry_pressure_plate', 'bamboo_pressure_plate',
        'crimson_pressure_plate', 'warped_pressure_plate', 'stone_pressure_plate',
        'polished_blackstone_pressure_plate', 'light_weighted_pressure_plate',
        'heavy_weighted_pressure_plate'
    ];
    if (allPressurePlates.includes(name) || name.endsWith('_pressure_plate')) return true;
    if (name.endsWith('_fence') || name.endsWith('_fence_gate') || name.endsWith('_wall')) return true;
    if (name.endsWith('_door') || name.endsWith('_trapdoor')) return true;

    const redstoneMechanisms = [
        'redstone_dust', 'redstone_block', 'repeater', 'comparator', 'lever',
        'redstone_torch', 'redstone_wall_torch', 'daylight_detector',
        'tripwire', 'tripwire_hook', 'lightning_rod',
        'sculk_sensor', 'calibrated_sculk_sensor', 'piston',
        'piston_head', 'dropper', 'hopper',
        'lectern', 'bell'
    ];
    if (redstoneMechanisms.some(keyword => name.includes(keyword))) return true;
    if (name.endsWith('_rail') || name === 'rail') return true;
    if (name.includes('torch') || name.includes('lantern') || name.includes('candle')) return true;

    const fragileDecorations = [
        'ladder', 'vine', 'cave_vines', 'twisting_vines', 'weeping_vines',
        'sign', 'hanging_sign', 'banner', 'bed', 'white_carpet', 'flower_pot',
        'amethyst_cluster', 'pointed_dripstone', 'lily_pad', 'frogspawn',
        'scaffolding', 'cake', 'string' , 'anvil' ,'red_carpet' ,'nether_portal', 'water'
    ];
    if (fragileDecorations.some(keyword => name.includes(keyword))) return true;

    const floraKeywords = [
        'sapling', 'flower', 'mushroom', 'fungus', 'roots', 'sprouts',
        'coral', 'coral_fan', 'coral_wall_fan', 'kelp', 'seagrass',
        'sea_pickle', 'sugar_cane', 'cactus', 'sweet_berry_bush', 'bamboo'
    ];
    return floraKeywords.some(keyword => name.includes(keyword));
}

const Movements = pathfinderPkg.Movements || pathfinderPkg.default?.Movements;
const goals = pathfinderPkg.goals || pathfinderPkg.default?.goals;

// ==========================================
// 2. TERMINAL SETUP & CONFIGURATION PROMPTS
// ==========================================
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

async function startBot() {
    console.log("====================================================");
    console.log("        Genesis: Autonomous Assistant Setup        ");
    console.log("====================================================");
    console.log("By: Shubh Rastogi");
    const host = (await askQuestion("Enter server IP (default: localhost): ")).trim() || 'localhost';
    const portInput = (await askQuestion("Enter server port (default: 25565): ")).trim() || '25565';
    const username = (await askQuestion("Enter bot username (default: Genesis): ")).trim() || 'Genesis';
    let versionInput = (await askQuestion("Enter Minecraft version (e.g., 1.21.1 / press Enter for auto-detect): ")).trim();
    const speedInput = (await askQuestion("Enter building speed in ms (default: 25): ")).trim();
    const apiKey = (await askQuestion("Enter your Gemini API key: ")).trim();
    const version = versionInput === '' ? false : versionInput;
    const buildingSpeed = parseInt(speedInput) || 40;
    const port = parseInt(portInput);

    console.log("\n[INFO] Connecting to server...");

    const ai = new GoogleGenAI({ apiKey: apiKey });

    const bot = mineflayer.createBot({
        host: host,
        port: port,
        version: version,
        username: username,
        hideErrors: true
    });

    safeLoadPlugin(bot, pathfinderPkg);
    safeLoadPlugin(bot, pvpPkg);
    safeLoadPlugin(bot, autoeatPkg);

    let mcData;
    bot.setMaxListeners(100);
    bot.once('spawn', () => installEnchantFix());
    let defaultMove;
    let isBusyWithCommand = false;
    let isHealing = false;
    let commandSerial = 0;

    rl.on('line', (input) => {
        if (input.trim() !== '') {
            bot.chat(input);
            console.log(`[Terminal -> Server]: ${input}`);
        }
    });

    // ==========================================
    // 3. PERSONA DATABASE
    // ==========================================
    const PERSONA_QUOTES = [
        "It is a beautiful day to build and explore.",
        "If you need an escort or assistance in combat, I am at your service.",
        "I am ensuring my inventory is organized and ready for our next task.",
        "Remember to stay well-fed and armored while exploring!",
        "I am happy to assist you in making this world incredible."
    ];

    // ==========================================
    // 4. SERVER EVENTS & COMBAT
    // ==========================================
    bot.once('spawn', () => {
        mcData = require('minecraft-data')(bot.version);
        defaultMove = new Movements(bot, mcData);
        defaultMove.allowSprinting = true;
        defaultMove.allowParkour = true;
        defaultMove.allowFreeMotion = true;
        bot.pathfinder.setMovements(defaultMove);
        if (bot.autoEat) {
            bot.autoEat.options = { priority: 'foodPoints', startAt: 15, bannedFood: ['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish'] };
        }
        
        console.log(`\n===========================================`);
        console.log(`[SUCCESS] ${bot.username} has spawned in!`);
        console.log(`[INFO] TERMINAL CONTROL IS ACTIVE.`);
        console.log(`===========================================\n`);
        
        resetBotState();
        startRandomChatter();
    });

    function stopPVP() {
        if (bot.swordpvp) bot.swordpvp.stop();
        if (bot.bowpvp) bot.bowpvp.stop();
    }

    const BOW_RANGE_MIN = 8;
    const SWORD_RANGE_MAX = 5;
    let combatMode = null;

    function hasRangedKit() {
        const items = bot.inventory.items();
        return !!bot.bowpvp && items.some(i => i.name === 'bow') && items.some(i => i.name === 'arrow');
    }

    function desiredCombatMode(target) {
        if (!hasRangedKit()) return 'sword';
        const distance = bot.entity.position.distanceTo(target.position);
        if (distance > BOW_RANGE_MIN) return 'bow';
        if (distance < SWORD_RANGE_MAX) return 'sword';
        return combatMode || 'sword';
    }

    async function executeAdvancedAttack(target) {
        if (!target || isHealing) return;

        const mode = desiredCombatMode(target);
        combatMode = mode;

        if (mode === 'bow') {
            const bow = bot.inventory.items().find(i => i.name === 'bow');
            await bot.equip(bow, 'hand');
            bot.bowpvp.attack(target);
        } else {
            await equipBestWeapon();
            if (bot.swordpvp) bot.swordpvp.attack(target);
        }
    }

    // ==========================================
    // 4b. THREAT DETECTION
    // ==========================================
    const SWING_WINDOW_MS = 1000;
    const WAIT_FOR_PACKETS_MS = 120;

    const HOSTILE_MOBS = new Set([
        'zombie', 'husk', 'drowned', 'zombie_villager', 'skeleton', 'stray', 'bogged', 'wither_skeleton',
        'creeper', 'spider', 'cave_spider', 'slime', 'magma_cube', 'witch', 'pillager', 'vindicator',
        'evoker', 'ravager', 'vex', 'phantom', 'blaze', 'ghast', 'guardian', 'elder_guardian',
        'silverfish', 'endermite', 'hoglin', 'zoglin', 'piglin_brute', 'shulker', 'warden', 'breeze',
        'creaking', 'wither', 'ender_dragon'
    ]);
    const NON_MOB_TYPES = new Set(['player', 'object', 'projectile', 'orb', 'global', 'other', 'UNKNOWN']);
    const PROJECTILE_NAMES = new Set([
        'arrow', 'spectral_arrow', 'trident', 'fireball', 'small_fireball', 'dragon_fireball',
        'wither_skull', 'shulker_bullet', 'llama_spit'
    ]);

    let currentThreat = null;
    let threatMode = null;
    let lastThreatHit = 0;
    let hurtPending = false;
    let lastHealAttempt = 0;
    let lastMobAnnounce = 0;
    const lastSwing = new Map();
    const recentProjectiles = [];
    const warnedAt = new Map();
    const waitMs = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function isPlayerEntity(e) {
        return !!e && e.type === 'player' && !!e.username && e.username !== bot.username;
    }

    function isMobEntity(e) {
        if (!e || e === bot.entity || !e.position) return false;
        if (HOSTILE_MOBS.has((e.name || '').toLowerCase())) return true;
        return !!e.type && !NON_MOB_TYPES.has(e.type) && !!e.name;
    }

    function isHostileMob(e) {
        return isMobEntity(e) && (e.type === 'hostile' || HOSTILE_MOBS.has((e.name || '').toLowerCase()));
    }

    function prettyEntityName(e) {
        return String(e.displayName || e.name || 'creature').replace(/_/g, ' ').toLowerCase();
    }

    function threatIsValid(t) {
        return !!t && !!bot.entities[t.id] && t.isValid !== false && !!t.position;
    }

    function isFacing(from, toPos, maxDeg) {
        if (typeof from.yaw !== 'number') return true;
        const dx = toPos.x - from.position.x;
        const dz = toPos.z - from.position.z;
        const wanted = Math.atan2(-dx, -dz);
        let diff = from.yaw - wanted;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return Math.abs(diff) <= (maxDeg * Math.PI) / 180;
    }

    bot.on('entitySwingArm', (entity) => { if (entity) lastSwing.set(entity.id, Date.now()); });

    bot.on('entitySpawn', (entity) => {
        if (!entity || !entity.position || !PROJECTILE_NAMES.has((entity.name || '').toLowerCase())) return;
        if (!bot.entity) return;

        let shooter = null;
        let best = 3.5;
        for (const e of Object.values(bot.entities)) {
            if (!e || e === entity || !e.position) continue;
            if (e !== bot.entity && !isPlayerEntity(e) && !isMobEntity(e)) continue;
            const d = e.position.distanceTo(entity.position);
            if (d < best) { best = d; shooter = e; }
        }
        if (!shooter || shooter === bot.entity) return;

        recentProjectiles.push({
            time: Date.now(),
            shooter,
            facedBot: isFacing(shooter, bot.entity.position, 35)
        });
        while (recentProjectiles.length > 0 && Date.now() - recentProjectiles[0].time > 5000) recentProjectiles.shift();
    });

    function detectAttacker(source) {
        const me = bot.entity;
        const myPos = me.position;
        const now = Date.now();

        if (source && source.position && typeof source.id === 'number' && source.id !== me.id) {
            if (isPlayerEntity(source)) return { entity: source, kind: 'player', score: 1000 };
            if (isMobEntity(source)) return { entity: source, kind: 'mob', score: 1000 };
        }

        const candidates = [];

        for (const e of Object.values(bot.entities)) {
            if (!e || e === me || !e.position) continue;
            const dist = e.position.distanceTo(myPos);
            const swung = now - (lastSwing.get(e.id) || 0) <= SWING_WINDOW_MS;

            if (isPlayerEntity(e)) {
                if (swung && dist <= 6 && isFacing(e, myPos, 55)) {
                    candidates.push({ entity: e, kind: 'player', score: 80 - dist * 6 });
                }
            } else if (isMobEntity(e)) {
                if (swung && dist <= 5.5) {
                    candidates.push({ entity: e, kind: 'mob', score: 100 - dist * 6 });
                } else if (isHostileMob(e) && dist <= 3 && isFacing(e, myPos, 80)) {
                    candidates.push({ entity: e, kind: 'mob', score: 50 - dist * 6 });
                }
            }
        }

        for (const p of recentProjectiles) {
            if (now - p.time > 3000 || !p.facedBot) continue;
            if (!threatIsValid(p.shooter)) continue;
            candidates.push({
                entity: p.shooter,
                kind: isPlayerEntity(p.shooter) ? 'player' : 'mob',
                score: 70
            });
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0];
    }

    async function engageThreat(target, mode) {
        currentThreat = target;
        threatMode = mode;
        isBusyWithCommand = true;
        bot.pathfinder.setGoal(null);
        chaseOwned = false;
        await executeAdvancedAttack(target);
    }

    function endCombat(message) {
        stopPVP();
        currentThreat = null;
        threatMode = null;
        combatMode = null;
        chaseOwned = false;
        if (message) bot.chat(message);
        resetBotState().then(resumeFollowIfNeeded);
    }

    function announceThreat(entity, kind) {
        const now = Date.now();
        if (kind === 'player') {
            if (now - (warnedAt.get(entity.username) || 0) < 15000) return;
            warnedAt.set(entity.username, now);
            const politeWarnings = [
                `I am programmed to defend myself, ${entity.username}. Please reconsider!`,
                `I do not wish to fight you, ${entity.username}, but I will protect myself.`
            ];
            bot.chat(politeWarnings[Math.floor(Math.random() * politeWarnings.length)]);
        } else if (now - lastMobAnnounce > 15000) {
            lastMobAnnounce = now;
            const name = prettyEntityName(entity);
            bot.chat(`${/^[aeiou]/.test(name) ? 'An' : 'A'} ${name} is attacking me. I will defend myself.`);
        }
    }

    async function onBotHurt(source) {
        if (hurtPending || isHealing) return;
        hurtPending = true;
        await waitMs(WAIT_FOR_PACKETS_MS);
        hurtPending = false;
        if (isHealing || !bot.entity) return;

        const attacker = detectAttacker(source);
        if (!attacker) return;

        const { entity, kind } = attacker;
        lastThreatHit = Date.now();
        if (currentThreat && currentThreat.id === entity.id) return;

        if (currentThreat && threatIsValid(currentThreat)) {
            const currentDist = currentThreat.position.distanceTo(bot.entity.position);
            const newDist = entity.position.distanceTo(bot.entity.position);
            if (currentDist - newDist <= 2) return;
        }

        announceThreat(entity, kind);
        await engageThreat(entity, 'defense');
    }

    bot.on('entityHurt', (entity, source) => {
        if (entity === bot.entity) onBotHurt(source).catch(() => {});
    });

    bot.on('entityDead', (entity) => {
        if (entity) lastSwing.delete(entity.id);
        if (currentThreat && entity && entity.id === currentThreat.id) endCombat();
    });

    let threatLostSince = 0;
    let switchingMode = false;

    setInterval(async () => {
        if (!currentThreat || isHealing || !bot.entity) return;
        const t = currentThreat;

        if (!threatIsValid(t)) {
            if (!threatLostSince) threatLostSince = Date.now();
            if (Date.now() - threatLostSince > 5000) { threatLostSince = 0; endCombat(); }
            return;
        }
        threatLostSince = 0;

        updateChase(t);

        if (switchingMode) return;
        const wanted = desiredCombatMode(t);
        if (wanted !== combatMode) {
            switchingMode = true;
            try {
                stopPVP();
                bot.pathfinder.setGoal(null);
                chaseOwned = false;
                await executeAdvancedAttack(t);
            } catch (e) {} finally {
                switchingMode = false;
            }
        }
    }, 500);

    // ==========================================
    // 4c. MOVEMENT (SPRINT-JUMP WHILE FOLLOWING/CHASING)
    // ==========================================
    const HOP_MIN_DISTANCE = 4;
    const BOW_CHASE_START = 28;
    const BOW_CHASE_RANGE = 20;
    let followName = null;
    let chaseOwned = false;
    let hopActive = false;

    function getFollowEntity() {
        const p = followName ? bot.players[followName] : null;
        return p && p.entity ? p.entity : null;
    }

    function resumeFollowIfNeeded() {
        if (currentThreat || isHealing) return;
        const target = getFollowEntity();
        if (!target) return;
        isBusyWithCommand = true;
        bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
    }

    function updateChase(t) {
        const dist = t.position.distanceTo(bot.entity.position);

        if (combatMode === 'bow') {
            if (dist > BOW_CHASE_START) {
                bot.pathfinder.setGoal(new goals.GoalFollow(t, BOW_CHASE_RANGE), true);
                chaseOwned = true;
            } else if (chaseOwned) {
                bot.pathfinder.setGoal(null);
                chaseOwned = false;
            }
            return;
        }

        if (dist > 3 && (!bot.pathfinder.goal || chaseOwned)) {
            if (!chaseOwned) {
                bot.pathfinder.setGoal(new goals.GoalFollow(t, 2), true);
                chaseOwned = true;
            }
        }
    }

    function getMovementTarget() {
        if (currentThreat && threatIsValid(currentThreat)) return currentThreat;
        return getFollowEntity();
    }

    function safeToHop() {
        const pos = bot.entity.position;
        const yaw = bot.entity.yaw;
        const dx = -Math.sin(yaw);
        const dz = -Math.cos(yaw);

        const overhead = bot.blockAt(pos.offset(0, 2, 0));
        if (!overhead || overhead.boundingBox === 'block') return false;

        for (const step of [1, 2]) {
            const ahead = pos.offset(dx * step, 0, dz * step);
            const feet = bot.blockAt(ahead);
            const head = bot.blockAt(ahead.offset(0, 1, 0));
            const high = bot.blockAt(ahead.offset(0, 2, 0));
            const below = bot.blockAt(ahead.offset(0, -1, 0));
            if (!feet || !head || !high || !below) return false;
            if (feet.boundingBox === 'block' || head.boundingBox === 'block' || high.boundingBox === 'block') return false;
            if (below.boundingBox !== 'block') return false;
            if (below.name === 'lava' || below.name === 'magma_block' || feet.name === 'lava') return false;
        }
        return true;
    }

    function releaseHop() {
        if (hopActive) {
            bot.setControlState('jump', false);
            hopActive = false;
        }
    }

    bot.on('physicsTick', () => {
        if (!bot.entity || isHealing || !bot.pathfinder || activeMiningJob) return releaseHop();

        const target = getMovementTarget();
        if (!target || !target.position) return releaseHop();

        const moving = typeof bot.pathfinder.isMoving === 'function' ? bot.pathfinder.isMoving() : !!bot.pathfinder.goal;
        if (!moving) return releaseHop();

        if (currentThreat && combatMode === 'bow' && !chaseOwned) return releaseHop();

        const dist = target.position.distanceTo(bot.entity.position);
        if (dist < HOP_MIN_DISTANCE) return releaseHop();

        bot.setControlState('sprint', true);

        if (bot.entity.isInWater || bot.entity.isInLava) return releaseHop();

        if (safeToHop()) {
            bot.setControlState('jump', true);
            hopActive = true;
        } else {
            releaseHop();
        }
    });

    function findAttackTarget(targetName) {
        const raw = (targetName || '').trim();
        const name = raw.toLowerCase().replace(/\s+/g, '_');
        const vague = ['', 'mob', 'mobs', 'monster', 'monsters', 'enemy', 'enemies', 'hostile', 'hostiles'];

        if (vague.includes(name)) {
            return bot.nearestEntity(e => isHostileMob(e) && e.position.distanceTo(bot.entity.position) < 24);
        }

        const playerMatch = Object.values(bot.players).find(p =>
            p.username.toLowerCase() === raw.toLowerCase() && p.username !== bot.username && p.entity);
        if (playerMatch) return playerMatch.entity;

        const names = [name, name.replace(/s$/, ''), name.replace(/es$/, '')];
        return bot.nearestEntity(e =>
            isMobEntity(e) && names.includes((e.name || '').toLowerCase()) &&
            e.position.distanceTo(bot.entity.position) < 32);
    }

    bot.on('health', async () => {
        if (bot.health >= 12 || isHealing) return;
        if (Date.now() - lastHealAttempt < 5000) return;
        lastHealAttempt = Date.now();

        isHealing = true;
        stopPVP();
        bot.chat("My health is critically low. I need to step back and consume some food.");

        await consumeCombatFood();

        isHealing = false;

        if (currentThreat && threatIsValid(currentThreat)) {
            bot.chat("I have healed. I am ready to resume combat.");
            await executeAdvancedAttack(currentThreat);
        } else {
            currentThreat = null;
            threatMode = null;
            chaseOwned = false;
            resetBotState().then(resumeFollowIfNeeded);
        }
    });

    async function consumeCombatFood() {
        const combatFoods = [
            'enchanted_golden_apple', 'golden_apple', 'golden_carrot', 
            'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'bread', 'apple'
        ];
        
        for (const foodName of combatFoods) {
            const food = bot.inventory.items().find(i => i.name === foodName);
            if (food) {
                try {
                    await bot.equip(food, 'hand');
                    await bot.consume(); 
                    return true;
                } catch (e) {
                    return false;
                }
            }
        }
        return false;
    }

    function startRandomChatter() {
        const minTime = 2 * 60 * 1000;
        const maxTime = 5 * 60 * 1000;
        const nextMessageTime = Math.floor(Math.random() * (maxTime - minTime + 1) + minTime);
        
        setTimeout(() => {
            if (bot.health > 10 && !isBusyWithCommand) {
                bot.chat(PERSONA_QUOTES[Math.floor(Math.random() * PERSONA_QUOTES.length)]);
            }
            startRandomChatter();
        }, nextMessageTime);
    }

    // ==========================================
    // 5. COMMAND PARSER (LOCAL QUICK + GEMINI AI)
    // ==========================================
    async function withRetry(makeRequest, attempts = 3) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await makeRequest();
            } catch (err) {
                if (i === attempts - 1) throw err;
                await new Promise(resolve => setTimeout(resolve, 1200 * (i + 1)));
            }
        }
    }

    let taskChain = Promise.resolve();
    function runExclusive(task) {
        const serial = commandSerial;
        const previous = taskChain.catch(() => {});
        const run = Promise.race([previous, new Promise(resolve => setTimeout(resolve, 8000))]).then(async () => {
            if (serial !== commandSerial) return;
            await task();
        });
        taskChain = run.catch(() => {});
        return run;
    }

    function splitQuantity(rest) {
        let m;
        rest = rest.replace(/^(?:me|us)\s+/i, '');
        if ((m = rest.match(/^(\d+)\s*(?:x\s*)?stacks?\s*(?:of\s+)?(.+)$/i))) return { quantity: Math.min(+m[1] * 64, 2304), name: m[2] };
        if ((m = rest.match(/^(?:a|one)\s+stack\s*(?:of\s+)?(.+)$/i))) return { quantity: 64, name: m[1] };
        if ((m = rest.match(/^(\d+)\s*(?:x\s*)?(.+)$/i))) return { quantity: +m[1], name: m[2] };
        return { quantity: 1, name: rest };
    }

    function parseQuickCommand(message) {
        if (typeof mcData === 'undefined' || !mcData) return null;
        let text = String(message || '').trim().replace(/[.!?]+$/, '');
        text = text.replace(/^[\w.-]+[,:]\s+/, '');
        let previous;
        do {
            previous = text;
            text = text.replace(/^(?:hey|hi|hello|ok|okay|yo|please|pls|can you|could you|would you|will you|go and|go)\s+/i, '');
        } while (text !== previous);

        if (/^(?:stop|cancel|halt|abort|enough|never ?mind)\b/i.test(text)) {
            return { action: 'stop', bot_message: 'Understood, I will stop.' };
        }
        if (/^(?:follow\s+me|come\s+(?:here|with\s+me|to\s+me))\b/i.test(text)) {
            return { action: 'follow', bot_message: 'Certainly, I will follow you.' };
        }

        const schemMatch = text.match(/^(?:build|paste|load)\s+([\w.-]+\.(?:schem|nbt))$/i);
        if (schemMatch) {
            return { action: 'build_schematic', filename: schemMatch[1], bot_message: `Preparing to build ${schemMatch[1]}.` };
        }

        const verb = text.match(/^(mine|dig\s+up|dig|craft|make|build|smelt|cook|bake)\s+(.+)$/i);
        if (!verb) return null;
        const word = verb[1].toLowerCase().replace(/\s+/g, ' ');
        let { quantity, name } = splitQuantity(verb[2]);
        name = name.replace(/\s+(?:for me|please|pls|now|thanks|thank you)$/i, '')
                   .replace(/^(?:a|an|some|the|of)\s+/i, '').trim();
        if (!name) return null;
        const itemName = name.toLowerCase().replace(/\s+/g, '_');
        quantity = Math.max(1, quantity || 1);

        try {
            if (word === 'mine' || word.startsWith('dig')) {
                if (resolveMineTarget(itemName)) return { action: 'mine_ore', item_name: itemName, quantity, bot_message: '' };
            } else if (word === 'smelt' || word === 'cook' || word === 'bake') {
                if (resolveSmeltTarget(itemName)) return { action: 'smelt_item', item_name: itemName, quantity, bot_message: '' };
            } else if (resolveCraftRequest(itemName)) {
                return { action: 'craft_item', item_name: itemName, quantity, bot_message: '' };
            } else if (word === 'build') {
                return { action: 'build_schematic', filename: itemName, bot_message: `Preparing to build ${itemName}.` };
            }
        } catch (e) {}
        return null;
    }

    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;

        const quick = parseQuickCommand(message);
        if (quick) {
            handleUserIntent(quick, username).catch(err => console.error('[Command Error]', err));
            return;
        }

        try {
            const response = await withRetry(() => ai.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: `You are the brain of an elite, helpful, and polite Minecraft AI bot named Genesis.
Persona Instructions:
- You are polite, professional, friendly, and eager to assist the player.
- You never use slang, toxicity, or rude remarks.
- You gladly accept all tasks and confirm them politely.
- If a player asks you to "build" or "paste" a schematic or structure file (.schem or .nbt), output "build_schematic" and set "filename".
- If a player asks you to "get", "bring", or "find" an item from your inventory, output "give_item".
- If a player asks you to "mine", "dig", or "extract" ore or blocks from the ground (diamonds, coal, iron, gold, stone, obsidian, ancient debris...), output "mine_ore" with item_name and quantity.
- If a player asks you to "craft", "make", or "create" an item, output "craft_item" with item_name and quantity.
- If a player asks you to "smelt", "cook", "bake", or "refine" something, output "smelt_item" with item_name and quantity.

Player "${username}" said: "${message}".
Determine the intended action. Normalize all items to valid Minecraft identifiers (e.g. "diamond_sword", "raw_iron", "ancient_debris").
Generate a polite, persona-driven reply for bot_message.`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            action: { type: Type.STRING, enum: ["build_schematic", "give_item", "craft_item", "smelt_item", "mine_ore", "follow", "stop", "attack", "none"] },
                            filename: { type: Type.STRING },
                            item_name: { type: Type.STRING },
                            quantity: { type: Type.INTEGER },
                            target: { type: Type.STRING },
                            bot_message: { type: Type.STRING }
                        },
                        required: ["action", "bot_message"]
                    }
                }
            }));

            const intent = JSON.parse(response.text);
            handleUserIntent(intent, username).catch(err => console.error('[Command Error]', err));
        } catch (err) {
            console.error("[AI Error]", err);
            if (/\b(mine|dig|craft|make|smelt|cook|follow|attack|bring|give|build)\b/i.test(message)) {
                bot.chat("I am sorry, my AI connection is temporarily busy. Please try again in a moment.");
            }
        }
    });

    async function handleUserIntent(intent, sender) {
        const player = bot.players[intent.target || sender];

        if (intent.bot_message) {
            bot.chat(intent.bot_message);
        }

        if (intent.action === 'none') return; 

        commandSerial++;
        currentThreat = null;
        threatMode = null;
        combatMode = null;
        followName = null;
        chaseOwned = false;
        isBusyWithCommand = true;
        bot.pathfinder.setGoal(null);
        try { bot.stopDigging(); } catch (e) {}
        bot.clearControlStates();
        stopPVP();

        switch (intent.action) {
            case 'build_schematic':
                if (!player || !player.entity) {
                    bot.chat("I cannot see you nearby to align the schematic. Please stand closer!");
                    resetBotState();
                    break;
                }
                await runExclusive(() => executeSchematicBuild(intent.filename, player.entity));
                break;
            case 'give_item': await runExclusive(() => handleGiveItem(intent.item_name, intent.quantity || 1, sender)); break;
            case 'craft_item': await runExclusive(() => handleCraftCommand(intent.item_name, intent.quantity || 1, sender)); break;
            case 'smelt_item': await runExclusive(() => handleSmeltCommand(intent.item_name, intent.quantity || 1, sender)); break;
            case 'mine_ore': await runExclusive(() => handleMineCommand(intent.item_name, intent.quantity || 1, sender)); break;
            case 'follow':
                if (player && player.entity) { followName = player.username; bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true); } 
                else { bot.chat("I cannot see you nearby to follow. Please come closer!"); resetBotState(); }
                break;
            case 'stop': 
                resetBotState(); 
                break;
            case 'attack': {
                const victim = findAttackTarget(intent.target);
                if (victim && isPlayerEntity(victim) && victim.username === sender) {
                    bot.chat("I would rather not attack you, but I am happy to help with something else.");
                    resetBotState();
                } else if (victim) {
                    await engageThreat(victim, 'ordered');
                } else {
                    bot.chat("I cannot locate that target to attack.");
                    resetBotState();
                }
                break;
            }
        }
    }

    // ==========================================
    // 6a. TWO-PHASE SCHEMATIC BUILDER ENGINE
    // ==========================================
    async function executeSchematicBuild(filename, playerEntity) {
        const serial = commandSerial;
        let targetFile = filename || 'house.schem';
        if (!targetFile.endsWith('.schem') && !targetFile.endsWith('.nbt')) targetFile += '.schem';

        try {
            await fs.access(`./${targetFile}`);
        } catch {
            bot.chat(`I cannot find a schematic named "${targetFile}" in my folder.`);
            resetIfCurrent(serial);
            return;
        }

        const startX = playerEntity ? Math.floor(playerEntity.position.x) : Math.floor(bot.entity.position.x);
        const startY = playerEntity ? Math.floor(playerEntity.position.y) : Math.floor(bot.entity.position.y);
        const startZ = playerEntity ? Math.floor(playerEntity.position.z) : Math.floor(bot.entity.position.z);

        try {
            const rawBuffer = await fs.readFile(`./${targetFile}`);
            const { parsed } = await nbt.parse(rawBuffer);
            let target = parsed.value;

            while (true) {
                let rootKeys = Object.keys(target);
                let foundWrapper = false;
                for (let k of rootKeys) {
                    if (target[k].type === 'compound' && (k === 'Schematic' || k === 'Clipboard' || rootKeys.length === 1)) {
                        target = target[k].value;
                        foundWrapper = true;
                        break;
                    }
                }
                if (!foundWrapper) break;
            }

            const keysLow = Object.keys(target).map(k => k.toLowerCase());
            let format = 'UNKNOWN';
            const blocksTag = getProp(target, 'blocks');

            if (keysLow.includes('blockdata') && keysLow.includes('palette')) format = 'SPONGE_V2';
            else if (blocksTag && blocksTag.type === 'compound' && getProp(blocksTag.value, 'palette') && getProp(blocksTag.value, 'data')) format = 'SPONGE_V3';
            else if (keysLow.includes('blocks') && (keysLow.includes('palette') || keysLow.includes('palettes')) && keysLow.includes('size')) format = 'VANILLA_NBT';

            const buildQueue = [];

            if (format === 'SPONGE_V2' || format === 'SPONGE_V3') {
                const width = getProp(target, 'width').value;
                const height = getProp(target, 'height').value;
                const length = getProp(target, 'length').value;

                let paletteObj = format === 'SPONGE_V2' ? getProp(target, 'palette').value : getProp(blocksTag.value, 'palette').value;
                let blockData = format === 'SPONGE_V2' ? getProp(target, 'blockdata').value : getProp(blocksTag.value, 'data').value;

                const paletteDict = [];
                for (const [blockStr, idTag] of Object.entries(paletteObj)) {
                    paletteDict[idTag.value] = blockStr;
                }

                const blockIDs = [];
                let offset = 0;
                const expectedCount = width * height * length;

                while (offset < blockData.length && blockIDs.length < expectedCount) {
                    let value = 0, shift = 0, byte;
                    do {
                        byte = blockData[offset++] & 0xFF;
                        value |= (byte & 0x7F) << shift;
                        shift += 7;
                    } while ((byte & 0x80) !== 0);
                    blockIDs.push(value);
                }

                for (let y = 0; y < height; y++) {
                    for (let z = 0; z < length; z++) {
                        for (let x = 0; x < width; x++) {
                            const index = (y * length + z) * width + x;
                            let blockString = paletteDict[blockIDs[index]];
                            if (blockString && !blockString.includes('air')) {
                                if (!blockString.startsWith('minecraft:')) blockString = 'minecraft:' + blockString;
                                buildQueue.push({
                                    command: `/setblock ${startX + x} ${startY + y} ${startZ + z} ${blockString}`,
                                    isDelayed: isDelayedBlock(blockString)
                                });
                            }
                        }
                    }
                }
            } else if (format === 'VANILLA_NBT') {
                const blocks = getProp(target, 'blocks').value.value;
                let palette = [];
                const palettesProp = getProp(target, 'palettes');
                if (palettesProp) {
                    let firstPalette = palettesProp.value.value[0];
                    palette = firstPalette.value ? firstPalette.value : firstPalette;
                } else {
                    palette = getProp(target, 'palette').value.value;
                }

                for (const b of blocks) {
                    const posList = b.pos.value.value;
                    const px = posList[0].value ?? posList[0];
                    const py = posList[1].value ?? posList[1];
                    const pz = posList[2].value ?? posList[2];
                    const stateIdx = b.state.value ?? b.state;
                    const palItem = palette[stateIdx];
                    const blockName = palItem.Name.value.replace('minecraft:', '');

                    if (blockName !== 'air' && blockName !== 'cave_air' && blockName !== 'void_air') {
                        let stateStr = '';
                        if (palItem.Properties) {
                            const props = [];
                            for (const [pk, pv] of Object.entries(palItem.Properties.value)) {
                                props.push(`${pk}=${pv.value}`);
                            }
                            if (props.length > 0) stateStr = `[${props.join(',')}]`;
                        }
                        buildQueue.push({
                            command: `/setblock ${startX + px} ${startY + py} ${startZ + pz} minecraft:${blockName}${stateStr}`,
                            isDelayed: isDelayedBlock(blockName)
                        });
                    }
                }
            } else {
                bot.chat("Unsupported schematic format.");
                resetIfCurrent(serial);
                return;
            }

            const phase1 = buildQueue.filter(b => !b.isDelayed);
            const phase2 = buildQueue.filter(b => b.isDelayed);

            bot.chat(`Initiating Phase 1: Structural Skeleton (${phase1.length} blocks)...`);
            for (let i = 0; i < phase1.length; i++) {
                if (serial !== commandSerial) return;
                bot.chat(phase1[i].command);
                await new Promise(r => setTimeout(r, buildingSpeed));
            }

            if (phase2.length > 0) {
                bot.chat(`Initiating Phase 2: Redstone & Attachments (${phase2.length} blocks)...`);
                for (let i = 0; i < phase2.length; i++) {
                    if (serial !== commandSerial) return;
                    bot.chat(phase2[i].command);
                    await new Promise(r => setTimeout(r, buildingSpeed));
                }
            }

            bot.chat(`Construction complete! Placed ${phase1.length + phase2.length} blocks.`);
        } catch (fileErr) {
            console.error("[Schematic Error]:", fileErr);
            bot.chat("I encountered an error reading the schematic file.");
        }
        resetIfCurrent(serial);
    }

    // ==========================================
    // 6b. GIVE & RECURSIVE CRAFTING SYSTEM
    // ==========================================
    async function handleGiveItem(requestedItem, count, sender) {
        const serial = commandSerial;
        const player = bot.players[sender];
        if (!player || !player.entity) {
            resetIfCurrent(serial); return;
        }

        const term = (requestedItem || '').toLowerCase().replace(/\s+/g, '_');
        const item = bot.inventory.items().find(i => i.name === term || i.name.includes(term) || (term === 'food' && mcData.foodsByName[i.name]));

        if (!item) {
            bot.chat(`I apologize, but I do not have any ${(requestedItem || 'that item').replace(/_/g, ' ')} in my inventory.`);
            resetIfCurrent(serial); return;
        }

        try {
            await bot.pathfinder.goto(new goals.GoalNear(player.entity.position.x, player.entity.position.y, player.entity.position.z, 2));
            await bot.lookAt(player.entity.position.offset(0, 1.6, 0));
            await bot.toss(item.type, null, Math.min(count, item.count));
        } catch (err) {}
        resetIfCurrent(serial);
    }

    const MAX_CRAFT_DEPTH = 5;
    const MAX_CRAFT_QUANTITY = 256;

    const prettyName = (id) => (mcData.items[id]?.name || `item_${id}`).replace(/_/g, ' ');

    function resolveCraftTarget(rawName) {
        const base = (rawName || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
        const candidates = [
            base,
            base.replace(/s$/, ''),
            base.replace(/es$/, ''),
            base.replace(/ies$/, 'y'),
            base.replace(/^wood_/, 'wooden_'),
            base.replace(/^wood_/, 'wooden_').replace(/s$/, '')
        ];
        for (const name of candidates) {
            if (mcData.itemsByName[name]) return mcData.itemsByName[name];
        }
        return null;
    }

    function countInventory() {
        const counts = new Map();
        for (const item of bot.inventory.items()) {
            counts.set(item.type, (counts.get(item.type) || 0) + item.count);
        }
        return counts;
    }

    function recipeIngredients(recipe) {
        return recipe.delta.filter(d => d.count < 0);
    }

    function addMissing(target, source) {
        for (const [id, n] of source) target.set(id, (target.get(id) || 0) + n);
    }

    function ensureItem(itemId, total, sim, visiting = new Set(), depth = 0) {
        const result = { ok: true, steps: [], missing: new Map(), sim: new Map(sim) };
        const have = sim.get(itemId) || 0;
        if (have >= total) return result;

        const shortfall = total - have;
        const fail = () => {
            result.ok = false;
            result.missing.set(itemId, shortfall);
            return result;
        };

        if (depth >= MAX_CRAFT_DEPTH || visiting.has(itemId)) return fail();

        const smelted = trySmeltOption(itemId, shortfall, sim);
        if (smelted && smelted.ok) return smelted;

        const recipes = bot.recipesAll(itemId, null, true);
        if (!recipes || recipes.length === 0) {
            if (smelted) return smelted;
            return fail();
        }

        const rank = (r) => recipeIngredients(r)
            .filter(d => (sim.get(d.id) || 0) >= -d.count).length;
        const ordered = [...recipes].sort((a, b) => rank(b) - rank(a));

        visiting.add(itemId);
        let best = null;
        for (const recipe of ordered) {
            const attempt = tryRecipe(recipe, itemId, shortfall, sim, visiting, depth);
            if (isBetterAttempt(attempt, best)) best = attempt;
            if (attempt.ok && attempt.steps.length === 1) break;
        }
        visiting.delete(itemId);

        if (best && best.ok) return best;
        if (smelted) return smelted;
        if (isSmeltOutput(itemId)) return fail();
        return best || fail();
    }

    function tryRecipe(recipe, itemId, shortfall, sim, visiting, depth) {
        const perCraft = recipe.result.count || 1;
        const crafts = Math.ceil(shortfall / perCraft);

        let current = new Map(sim);
        const steps = [];
        const missing = new Map();

        for (const ing of recipeIngredients(recipe)) {
            const need = -ing.count * crafts;
            const sub = ensureItem(ing.id, need, current, visiting, depth + 1);
            steps.push(...sub.steps);
            addMissing(missing, sub.missing);
            current = sub.sim;
            current.set(ing.id, Math.max(0, (current.get(ing.id) || 0) - need));
        }

        steps.push({ recipe, itemId, crafts });
        current.set(itemId, (current.get(itemId) || 0) + crafts * perCraft);

        return { ok: missing.size === 0, steps, missing, sim: current };
    }

    function isBetterAttempt(candidate, best) {
        if (!best) return true;
        if (candidate.ok !== best.ok) return candidate.ok;
        if (candidate.ok) return candidate.steps.length < best.steps.length;
        const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
        return sum(candidate.missing) < sum(best.missing);
    }

    function isSmeltOutput(itemId) {
        const name = mcData.items[itemId]?.name;
        return !!name && validSmeltRecipes().some(([, out]) => out === name);
    }

    function pickFuelFromSim(sim, excludeIds, neededSmelts) {
        const options = [];
        for (const [id, count] of sim) {
            if (count <= 0 || excludeIds.has(id)) continue;
            const name = mcData.items[id]?.name;
            if (!name) continue;
            const pref = FUEL_TABLE.findIndex(f => f.match(name));
            if (pref === -1) continue;
            options.push({ id, name, count, smelts: FUEL_TABLE[pref].smelts, pref });
        }
        options.sort((a, b) => a.pref - b.pref);
        return options.find(o => o.count * o.smelts >= neededSmelts) || null;
    }

    function trySmeltOption(itemId, shortfall, sim) {
        const outName = mcData.items[itemId]?.name;
        if (!outName) return null;
        const inputs = validSmeltRecipes().filter(([, out]) => out === outName).map(([input]) => input);
        if (inputs.length === 0) return null;

        const next = new Map(sim);
        const smelts = [];
        let remaining = shortfall;
        for (const inputName of inputs) {
            if (remaining <= 0) break;
            const inputId = mcData.itemsByName[inputName].id;
            const have = next.get(inputId) || 0;
            if (have <= 0) continue;
            const take = Math.min(have, remaining);
            smelts.push({ inputName, inputId, count: take });
            next.set(inputId, have - take);
            remaining -= take;
        }
        if (remaining > 0 || smelts.length === 0) return null;

        const total = smelts.reduce((sum, s) => sum + s.count, 0);
        const result = { ok: true, steps: [], missing: new Map(), sim: next };

        const fuel = pickFuelFromSim(next, new Set(smelts.map(s => s.inputId)), total);
        if (!fuel) {
            result.ok = false;
            const coal = mcData.itemsByName.coal;
            if (coal) result.missing.set(coal.id, Math.ceil(total / 8));
            return result;
        }
        next.set(fuel.id, fuel.count - Math.ceil(total / fuel.smelts));

        for (const s of smelts) {
            result.steps.push({ type: 'smelt', inputName: s.inputName, outputName: outName, count: s.count });
        }
        next.set(itemId, (next.get(itemId) || 0) + total);
        return result;
    }

    const CRAFT_ALIASES = {
        gapple: 'golden_apple', gapples: 'golden_apple', gold_apple: 'golden_apple',
        workbench: 'crafting_table', crafting_bench: 'crafting_table',
        eye_of_ender: 'ender_eye', dynamite: 'tnt', leash: 'lead',
        sticky_pistons: 'sticky_piston', glowstone_block: 'glowstone', redstone_lamp: 'redstone_lamp',
        wood_planks: 'planks', wooden_planks: 'planks', wood_pickaxe: 'wooden_pickaxe'
    };
    const MATERIAL_WORDS = {
        wood: 'wooden', wooden: 'wooden', stone: 'stone', copper: 'copper', iron: 'iron',
        gold: 'golden', golden: 'golden', diamond: 'diamond', leather: 'leather'
    };
    const TOOL_MATERIALS = ['diamond', 'iron', 'copper', 'stone', 'golden', 'wooden'];
    const ARMOR_MATERIALS = ['diamond', 'iron', 'copper', 'golden', 'leather'];
    const TOOL_PIECES = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'];
    const ARMOR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots'];

    const itemExists = (name) => !!mcData.itemsByName[name];

    function resolveCraftRequest(rawName) {
        let base = (rawName || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
        if (CRAFT_ALIASES[base]) base = CRAFT_ALIASES[base];

        const exact = resolveCraftTarget(base);
        if (exact) return { kind: 'single', name: exact.name };

        const parts = base.split('_');
        const last = parts[parts.length - 1];
        const material = parts.length > 1 ? MATERIAL_WORDS[parts[0]] : null;

        if (['armor', 'armour', 'armors', 'armours'].includes(last)) {
            if (parts.length > 1 && !material) return null;
            const materials = (material ? [material] : ARMOR_MATERIALS).filter(m => itemExists(`${m}_helmet`));
            if (materials.length) return { kind: 'bundle', label: `${material || 'best available'} armor`, pieces: ARMOR_PIECES, materials };
        }
        if (last === 'tools') {
            if (parts.length > 1 && !material) return null;
            const materials = (material ? [material] : TOOL_MATERIALS).filter(m => itemExists(`${m}_pickaxe`));
            if (materials.length) return { kind: 'bundle', label: `${material || 'best available'} tools`, pieces: ['pickaxe', 'axe', 'shovel', 'hoe'], materials };
        }

        const singular = [base, base.replace(/s$/, '')];
        for (const word of singular) {
            if (TOOL_PIECES.includes(word)) {
                return { kind: 'family', candidates: TOOL_MATERIALS.map(m => `${m}_${word}`).filter(itemExists) };
            }
            if (ARMOR_PIECES.includes(word)) {
                return { kind: 'family', candidates: ARMOR_MATERIALS.map(m => `${m}_${word}`).filter(itemExists) };
            }
        }

        for (const word of [base, base.replace(/s$/, ''), base.replace(/es$/, '')]) {
            if (word.length < 3) continue;
            const candidates = Object.values(mcData.items)
                .map(i => i.name)
                .filter(n => n.endsWith(`_${word}`) && !/hanging|chest_boat|chest_raft/.test(n));
            if (candidates.length > 0) return { kind: 'family', candidates };
        }
        return null;
    }

    function pickBestCandidate(candidates, quantity) {
        const sim = countInventory();
        let best = null;
        for (const name of candidates) {
            const item = mcData.itemsByName[name];
            if (!item) continue;
            const plan = ensureItem(item.id, (sim.get(item.id) || 0) + quantity, sim);
            if (plan.ok) return name;
            const missingTotal = [...plan.missing.values()].reduce((a, b) => a + b, 0);
            if (!best || missingTotal < best.missingTotal) best = { name, missingTotal };
        }
        return best ? best.name : null;
    }

    function chooseBundleMaterial(request, quantity) {
        let bestMaterial = null;
        let bestCount = -1;
        for (const material of request.materials) {
            let sim = countInventory();
            let okCount = 0;
            for (const piece of request.pieces) {
                const item = mcData.itemsByName[`${material}_${piece}`];
                if (!item) continue;
                const plan = ensureItem(item.id, (sim.get(item.id) || 0) + quantity, sim);
                if (plan.ok) { okCount++; sim = plan.sim; }
            }
            if (okCount === request.pieces.length) return material;
            if (okCount > bestCount) { bestCount = okCount; bestMaterial = material; }
        }
        return bestMaterial;
    }

    async function craftBundle(request, quantity) {
        const serial = commandSerial;
        quantity = Math.max(1, Math.min(MAX_CRAFT_QUANTITY, quantity || 1));
        const material = chooseBundleMaterial(request, quantity);
        const items = request.pieces.map(p => `${material}_${p}`).filter(itemExists);
        if (!material || items.length === 0) {
            bot.chat(`I do not know how to craft ${request.label}.`);
            return false;
        }

        let crafted = 0;
        for (const name of items) {
            if (serial !== commandSerial) return false;
            if (await craftSmart(name, quantity)) crafted++;
        }
        bot.chat(`Finished: I crafted ${crafted} of ${items.length} pieces of ${material.replace(/_/g, ' ')} ${request.label.includes('armor') ? 'armor' : 'tools'}.`);
        return crafted > 0;
    }

    function formatMissing(missing) {
        return [...missing.entries()].map(([id, n]) => `${n} ${prettyName(id)}`).join(', ');
    }

    function findNearbyTable(maxDistance = 32) {
        return bot.findBlock({ matching: mcData.blocksByName.crafting_table.id, maxDistance });
    }

    async function acquireCraftingTable() {
        const existing = findNearbyTable();
        if (existing) return { block: existing, placed: false };

        const placedBlock = await placeBlockNearby('crafting_table');
        if (placedBlock) return { block: placedBlock, placed: true };
        return null;
    }

    async function pickUpTable(block) {
        try {
            const current = bot.blockAt(block.position);
            if (!current || current.name !== 'crafting_table') return;
            await bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 3));
            await bot.dig(current);
            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (e) {}
    }

    async function executePlan(steps, serial) {
        let table = null;
        let placedTable = null;

        try {
            for (const step of steps) {
                if (serial !== undefined && serial !== commandSerial) {
                    const cancelled = new Error('cancelled');
                    cancelled.cancelled = true;
                    throw cancelled;
                }

                if (step.type === 'smelt') {
                    const done = await smeltExact(step.inputName, step.count);
                    if (!done) throw new Error(`could not smelt ${step.inputName.replace(/_/g, ' ')}`);
                    continue;
                }

                let tableBlock = null;

                if (step.recipe.requiresTable) {
                    if (!table) {
                        const acquired = await acquireCraftingTable();
                        if (!acquired) throw new Error('Could not find or place a crafting table');
                        table = acquired.block;
                        if (acquired.placed) placedTable = acquired.block;
                    }
                    await bot.pathfinder.goto(new goals.GoalNear(table.position.x, table.position.y, table.position.z, 2));
                    tableBlock = table;
                }

                await bot.craft(step.recipe, step.crafts, tableBlock);
            }
        } finally {
            if (placedTable) await pickUpTable(placedTable);
        }
    }

    async function handleCraftCommand(itemName, quantity, sender) {
        const serial = commandSerial;
        await craftSmart(itemName, quantity);
        resetIfCurrent(serial);
    }

    async function craftSmart(itemName, quantity = 1) {
        const request = resolveCraftRequest(itemName);
        if (request && request.kind === 'bundle') return craftBundle(request, quantity);
        if (request && request.kind === 'single') itemName = request.name;
        if (request && request.kind === 'family') {
            const picked = pickBestCandidate(request.candidates, Math.max(1, quantity || 1));
            if (picked) itemName = picked;
        }
        const serial = commandSerial;

        const itemData = resolveCraftTarget(itemName);
        const label = (itemName || 'that item').replace(/_/g, ' ');

        if (!itemData) {
            bot.chat(`I apologize, but I do not recognize "${label}" as a Minecraft item.`);
            return false;
        }

        quantity = Math.max(1, Math.min(MAX_CRAFT_QUANTITY, quantity || 1));
        const niceName = prettyName(itemData.id);

        if (bot.recipesAll(itemData.id, null, true).length === 0) {
            bot.chat(`${niceName} cannot be crafted. It has to be gathered or obtained another way.`);
            return false;
        }

        const tableItemId = mcData.itemsByName.crafting_table.id;
        let sim = countInventory();
        const before = sim.get(itemData.id) || 0;
        let steps = [];

        let plan = ensureItem(itemData.id, before + quantity, sim);

        if (plan.ok && plan.steps.some(s => s.recipe && s.recipe.requiresTable) && !findNearbyTable() && (sim.get(tableItemId) || 0) < 1) {
            const tablePlan = ensureItem(tableItemId, 1, sim);
            if (!tablePlan.ok) {
                bot.chat(`I cannot craft ${quantity} ${niceName} yet. I would also need a crafting table, and I am missing: ${formatMissing(tablePlan.missing)}.`);
                return false;
            }
            steps = [...tablePlan.steps];
            plan = ensureItem(itemData.id, before + quantity, tablePlan.sim);
        }

        if (!plan.ok) {
            bot.chat(`I cannot craft ${quantity} ${niceName} yet. I am still missing: ${formatMissing(plan.missing)}.`);
            return false;
        }

        steps.push(...plan.steps);

        if (steps.length === 0) {
            bot.chat(`I already have ${quantity} or more ${niceName}.`);
            return true;
        }

        bot.chat(`Certainly! Crafting ${quantity} ${niceName} now.`);
        try {
            await executePlan(steps, serial);
        } catch (err) {
            if (err.cancelled) { bot.chat('Understood, I stopped crafting.'); return false; }
            bot.chat(`I ran into a problem while crafting ${niceName}: ${err.message}`);
            return false;
        }

        const after = countInventory().get(itemData.id) || 0;
        const produced = after - before;
        if (produced > 0) {
            bot.chat(`Done! I crafted ${produced} ${niceName}.`);
            return true;
        }
        bot.chat(`I tried to craft ${niceName}, but nothing ended up in my inventory.`);
        return false;
    }

    async function placeBlockNearby(blockItemName) {
        const item = bot.inventory.items().find(i => i.name === blockItemName);
        if (!item) return null;

        const feet = bot.entity.position.floored();
        const positions = bot.findBlocks({
            matching: (block) =>
                block.boundingBox === 'block' &&
                bot.blockAt(block.position.offset(0, 1, 0))?.name === 'air' &&
                bot.blockAt(block.position.offset(0, 2, 0))?.name === 'air',
            maxDistance: 4,
            count: 24
        });

        for (const pos of positions) {
            if (pos.x === feet.x && pos.z === feet.z) continue;

            const referenceBlock = bot.blockAt(pos);
            if (!referenceBlock) continue;

            try {
                await bot.equip(item, 'hand');
                await bot.placeBlock(referenceBlock, { x: 0, y: 1, z: 0 });
                const placed = bot.blockAt(pos.offset(0, 1, 0));
                if (placed && placed.name === blockItemName) return placed;
            } catch (e) {}
        }
        return null;
    }

    // ==========================================
    // 6c. SMELTING SYSTEM
    // ==========================================
    const MAX_SMELT_QUANTITY = 256;
    const SMELT_MS_PER_ITEM = 10000;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const SMELT_RECIPES = {
        raw_iron: 'iron_ingot', iron_ore: 'iron_ingot', deepslate_iron_ore: 'iron_ingot',
        raw_gold: 'gold_ingot', gold_ore: 'gold_ingot', deepslate_gold_ore: 'gold_ingot', nether_gold_ore: 'gold_ingot',
        raw_copper: 'copper_ingot', copper_ore: 'copper_ingot', deepslate_copper_ore: 'copper_ingot',
        ancient_debris: 'netherite_scrap',
        coal_ore: 'coal', deepslate_coal_ore: 'coal',
        diamond_ore: 'diamond', deepslate_diamond_ore: 'diamond',
        emerald_ore: 'emerald', deepslate_emerald_ore: 'emerald',
        lapis_ore: 'lapis_lazuli', deepslate_lapis_ore: 'lapis_lazuli',
        redstone_ore: 'redstone', deepslate_redstone_ore: 'redstone',
        nether_quartz_ore: 'quartz',
        sand: 'glass', red_sand: 'glass',
        cobblestone: 'stone', stone: 'smooth_stone', cobbled_deepslate: 'deepslate',
        clay_ball: 'brick', clay: 'terracotta', netherrack: 'nether_brick',
        quartz_block: 'smooth_quartz', sandstone: 'smooth_sandstone', red_sandstone: 'smooth_red_sandstone',
        basalt: 'smooth_basalt', wet_sponge: 'sponge',
        stone_bricks: 'cracked_stone_bricks', deepslate_bricks: 'cracked_deepslate_bricks',
        nether_bricks: 'cracked_nether_bricks', polished_blackstone_bricks: 'cracked_polished_blackstone_bricks',
        deepslate_tiles: 'cracked_deepslate_tiles',
        cactus: 'green_dye', sea_pickle: 'lime_dye', kelp: 'dried_kelp', chorus_fruit: 'popped_chorus_fruit',
        beef: 'cooked_beef', porkchop: 'cooked_porkchop', chicken: 'cooked_chicken', mutton: 'cooked_mutton',
        rabbit: 'cooked_rabbit', cod: 'cooked_cod', salmon: 'cooked_salmon', potato: 'baked_potato'
    };
    ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak']
        .forEach(wood => { SMELT_RECIPES[`${wood}_log`] = 'charcoal'; });

    const SMELT_ALIASES = {
        iron: 'iron_ingot', gold: 'gold_ingot', copper: 'copper_ingot', netherite: 'netherite_scrap',
        steak: 'cooked_beef', cooked_steak: 'cooked_beef', bricks: 'brick',
        raw_beef: 'beef', raw_porkchop: 'porkchop', raw_chicken: 'chicken', raw_mutton: 'mutton',
        raw_rabbit: 'rabbit', raw_cod: 'cod', raw_salmon: 'salmon'
    };

    const FUEL_TABLE = [
        { match: n => n === 'coal' || n === 'charcoal', smelts: 8 },
        { match: n => n === 'coal_block', smelts: 80 },
        { match: n => n === 'blaze_rod', smelts: 12 },
        { match: n => n === 'dried_kelp_block', smelts: 20 },
        { match: n => n.endsWith('_planks'), smelts: 1.5 },
        { match: n => n.endsWith('_log') || n.endsWith('_wood'), smelts: 1.5 },
        { match: n => n === 'stick', smelts: 0.5 }
    ];

    function validSmeltRecipes() {
        return Object.entries(SMELT_RECIPES)
            .filter(([input, output]) => mcData.itemsByName[input] && mcData.itemsByName[output]);
    }

    function resolveSmeltTarget(rawName) {
        const base = (rawName || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
        const candidates = [...new Set([
            SMELT_ALIASES[base], base,
            base.replace(/s$/, ''), base.replace(/es$/, ''), base.replace(/ies$/, 'y')
        ].filter(Boolean))];

        const recipes = validSmeltRecipes();
        for (const name of candidates) {
            const inputs = recipes.filter(([, output]) => output === name).map(([input]) => input);
            const asInput = recipes.some(([input]) => input === name) ? name : null;
            if (inputs.length > 0 || asInput) return { name, inputs, asInput };
        }
        return null;
    }

    function countByName(name) {
        return bot.inventory.items().filter(i => i.name === name).reduce((sum, i) => sum + i.count, 0);
    }

    function planSmeltJobs(inputNames, quantity) {
        const jobs = [];
        let remaining = quantity;
        for (const input of inputNames) {
            if (remaining <= 0) break;
            const have = countByName(input);
            if (have === 0) continue;
            const take = Math.min(have, remaining);
            jobs.push({ input, output: SMELT_RECIPES[input], count: take });
            remaining -= take;
        }
        return jobs;
    }

    function pickFuel(excludeNames, neededSmelts) {
        const options = new Map();
        for (const item of bot.inventory.items()) {
            if (excludeNames.has(item.name)) continue;
            const pref = FUEL_TABLE.findIndex(f => f.match(item.name));
            if (pref === -1) continue;
            const entry = options.get(item.name) || { name: item.name, smelts: FUEL_TABLE[pref].smelts, count: 0, pref };
            entry.count += item.count;
            options.set(item.name, entry);
        }
        const list = [...options.values()].sort((a, b) => a.pref - b.pref);
        const enough = list.find(o => o.count * o.smelts >= neededSmelts);
        if (enough) return enough;
        return list.sort((a, b) => b.count * b.smelts - a.count * a.smelts)[0] || null;
    }

    async function acquireFurnace() {
        const furnaceId = mcData.blocksByName.furnace.id;
        const existing = bot.findBlock({ matching: furnaceId, maxDistance: 32 });
        if (existing) return { block: existing, placed: false };

        if (!bot.inventory.items().some(i => i.name === 'furnace')) {
            const crafted = await craftSmart('furnace', 1);
            if (!crafted || !bot.inventory.items().some(i => i.name === 'furnace')) return null;
        }

        const placedBlock = await placeBlockNearby('furnace');
        return placedBlock ? { block: placedBlock, placed: true } : null;
    }

    async function pickUpFurnace(block) {
        const pickaxes = ['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'golden_pickaxe', 'wooden_pickaxe'];
        const pickaxe = pickaxes.map(n => bot.inventory.items().find(i => i.name === n)).find(Boolean);
        if (!pickaxe) return false;
        try {
            const current = bot.blockAt(block.position);
            if (!current || current.name !== 'furnace') return true;
            await bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 3));
            await bot.equip(pickaxe, 'hand');
            await bot.dig(current);
            await sleep(800);
            return true;
        } catch (e) { return false; }
    }

    async function collectFurnaceOutput(furnace, collected) {
        if (!furnace.outputItem()) return;
        try {
            const taken = await furnace.takeOutput();
            if (taken) collected.set(taken.name, (collected.get(taken.name) || 0) + taken.count);
        } catch (e) {}
    }

    async function runSmeltBatch(furnace, job, batch, fuel, serial, collected) {
        const inputItem = bot.inventory.items().find(i => i.name === job.input);
        if (!inputItem) return;
        batch = Math.min(batch, inputItem.count);

        const fuelNeeded = Math.ceil(batch / fuel.smelts);
        const inSlot = furnace.fuelItem()?.name === fuel.name ? furnace.fuelItem().count : 0;
        const fuelItem = bot.inventory.items().find(i => i.name === fuel.name);
        const toPut = Math.min(Math.max(0, fuelNeeded - inSlot), fuelItem ? fuelItem.count : 0, 64 - inSlot);
        if (toPut > 0) await furnace.putFuel(fuelItem.type, null, toPut);

        await furnace.putInput(inputItem.type, null, batch);

        const deadline = Date.now() + batch * (SMELT_MS_PER_ITEM + 500) + 20000;
        let noFuelPolls = 0;

        while (Date.now() < deadline) {
            await sleep(1000);
            if (serial !== commandSerial) { const e = new Error('cancelled'); e.cancelled = true; throw e; }

            await collectFurnaceOutput(furnace, collected);
            if (!furnace.inputItem() && !furnace.outputItem()) return;

            const burning = furnace.fuelItem() || furnace.fuel > 0;
            noFuelPolls = burning ? 0 : noFuelPolls + 1;
            if (noFuelPolls >= 5) throw new Error('the furnace ran out of fuel');
        }
        throw new Error('smelting is taking too long');
    }

    async function handleSmeltCommand(itemName, quantity, sender) {
        const serial = commandSerial;
        await smeltSmart(itemName, quantity);
        resetIfCurrent(serial);
    }

    async function smeltSmart(itemName, quantity = 1) {
        const label = (itemName || 'that item').replace(/_/g, ' ');
        const target = resolveSmeltTarget(itemName);
        if (!target) {
            bot.chat(`I apologize, but I do not know how to smelt "${label}".`);
            return false;
        }
        return smeltWithTarget(target, quantity);
    }

    async function smeltExact(inputName, count) {
        const outputName = SMELT_RECIPES[inputName];
        const before = countByName(outputName);
        await smeltWithTarget({ name: outputName, inputs: [], asInput: inputName }, count);
        return countByName(outputName) - before >= count;
    }

    async function smeltWithTarget(target, quantity = 1) {
        const serial = commandSerial;
        quantity = Math.max(1, Math.min(MAX_SMELT_QUANTITY, quantity || 1));

        const planJobs = () => {
            let jobs = planSmeltJobs(target.inputs, quantity);
            if (jobs.length === 0 && target.asInput) jobs = planSmeltJobs([target.asInput], quantity);
            return jobs;
        };
        const niceTarget = prettyName(mcData.itemsByName[target.name].id);

        let jobs = planJobs();
        if (jobs.length === 0) {
            bot.chat(`I do not have anything I can smelt into ${niceTarget}.`);
            return false;
        }

        const inputNames = new Set(jobs.map(j => j.input));
        const totalCount = () => jobs.reduce((sum, j) => sum + j.count, 0);
        if (!pickFuel(inputNames, totalCount())) {
            bot.chat(`I have nothing to use as fuel. Please give me some coal, charcoal, or wood and I will gladly smelt for you.`);
            return false;
        }

        const furnaceInfo = await acquireFurnace();
        if (serial !== commandSerial) return false;
        if (!furnaceInfo) {
            bot.chat(`I could not find, craft, or place a furnace. A furnace needs 8 cobblestone.`);
            return false;
        }

        jobs = planJobs();
        if (jobs.length === 0) {
            bot.chat(`After preparing the furnace I no longer have anything to smelt into ${niceTarget}.`);
            return false;
        }
        const fuel = pickFuel(new Set(jobs.map(j => j.input)), totalCount());
        if (!fuel) {
            bot.chat(`I have run out of fuel while preparing the furnace.`);
            return false;
        }

        let budget = Math.floor(fuel.count * fuel.smelts);
        const requestedTotal = totalCount();
        jobs = jobs.map(j => {
            const count = Math.min(j.count, budget);
            budget -= count;
            return { ...j, count };
        }).filter(j => j.count > 0);
        const plannedTotal = totalCount();

        const fuelNote = plannedTotal < requestedTotal
            ? ` I only have enough ${prettyName(mcData.itemsByName[fuel.name].id)} to smelt ${plannedTotal} of them.`
            : '';
        const seconds = plannedTotal * SMELT_MS_PER_ITEM / 1000;
        bot.chat(`Certainly! Smelting ${plannedTotal} item${plannedTotal === 1 ? '' : 's'} into ${niceTarget} using ${prettyName(mcData.itemsByName[fuel.name].id)} as fuel. This will take about ${Math.ceil(seconds)} seconds.${fuelNote}`);

        const collected = new Map();
        let furnace = null;
        let failure = null;
        let cancelled = false;

        try {
            const pos = furnaceInfo.block.position;
            await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
            furnace = await bot.openFurnace(furnaceInfo.block);
            await collectFurnaceOutput(furnace, collected);

            const maxBatch = Math.max(1, Math.min(64, Math.floor(64 * fuel.smelts)));
            for (const job of jobs) {
                let remaining = job.count;
                while (remaining > 0) {
                    const batch = Math.min(remaining, maxBatch);
                    await runSmeltBatch(furnace, job, batch, fuel, serial, collected);
                    remaining -= batch;
                }
            }
        } catch (err) {
            if (err.cancelled) cancelled = true; else failure = err;
        }

        if (furnace) {
            for (const take of ['takeOutput', 'takeInput', 'takeFuel']) {
                try {
                    const item = await furnace[take]();
                    if (take === 'takeOutput' && item) collected.set(item.name, (collected.get(item.name) || 0) + item.count);
                } catch (e) {}
            }
            try { furnace.close(); } catch (e) {}
        }

        let pickedUp = true;
        if (furnaceInfo.placed) pickedUp = await pickUpFurnace(furnaceInfo.block);

        const summary = [...collected.entries()].map(([name, n]) => `${n} ${prettyName(mcData.itemsByName[name].id)}`).join(', ');
        if (cancelled) {
            bot.chat(summary ? `Understood, I stopped smelting. I collected ${summary}.` : `Understood, I stopped smelting.`);
        } else if (failure) {
            bot.chat(`I ran into a problem while smelting: ${failure.message}.${summary ? ` I did collect ${summary}.` : ''}`);
        } else {
            bot.chat(`Done! I smelted ${summary || 'nothing'}.${furnaceInfo.placed && !pickedUp ? ' I left the furnace I placed here, since I have no pickaxe to collect it.' : ''}`);
        }
        return collected.size > 0;
    }

    // ==========================================
    // 6d. PRECISION MINING & GUARANTEED DROP COLLECTION
    // ==========================================
    const MAX_MINE_QUANTITY = 1024;
    const MAX_EXPLORE_LEGS = 24;

    const PICKAXE_BEST_FIRST = ['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'copper_pickaxe', 'stone_pickaxe', 'golden_pickaxe', 'wooden_pickaxe'];
    const PICKAXE_MIN_FIRST = ['wooden_pickaxe', 'stone_pickaxe', 'copper_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe', 'golden_pickaxe'];

    const MINE_ALIASES = {
        diamond: ['diamond_ore'], coal: ['coal_ore'], iron: ['iron_ore'], raw_iron: ['iron_ore'],
        gold: ['gold_ore'], raw_gold: ['gold_ore'], copper: ['copper_ore'], raw_copper: ['copper_ore'],
        lapis: ['lapis_ore'], lapis_lazuli: ['lapis_ore'], redstone: ['redstone_ore'], emerald: ['emerald_ore'],
        quartz: ['nether_quartz_ore'], nether_quartz: ['nether_quartz_ore'], nether_gold: ['nether_gold_ore'],
        ancient_debris: ['ancient_debris'], debris: ['ancient_debris'], netherite: ['ancient_debris'],
        obsidian: ['obsidian'], stone: ['stone'], cobblestone: ['stone'],
        deepslate: ['deepslate'], cobbled_deepslate: ['deepslate']
    };

    const ORE_Y_HINTS = [
        ['diamond', -58], ['redstone', -58], ['lapis', 0], ['gold', -16], ['iron', 16],
        ['copper', 40], ['coal', 45], ['ancient_debris', 15], ['quartz', 15]
    ];
    const NETHER_ONLY_BLOCKS = new Set(['ancient_debris', 'nether_quartz_ore', 'nether_gold_ore', 'netherrack', 'basalt', 'blackstone']);

    const isInNether = () => String(bot.game?.dimension || '').includes('nether');
    const posKey = (p) => `${p.x},${p.y},${p.z}`;

    function dropItemIds(blockData) {
        const ids = [];
        for (const d of blockData.drops || []) {
            const value = typeof d === 'number' ? d : (typeof d?.drop === 'number' ? d.drop : d?.drop?.id);
            if (typeof value === 'number' && mcData.items[value]) ids.push(value);
        }
        if (ids.length === 0 && mcData.itemsByName[blockData.name]) ids.push(mcData.itemsByName[blockData.name].id);
        return ids;
    }

    function resolveMineTarget(rawName) {
        const base = (rawName || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
        const candidates = [...new Set([
            base, base.replace(/s$/, ''), base.replace(/es$/, ''), base.replace(/_ores?$/, '')
        ])];

        for (const candidate of candidates) {
            let names = MINE_ALIASES[candidate] || (mcData.blocksByName[candidate] ? [candidate] : null);
            if (!names) continue;

            const expanded = new Set();
            for (const n of names) {
                expanded.add(n);
                if (n.endsWith('_ore') && !n.startsWith('deepslate_')) expanded.add(`deepslate_${n}`);
                if (n.startsWith('deepslate_') && n.endsWith('_ore')) expanded.add(n.replace('deepslate_', ''));
            }
            const blockNames = [...expanded].filter(n => mcData.blocksByName[n]);
            if (blockNames.length === 0) continue;

            const blocks = blockNames.map(n => mcData.blocksByName[n]);
            const dropIds = new Set(blocks.flatMap(dropItemIds));
            const hint = ORE_Y_HINTS.find(([word]) => blockNames[0].includes(word));
            return {
                blockNames,
                blockIds: blocks.map(b => b.id),
                dropIds,
                label: dropIds.size ? prettyName([...dropIds][0]) : blockNames[0].replace(/_/g, ' '),
                oreLabel: blockNames[0].replace(/_/g, ' '),
                yHint: hint ? hint[1] : null,
                netherOnly: blockNames.some(n => NETHER_ONLY_BLOCKS.has(n))
            };
        }
        return null;
    }

    function pickaxeNames(harvestTools) {
        return Object.keys(harvestTools || {}).map(id => mcData.items[id]?.name).filter(n => n && n.endsWith('_pickaxe'));
    }

    function blockNeedsPickaxe(blockData) {
        if (/pickaxe|rock|metal/.test(String(blockData.material || ''))) return true;
        return pickaxeNames(blockData.harvestTools).length > 0;
    }

    function canHarvestWith(blockData, item) {
        return !blockData.harvestTools || !!blockData.harvestTools[item.type];
    }

    function bestPickaxeFor(blockData) {
        const owned = bot.inventory.items().filter(i => i.name.endsWith('_pickaxe') && canHarvestWith(blockData, i));
        owned.sort((a, b) => {
            const ra = PICKAXE_BEST_FIRST.indexOf(a.name), rb = PICKAXE_BEST_FIRST.indexOf(b.name);
            return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
        });
        return owned[0] || null;
    }

    function bestOwnedPickaxe() {
        const owned = bot.inventory.items().filter(i => i.name.endsWith('_pickaxe'));
        owned.sort((a, b) => {
            const ra = PICKAXE_BEST_FIRST.indexOf(a.name), rb = PICKAXE_BEST_FIRST.indexOf(b.name);
            return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
        });
        return owned[0] || null;
    }

    function minimumPickaxeName(blockData) {
        if (!blockData.harvestTools) return null;
        const names = pickaxeNames(blockData.harvestTools);
        names.sort((a, b) => {
            const ra = PICKAXE_MIN_FIRST.indexOf(a), rb = PICKAXE_MIN_FIRST.indexOf(b);
            return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
        });
        return names[0] || null;
    }

    const withArticle = (phrase) => `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;

    function verifyPickaxe(req) {
        const blockData = mcData.blocks[req.blockIds[0]];
        const usable = bestPickaxeFor(blockData);
        if (usable) return { ok: true, tool: usable };

        const required = minimumPickaxeName(blockData);
        if (!required) return { ok: true, tool: bestOwnedPickaxe() };

        const requiredNice = required.replace(/_/g, ' ');
        const best = bestOwnedPickaxe();
        let message = best
            ? `My best pickaxe is ${withArticle(best.name.replace(/_/g, ' '))}, but ${req.oreLabel} needs at least ${withArticle(requiredNice)}. Please give me ${withArticle(requiredNice)} or a better one.`
            : `I do not have a pickaxe. Mining ${req.oreLabel} needs at least ${withArticle(requiredNice)}. Please give me one.`;

        const requiredItem = mcData.itemsByName[required];
        if (requiredItem) {
            const plan = ensureItem(requiredItem.id, 1, countInventory());
            if (plan.ok) message += ` Or say "craft ${requiredNice}" and I will make one from what I am carrying.`;
        }
        return { ok: false, message };
    }

    const mlog = (...args) => console.log('[Mining]', ...args);

    const CARDINALS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const JUNK_ITEMS = new Set([
        'cobblestone', 'cobbled_deepslate', 'deepslate', 'stone', 'dirt', 'gravel', 'andesite', 'diorite',
        'granite', 'tuff', 'calcite', 'netherrack', 'dripstone_block', 'pointed_dripstone', 'rotten_flesh', 'spider_eye'
    ]);

    const isLiquidBlock = (b) => !!b && /water|lava/.test(b.name);

    function isNearLava(pos) {
        for (const [dx, dy, dz] of NEIGHBORS) {
            const b = bot.blockAt(pos.offset(dx, dy, dz));
            if (b && b.name === 'lava') return true;
        }
        return false;
    }

    function isNearLiquid(pos) {
        for (const [dx, dy, dz] of NEIGHBORS) {
            if (isLiquidBlock(bot.blockAt(pos.offset(dx, dy, dz)))) return true;
        }
        return false;
    }

    function cancelledError() {
        const err = new Error('cancelled');
        err.cancelled = true;
        return err;
    }

    function combatInterrupt() {
        const err = new Error('combat');
        err.combat = true;
        return err;
    }

    function assertCurrent(serial) {
        if (serial !== commandSerial) throw cancelledError();
    }

    const SAMPLE_POINTS = [
        [0.5, 0.5, 0.5],
        [0.5, 0.2, 0.5], [0.5, 0.8, 0.5],
        [0.2, 0.5, 0.5], [0.8, 0.5, 0.5],
        [0.5, 0.5, 0.2], [0.5, 0.5, 0.8]
    ];

    function getVisiblePointOnBlock(pos) {
        const eye = bot.entity.position.offset(0, bot.entity.height || 1.62, 0);
        const center = pos.offset(0.5, 0.5, 0.5);
        if (eye.distanceTo(center) > 4.35) return null;

        for (const [ox, oy, oz] of SAMPLE_POINTS) {
            try {
                const pt = pos.offset(ox, oy, oz);
                const dist = eye.distanceTo(pt);
                if (dist > 4.4) continue;
                const hit = bot.world.raycast(eye, pt.minus(eye).normalize(), dist + 0.25);
                if (hit && hit.position.x === pos.x && hit.position.y === pos.y && hit.position.z === pos.z) {
                    return pt;
                }
            } catch (e) {}
        }
        return null;
    }

    function canReachAndSee(pos) {
        return getVisiblePointOnBlock(pos) !== null;
    }

    function getBlockingBlock(targetPos) {
        const eye = bot.entity.position.offset(0, bot.entity.height || 1.62, 0);
        const center = targetPos.offset(0.5, 0.5, 0.5);
        const dist = eye.distanceTo(center);
        if (dist > 5.0) return null;
        try {
            const hit = bot.world.raycast(eye, center.minus(eye).normalize(), Math.min(4.35, dist));
            if (!hit || !hit.position) return null;
            if (hit.position.x === targetPos.x && hit.position.y === targetPos.y && hit.position.z === targetPos.z) {
                return null;
            }
            const b = bot.blockAt(hit.position);
            if (!b || !b.diggable || isLiquidBlock(b) || isNearLiquid(b.position)) return null;
            return b;
        } catch (e) {
            return null;
        }
    }

    async function gotoWithTimeout(goal, ms, serial, earlyStopCheck = null) {
        if (serial !== undefined) assertCurrent(serial);
        let timer, watchdog, earlyTimer;
        let lastPos = bot.entity.position.offset(0, 0, 0);
        let lastMove = Date.now();
        let stoppedEarly = false;

        const earlySuccess = new Promise((resolve) => {
            if (!earlyStopCheck) return;
            earlyTimer = setInterval(() => {
                try {
                    if (earlyStopCheck()) {
                        stoppedEarly = true;
                        bot.pathfinder.setGoal(null);
                        resolve();
                    }
                } catch (e) {}
            }, 100);
        });

        const failure = new Promise((_, reject) => {
            timer = setTimeout(() => { bot.pathfinder.setGoal(null); reject(new Error('pathfinding timed out')); }, ms);
            watchdog = setInterval(() => {
                const p = bot.entity.position;
                if (p.distanceTo(lastPos) > 0.35 || bot.targetDigBlock) {
                    lastPos = p.offset(0, 0, 0);
                    lastMove = Date.now();
                } else if (Date.now() - lastMove > 15000) {
                    bot.pathfinder.setGoal(null);
                    reject(new Error('stuck while pathfinding'));
                }
            }, 1000);
        });

        try {
            await Promise.race([
                bot.pathfinder.goto(goal).catch(err => {
                    if (stoppedEarly) return;
                    throw err;
                }),
                earlySuccess,
                failure
            ]);
        } finally {
            clearTimeout(timer);
            clearInterval(watchdog);
            if (earlyTimer) clearInterval(earlyTimer);
        }
        if (serial !== undefined) assertCurrent(serial);
    }

    // Detects dropped item entities reliably across 1.20 / 1.21 without deprecated properties
    const isItemEntity = (e) => {
        if (!e || e === bot.entity || !e.position) return false;
        const n = String(e.name || e.displayName || '').toLowerCase();
        return n === 'item' || n === 'dropped_item' || n === 'item_entity';
    };

    function findNearestOre(req, skipped) {
        const me = bot.entity.position;
        for (const radius of [32, 64, 128]) {
            const positions = bot.findBlocks({ matching: req.blockIds, maxDistance: radius, count: 128 });
            const usable = positions
                .filter(p => !skipped.has(posKey(p)) && !isNearLava(p))
                .sort((a, b) => a.distanceTo(me) - b.distanceTo(me));
            if (usable.length > 0) return usable[0];
        }
        return null;
    }

    async function equipDigTool(blockData) {
        const tool = (blockData && bestPickaxeFor(blockData)) || bestOwnedPickaxe();
        if (tool && bot.heldItem?.type !== tool.type) {
            try { await bot.equip(tool, 'hand'); } catch (e) {}
        }
    }

    let forceConservativeDigTime = false;

    function extractComponentEnchants(item) {
        const extracted = [];
        if (!item) return extracted;
        try {
            const comps = item.components || (item.componentMap ? [...item.componentMap.values()] : []);
            for (const c of comps) {
                if (!c || (c.type !== 'enchantments' && c.type !== 'stored_enchantments')) continue;
                const list = c.data?.enchantments || c.data?.levels || c.value?.enchantments || (Array.isArray(c.data) ? c.data : []);
                if (Array.isArray(list)) {
                    for (const entry of list) {
                        const id = entry.id ?? entry.type;
                        const lvl = entry.level ?? entry.lvl ?? 0;
                        if (lvl <= 0) continue;
                        const enchObj = mcData?.enchantments?.[id];
                        if (enchObj?.name) extracted.push({ name: enchObj.name, lvl });
                    }
                }
            }
        } catch (e) {}
        return extracted;
    }

    function sanitizeItem(item) {
        if (!item) return;
        let fine = false;
        try { fine = Array.isArray(item.enchants); } catch (e) { fine = false; }
        if (fine) return;
        const recovered = extractComponentEnchants(item);
        try { Object.defineProperty(item, 'enchants', { value: recovered, configurable: true, writable: true }); } catch (e) {}
    }

    function installEnchantFix() {
        if (!bot.__enchantListener && bot.inventory && typeof bot.inventory.on === 'function') {
            bot.inventory.on('updateSlot', (slot, oldItem, newItem) => sanitizeItem(newItem));
            bot.__enchantListener = true;
        }
        if (!bot.__digTimePatched && typeof bot.digTime === 'function') {
            const originalDigTime = bot.digTime.bind(bot);
            bot.digTime = (block) => {
                const held = bot.heldItem;
                if (forceConservativeDigTime && block) {
                    const baseTime = block.digTime(
                        held ? held.type : null,
                        bot.game?.gameMode === 'creative',
                        !!bot.entity.isInWater,
                        !bot.entity.onGround,
                        [],
                        bot.entity.effects || {}
                    );
                    return baseTime + 250;
                }
                try {
                    return originalDigTime(block) + 150;
                } catch (err) {
                    if (!/iterable|enchant/i.test(String(err && err.message))) throw err;
                    const enchants = held ? extractComponentEnchants(held) : [];
                    return block.digTime(
                        held ? held.type : null,
                        bot.game?.gameMode === 'creative',
                        !!bot.entity.isInWater,
                        !bot.entity.onGround,
                        enchants,
                        bot.entity.effects || {}
                    ) + 150;
                }
            };
            bot.__digTimePatched = true;
        }
        for (const item of ((bot.inventory && bot.inventory.slots) || [])) sanitizeItem(item);
    }

    let activeMiningJob = null;

    async function digBlock(block, serial) {
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();

        for (let i = 0; i < 8; i++) {
            if (bot.entity.onGround && bot.entity.velocity.norm() < 0.04) break;
            await sleep(50);
        }

        if (bot.targetDigBlock) {
            try { bot.stopDigging(); } catch (e) {}
            await sleep(60);
        }
        assertCurrent(serial);

        const lookPt = getVisiblePointOnBlock(block.position) || block.position.offset(0.5, 0.5, 0.5);
        await bot.lookAt(lookPt, true);

        const wasTarget = activeMiningJob && activeMiningJob.serial === serial && activeMiningJob.req.blockIds.includes(block.type);
        installEnchantFix();

        if (bot.autoEat && typeof bot.autoEat.disable === 'function') {
            try { bot.autoEat.disable(); } catch (e) {}
        }

        try {
            await bot.dig(block, 'ignore');
        } catch (err) {
            if (!/iterable|enchant/i.test(String(err && err.message))) throw err;
            installEnchantFix();
            await bot.dig(block, 'ignore');
        } finally {
            if (bot.autoEat && typeof bot.autoEat.enable === 'function') {
                try { bot.autoEat.enable(); } catch (e) {}
            }
        }

        if (wasTarget) activeMiningJob.minedBlocks++;
    }

    async function dropJunk(job) {
        if (bot.inventory.emptySlotCount() > 4) return;
        const junk = bot.inventory.items().filter(i => JUNK_ITEMS.has(i.name) && !job.keepIds.has(i.type));
        if (junk.length === 0) return;
        try {
            await bot.look(bot.entity.yaw + Math.PI, 0, true);
            for (const item of junk) await bot.toss(item.type, null, item.count);
        } catch (e) {}
    }

    function countJobDrops(job) {
        return job.dropNames.reduce((sum, n) => sum + countByName(n), 0);
    }

    // Physically walks toward `targetVec` (hugging a wall pocket or stepping onto a dropped item)
    // while checking that the floor ahead is safe. Stops immediately once `stopWhen()` is true.
    async function walkCloseToPoint(targetVec, serial, durationMs, stopWhen) {
        bot.pathfinder.setGoal(null);
        const start = Date.now();
        try {
            while (Date.now() - start < durationMs) {
                assertCurrent(serial);
                if (stopWhen && stopWhen()) return true;

                const myPos = bot.entity.position;
                const dx = targetVec.x - myPos.x;
                const dz = targetVec.z - myPos.z;
                const horizDist = Math.hypot(dx, dz);
                if (horizDist < 0.45) break;

                // Safety check: don't walk into lava or a deep pit
                const stepAhead = myPos.offset((dx / horizDist) * 0.8, 0, (dz / horizDist) * 0.8).floored();
                const floor = bot.blockAt(stepAhead.offset(0, -1, 0));
                const belowFloor = bot.blockAt(stepAhead.offset(0, -2, 0));
                if (isLiquidBlock(floor) || isLiquidBlock(belowFloor)) break;

                await bot.lookAt(targetVec, true);
                bot.setControlState('forward', true);
                // Jump if the item/ledge is 1 block higher and there is headroom
                const headBlock = bot.blockAt(stepAhead.offset(0, 1, 0));
                const aboveHead = bot.blockAt(myPos.floored().offset(0, 2, 0));
                const canJumpUp = targetVec.y > myPos.y + 0.5 &&
                    (!headBlock || headBlock.boundingBox === 'empty') &&
                    (!aboveHead || aboveHead.boundingBox === 'empty');
                bot.setControlState('jump', canJumpUp);

                await sleep(50);
            }
        } finally {
            bot.setControlState('forward', false);
            bot.setControlState('jump', false);
        }
        return !!(stopWhen && stopWhen());
    }

    const COLLECT_BUDGET_MS = 5500;

    // Guaranteed drop collection:
    // 1. Waits a moment for the server to spawn the item entity
    // 2. Physically walks right up to the broken block (`walkCloseToPoint`) so wall-pocket drops get pulled in
    // 3. If the ore was in a 1x1 elevated wall cubbyhole (like y=-8 while standing at y=-9) and the drop is
    //    sitting on the ledge block below `pos`, mines the ledge block (`pos.offset(0, -1, 0)`) so the drop
    //    falls to floor level and the bot can walk into the space
    // 4. Chases any remaining nearby item entity with `GoalNear(..., 0)` + direct steering
    async function collectAt(pos, job, before) {
        if (job.creative) return;

        const center = pos.offset(0.5, 0.3, 0.5);
        const deadline = Date.now() + COLLECT_BUDGET_MS;
        const timeLeft = () => Math.max(400, deadline - Date.now());
        const gotDrop = () => countJobDrops(job) > before;

        // Wait briefly for the server to spawn the item drop or auto-pickup at point-blank range
        for (let i = 0; i < 4; i++) {
            if (gotDrop()) {
                job.itemsCollected += countJobDrops(job) - before;
                return;
            }
            await sleep(60);
        }

        // Step 1: Physically walk straight toward `pos` to hug the wall / step into the pocket
        await walkCloseToPoint(center, job.serial, 850, gotDrop);
        if (gotDrop()) {
            job.itemsCollected += countJobDrops(job) - before;
            return;
        }

        // Step 2: If `pos` was elevated above the bot's feet (a 1x1 cubbyhole in the wall) and a solid ledge
        // block underneath `pos` is trapping the item out of reach, break the ledge block so the item drops down!
        const myFeetY = Math.floor(bot.entity.position.y);
        if (!gotDrop() && pos.y > myFeetY) {
            const ledgePos = pos.offset(0, -1, 0);
            const ledgeBlock = bot.blockAt(ledgePos);
            if (ledgeBlock && ledgeBlock.boundingBox === 'block' && ledgeBlock.diggable && !isNearLiquid(ledgePos)) {
                mlog('clearing cubbyhole ledge under ore at', posKey(ledgePos), 'to release drop');
                await equipDigTool(mcData.blocks[ledgeBlock.type]);
                try {
                    await digBlock(ledgeBlock, job.serial);
                } catch (e) {
                    if (e.cancelled) throw e;
                }
                await walkCloseToPoint(ledgePos.offset(0.5, 0.3, 0.5), job.serial, 900, gotDrop);
            }
        }

        if (gotDrop()) {
            job.itemsCollected += countJobDrops(job) - before;
            return;
        }

        // Step 3: Chase the exact coordinates (`GoalNear(..., 0)`) of any dropped item entity near `pos`
        bot.pathfinder.setMovements(job.moves.dig);
        while (!gotDrop() && Date.now() < deadline) {
            assertCurrent(job.serial);
            if (currentThreat) break;

            const drop = bot.nearestEntity(e => isItemEntity(e) && e.position.distanceTo(center) <= 6);
            if (!drop) {
                // One more step into `pos` in case the entity packet already despawned on pickup
                await walkCloseToPoint(center, job.serial, 500, gotDrop);
                break;
            }

            // First steer directly toward the drop
            await walkCloseToPoint(drop.position, job.serial, 700, gotDrop);
            if (gotDrop()) break;

            // If still not picked up, pathfind to exact block of the drop (`range = 0`)
            try {
                await gotoWithTimeout(
                    new goals.GoalNear(Math.floor(drop.position.x), Math.floor(drop.position.y), Math.floor(drop.position.z), 0),
                    Math.min(2000, timeLeft()),
                    job.serial,
                    gotDrop
                );
            } catch (e) {
                if (e.cancelled) throw e;
                break;
            }
            await sleep(100);
        }

        const after = countJobDrops(job);
        const gained = after - before;
        if (gained > 0) {
            job.itemsCollected += gained;
        } else {
            mlog('warning: broke the block at', posKey(pos), 'but could not confirm picking up a drop there');
        }
    }

    async function digCell(pos, serial) {
        for (let attempt = 0; attempt < 5; attempt++) {
            assertCurrent(serial);
            const block = bot.blockAt(pos);
            if (!block || isLiquidBlock(block)) return false;
            if (block.boundingBox === 'empty') return true;
            if (!block.diggable || isNearLiquid(pos)) return false;
            await equipDigTool(mcData.blocks[block.type]);
            try {
                await digBlock(block, serial);
            } catch (e) {
                assertCurrent(serial);
                await sleep(150);
            } finally {
                forceConservativeDigTime = false;
            }
            const check = bot.blockAt(pos);
            if (check && check.boundingBox === 'empty') return true;
            forceConservativeDigTime = true;
        }
        forceConservativeDigTime = false;
        const after = bot.blockAt(pos);
        return !!after && after.boundingBox === 'empty' && !isLiquidBlock(after);
    }

    async function walkInto(cell, serial, jump) {
        const cx = cell.x + 0.5, cz = cell.z + 0.5;
        await bot.lookAt(cell.offset(0.5, 0.5, 0.5), true);
        bot.setControlState('forward', true);
        if (jump) bot.setControlState('jump', true);
        try {
            const started = Date.now();
            while (Date.now() - started < 2500) {
                await sleep(50);
                assertCurrent(serial);
                const p = bot.entity.position;
                if (Math.hypot(p.x - cx, p.z - cz) < 0.35) break;
            }
        } finally {
            bot.setControlState('forward', false);
            bot.setControlState('jump', false);
        }
        await sleep(150);
        const p = bot.entity.position.floored();
        return p.x === cell.x && p.z === cell.z;
    }

    async function tunnelStep(dx, dz, dy, job) {
        const here = bot.entity.position.floored();
        const front = here.offset(dx, 0, dz);
        const landing = front.offset(0, dy, 0);

        const landingKey = posKey(landing);
        if ((job.visits.get(landingKey) || 0) >= 2) return false;

        const floor = bot.blockAt(landing.offset(0, -1, 0));
        if (!floor || floor.boundingBox !== 'block' || isLiquidBlock(floor)) return false;

        const cells = dy === 0 ? [front.offset(0, 1, 0), front]
            : dy < 0 ? [front.offset(0, 1, 0), front, front.offset(0, -1, 0)]
            : [here.offset(0, 2, 0), front.offset(0, 1, 0), front.offset(0, 2, 0)];

        for (const cell of cells) {
            if (!(await digCell(cell, job.serial))) return false;
        }
        const arrived = await walkInto(landing, job.serial, dy > 0);
        if (arrived) job.visits.set(landingKey, (job.visits.get(landingKey) || 0) + 1);
        return arrived;
    }

    async function clearLineOfSight(targetPos, serial, maxBlocks = 4) {
        for (let i = 0; i < maxBlocks; i++) {
            assertCurrent(serial);
            if (canReachAndSee(targetPos)) return true;
            const blocker = getBlockingBlock(targetPos);
            if (!blocker) return false;
            mlog('clearing obstructing', blocker.name, 'at', posKey(blocker.position));
            if (!(await digCell(blocker.position, serial))) return false;
            await sleep(60);
        }
        return canReachAndSee(targetPos);
    }

    async function digToward(target, job, maxSteps = 160) {
        let fails = 0;
        let best = Infinity;
        let sinceBest = 0;

        for (let step = 0; step < maxSteps; step++) {
            assertCurrent(job.serial);
            while (currentThreat) { await sleep(500); assertCurrent(job.serial); }

            const currentBlock = bot.blockAt(target);
            if (!currentBlock || !job.req.blockIds.includes(currentBlock.type)) return true;
            if (canReachAndSee(target)) return true;
            if (bot.entity.position.distanceTo(target.offset(0.5, 0.5, 0.5)) <= 4.35) {
                if (await clearLineOfSight(target, job.serial, 3)) return true;
            }

            if (step % 8 === 7) await dropJunk(job);

            const here = bot.entity.position.floored();
            const dist = here.distanceTo(target);
            if (dist < best - 0.5) { best = dist; sinceBest = 0; }
            else if (++sinceBest > 30) { mlog('digToward: no progress, giving up'); return false; }

            const dxT = target.x - here.x, dzT = target.z - here.z, dyT = target.y - here.y;
            let dir = Math.abs(dxT) >= Math.abs(dzT) ? [Math.sign(dxT), 0] : [0, Math.sign(dzT)];
            if (dir[0] === 0 && dir[1] === 0) dir = CARDINALS[job.heading % 4];
            const wantDy = dyT <= -2 ? -1 : (dyT >= 2 ? 1 : 0);

            const base = CARDINALS.findIndex(c => c[0] === dir[0] && c[1] === dir[1]);
            const attempts = [];
            for (const turn of [0, 1, 3]) {
                const [ax, az] = CARDINALS[(base + turn) % 4];
                attempts.push([ax, az, wantDy]);
                if (wantDy !== 0) attempts.push([ax, az, 0]);
            }

            let moved = false;
            for (const [ax, az, ay] of attempts) {
                if (await tunnelStep(ax, az, ay, job)) {
                    moved = true;
                    job.heading = CARDINALS.findIndex(c => c[0] === ax && c[1] === az);
                    break;
                }
            }
            if (!moved && ++fails > 3) return false;
        }
        return false;
    }

    async function digDown(job) {
        const goalY = Math.max(job.req.yHint, -58);
        let stuck = 0;
        for (let i = 0; i < 30; i++) {
            assertCurrent(job.serial);
            while (currentThreat) { await sleep(500); assertCurrent(job.serial); }
            if (Math.floor(bot.entity.position.y) <= goalY) return true;
            if (i > 0 && i % 6 === 0) {
                if (findNearestOre(job.req, job.skipped)) return true;
                await dropJunk(job);
            }
            const [dx, dz] = CARDINALS[job.heading % 4];
            if (await tunnelStep(dx, dz, -1, job)) { stuck = 0; continue; }
            job.heading++;
            if (++stuck > 6) return false;
        }
        return true;
    }

    async function tunnelLeg(job, length) {
        let stuck = 0;
        for (let i = 0; i < length; i++) {
            assertCurrent(job.serial);
            while (currentThreat) { await sleep(500); assertCurrent(job.serial); }
            if (i > 0 && i % 6 === 0) {
                if (findNearestOre(job.req, job.skipped)) return true;
                await dropJunk(job);
            }
            const [dx, dz] = CARDINALS[job.heading % 4];
            if (await tunnelStep(dx, dz, 0, job)) { stuck = 0; continue; }
            job.heading++;
            if (++stuck > 4) return false;
        }
        job.heading++;
        return true;
    }

    async function exploreForOre(job) {
        const req = job.req;
        if (job.legs >= MAX_EXPLORE_LEGS) return false;
        job.legs++;
        const y = Math.floor(bot.entity.position.y);

        if (req.yHint !== null && y > req.yHint + 6) {
            if (!job.announcedDigDown) {
                job.announcedDigDown = true;
                bot.chat(`I cannot see any ${req.oreLabel} nearby. I will dig down toward y=${req.yHint}, where it is most common.`);
            }
            const ok = await digDown(job);
            if (!ok && ++job.downFails >= 3) {
                job.failReason = 'I could not dig down safely (lava, water or caves in the way)';
                return false;
            }
            return true;
        }

        if (!job.announcedSearch) {
            job.announcedSearch = true;
            bot.chat(`Searching underground for ${req.oreLabel}.`);
        }
        await tunnelLeg(job, 14 + Math.min(job.legs, 12) * 2);
        return true;
    }

    async function pathToOre(targetPos, job) {
        await equipDigTool(mcData.blocks[job.req.blockIds[0]]);
        bot.pathfinder.setMovements(job.moves.dig);
        const goal = new goals.GoalGetToBlock(targetPos.x, targetPos.y, targetPos.z);

        let status = 'unknown';
        try { status = bot.pathfinder.getPathTo(job.moves.dig, goal, 1500).status; } catch (e) {}
        mlog('path status:', status);

        if (status === 'noPath' || status === 'partial') {
            return false;
        }

        try {
            await gotoWithTimeout(goal, 60000, job.serial, () => canReachAndSee(targetPos));
            return canReachAndSee(targetPos);
        } catch (e) {
            if (e.cancelled) throw e;
            if (currentThreat) throw combatInterrupt();
            mlog('pathfinder failed:', e.message);
            return canReachAndSee(targetPos);
        }
    }

    async function digUntilBroken(pos, req, serial, maxAttempts = 4) {
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            assertCurrent(serial);
            const block = bot.blockAt(pos);
            if (!block || !req.blockIds.includes(block.type)) return true;

            if (!canReachAndSee(pos)) {
                const cleared = await clearLineOfSight(pos, serial, 3);
                if (!cleared) return false;
            }

            await equipDigTool(mcData.blocks[req.blockIds[0]]);
            try {
                await digBlock(block, serial);
            } catch (e) {
                if (e.cancelled) throw e;
                if (currentThreat) throw combatInterrupt();
                mlog(`dig attempt ${attempt}/${maxAttempts} failed: ${e.message}`);
                await sleep(150 * attempt);
                continue;
            } finally {
                forceConservativeDigTime = false;
            }

            await sleep(100);
            const after = bot.blockAt(pos);
            if (!after || !req.blockIds.includes(after.type)) return true;

            forceConservativeDigTime = true;
            mlog(`dig attempt ${attempt}/${maxAttempts}: block still standing, retrying with conservative server timing`);
            await sleep(100);
        }
        forceConservativeDigTime = false;
        return false;
    }

    function failTarget(job, key, why) {
        const n = (job.fails.get(key) || 0) + 1;
        job.fails.set(key, n);
        if (n >= 2) job.skipped.add(key);
        mlog('could not mine', key, '-', why, `(attempt ${n})`);
        return 'skipped';
    }

    async function mineBlockAt(pos, job) {
        const { req, serial } = job;
        const key = posKey(pos);
        // Record drop count BEFORE approaching/clearing so if the ore breaks during approach,
        // we still collect and count the drop!
        const before = job.creative ? 0 : countJobDrops(job);

        try {
            if (!canReachAndSee(pos)) {
                if (bot.entity.position.distanceTo(pos.offset(0.5, 0.5, 0.5)) <= 4.35) {
                    await clearLineOfSight(pos, serial, 3);
                }
                const stillThere1 = bot.blockAt(pos);
                if (stillThere1 && req.blockIds.includes(stillThere1.type) && !canReachAndSee(pos)) {
                    let arrived = await pathToOre(pos, job);
                    if (!arrived && !canReachAndSee(pos)) {
                        await clearLineOfSight(pos, serial, 3);
                    }
                    const stillThere2 = bot.blockAt(pos);
                    if (stillThere2 && req.blockIds.includes(stillThere2.type) && !canReachAndSee(pos)) {
                        assertCurrent(serial);
                        arrived = await digToward(pos, job);
                    }
                    const stillThere3 = bot.blockAt(pos);
                    if (stillThere3 && req.blockIds.includes(stillThere3.type) && !canReachAndSee(pos)) {
                        await clearLineOfSight(pos, serial, 3);
                    }
                }
            }

            const block = bot.blockAt(pos);
            if (block && req.blockIds.includes(block.type)) {
                if (!canReachAndSee(pos)) return failTarget(job, key, 'obstructed or out of reach');
                const broke = await digUntilBroken(pos, req, serial);
                if (!broke) return failTarget(job, key, 'the block would not break after several tries');
            }

            // Always run `collectAt` once the target block is broken
            await collectAt(pos, job, before);
            return 'mined';
        } catch (e) {
            if (e.cancelled) throw e;
            if (e.combat || currentThreat) return 'combat';
            return failTarget(job, key, e.message);
        }
    }

    async function handleMineCommand(itemName, quantity, sender) {
        const serial = commandSerial;
        await mineSmart(itemName, quantity);
        resetIfCurrent(serial);
    }

    async function mineSmart(itemName, quantity = 1) {
        const serial = commandSerial;
        quantity = Math.max(1, Math.min(MAX_MINE_QUANTITY, quantity || 1));

        const req = resolveMineTarget(itemName);
        if (!req) {
            bot.chat(`I apologize, but I do not know how to mine "${(itemName || 'that').replace(/_/g, ' ')}".`);
            return false;
        }
        if (!blockNeedsPickaxe(mcData.blocks[req.blockIds[0]])) {
            bot.chat(`${req.oreLabel} is not something I mine with a pickaxe. I can mine ores, stone, obsidian and similar blocks.`);
            return false;
        }

        installEnchantFix();

        const gameMode = bot.game?.gameMode;
        if (gameMode === 'spectator' || gameMode === 'adventure') {
            bot.chat(`I cannot break blocks in ${gameMode} mode.`);
            return false;
        }
        const creative = gameMode === 'creative';

        let toolNote = '';
        if (!creative) {
            const check = verifyPickaxe(req);
            if (!check.ok) {
                bot.chat(check.message);
                return false;
            }
            toolNote = check.tool ? `I will use my ${check.tool.name.replace(/_/g, ' ')}. ` : '';
        }

        const dropNames = [...req.dropIds].map(id => mcData.items[id]?.name).filter(Boolean);

        const savedMovements = bot.pathfinder.movements;
        const digMove = new Movements(bot, mcData);
        digMove.canDig = true;
        digMove.allowParkour = false;
        const walkMove = new Movements(bot, mcData);
        walkMove.canDig = false;
        walkMove.allowParkour = false;

        const job = {
            serial, req, creative, dropNames,
            skipped: new Set(), fails: new Map(), visits: new Map(),
            minedBlocks: 0, itemsCollected: 0, heading: 0, legs: 0, downFails: 0, failReason: null,
            keepIds: req.dropIds,
            announcedDigDown: false, announcedSearch: false, announcedFound: false,
            moves: { dig: digMove, walk: walkMove }
        };
        const collected = () => (creative ? job.minedBlocks : job.itemsCollected);
        activeMiningJob = job;

        bot.chat(`Certainly! ${toolNote}Mining ${quantity} ${req.label} now.${creative ? ' Creative mode drops no items, so I will count the blocks I break.' : ''}`);
        mlog(`job: ${quantity} x ${req.label} (${req.blockNames.join(', ')}) | mode=${gameMode} | creative=${creative}`);

        const reportEvery = Math.max(4, Math.ceil(quantity / 4));
        let lastReported = 0;
        let consecutiveSkips = 0;
        let idleLoops = 0;
        let stopReason = null;
        let cancelled = false;

        try {
            while (collected() < quantity) {
                assertCurrent(serial);
                isBusyWithCommand = true;

                if (currentThreat) { await sleep(500); continue; }

                if (++idleLoops > 40) { stopReason = 'I got stuck and could not make any more progress'; break; }

                await dropJunk(job);
                if (bot.inventory.emptySlotCount() === 0) { stopReason = 'my inventory is full'; break; }

                if (!creative) {
                    const recheck = verifyPickaxe(req);
                    if (!recheck.ok) { stopReason = recheck.message; break; }
                }

                const target = findNearestOre(req, job.skipped);
                if (!target) {
                    if (req.netherOnly && !isInNether()) {
                        stopReason = `${req.oreLabel} only generates in the Nether`;
                        break;
                    }
                    const moved = await exploreForOre(job);
                    if (!moved) { stopReason = job.failReason || `I searched for a long time but could not find any more ${req.oreLabel}`; break; }
                    continue;
                }

                if (!job.announcedFound) {
                    job.announcedFound = true;
                    bot.chat(`I can see ${req.oreLabel} about ${Math.round(target.distanceTo(bot.entity.position))} blocks away. Heading there.`);
                }
                mlog('target', posKey(target), `dist=${target.distanceTo(bot.entity.position).toFixed(1)}`);

                const result = await mineBlockAt(target, job);
                if (result === 'combat') continue;
                if (result === 'skipped') {
                    if (++consecutiveSkips >= 12) { stopReason = `I could not reach the ${req.oreLabel} I found`; break; }
                    continue;
                }

                consecutiveSkips = 0;
                idleLoops = 0;
                job.legs = 0;

                if (collected() - lastReported >= reportEvery && collected() < quantity) {
                    lastReported = collected();
                    bot.chat(`Progress: ${Math.min(collected(), quantity)}/${quantity} ${req.label}.`);
                }
            }
        } catch (err) {
            if (err.cancelled) cancelled = true; else stopReason = err.message;
        } finally {
            if (activeMiningJob === job) activeMiningJob = null;
            forceConservativeDigTime = false;
            bot.pathfinder.setMovements(savedMovements);
            if (serial === commandSerial) {
                bot.clearControlStates();
                try { bot.stopDigging(); } catch (e) {}
            }
        }

        const total = collected();
        const unit = creative ? `${req.oreLabel} block${total === 1 ? '' : 's'}` : req.label;
        if (cancelled) {
            bot.chat(`Understood, I stopped mining. I collected ${total} ${unit}.`);
        } else if (total >= quantity) {
            bot.chat(`Done! I mined ${total} ${unit}.`);
        } else {
            bot.chat(`I stopped after collecting ${total} of ${quantity} ${unit}: ${stopReason || 'something went wrong'}.`);
        }
        return total > 0;
    }

    // ==========================================
    // 7. AUTO-EQUIP, OFFHAND & RESET STATE
    // ==========================================
    async function autoEquipBestArmor() {
        const slots = [
            { slot: 'head', items: ['netherite_helmet', 'diamond_helmet', 'iron_helmet', 'golden_helmet', 'leather_helmet'] },
            { slot: 'torso', items: ['netherite_chestplate', 'diamond_chestplate', 'iron_chestplate', 'golden_chestplate', 'leather_chestplate'] },
            { slot: 'legs', items: ['netherite_leggings', 'diamond_leggings', 'iron_leggings', 'golden_leggings', 'leather_leggings'] },
            { slot: 'feet', items: ['netherite_boots', 'diamond_boots', 'iron_boots', 'golden_boots', 'leather_boots'] }
        ];

        for (const { slot, items } of slots) {
            for (const armor of items) {
                const item = bot.inventory.items().find(i => i.name === armor);
                if (item) {
                    try {
                        await bot.equip(item, slot);
                        break;
                    } catch (e) {}
                }
            }
        }
        
        // PRIORITY OFFHAND SYSTEM (Totem of Undying overrides Shield)
        const totem = bot.inventory.items().find(i => i.name === 'totem_of_undying');
        const shield = bot.inventory.items().find(i => i.name === 'shield');
        
        try {
            if (totem) {
                await bot.equip(totem, 'off-hand');
            } else if (shield) {
                await bot.equip(shield, 'off-hand');
            }
        } catch (e) {}
    }

    async function equipBestWeapon() {
        const weaponTiers = [
            'netherite_sword', 'netherite_axe', 'diamond_sword', 'diamond_axe',
            'iron_sword', 'iron_axe', 'stone_sword', 'stone_axe',
            'golden_sword', 'golden_axe', 'wooden_sword', 'wooden_axe'
        ];
        for (const weaponName of weaponTiers) {
            const item = bot.inventory.items().find(i => i.name === weaponName);
            if (item) {
                try { await bot.equip(item, 'hand'); return; } catch (e) {}
            }
        }
    }

    function resetIfCurrent(serial) {
        if (serial === commandSerial) return resetBotState();
    }

    async function resetBotState() {
        isBusyWithCommand = false;
        if (bot.pathfinder) bot.pathfinder.setGoal(null);
        await autoEquipBestArmor();
    }
}

// Start the bot sequence
startBot();