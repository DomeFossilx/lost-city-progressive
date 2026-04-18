import {
    BotTask, Player, Npc,
    walkTo, interactNpc, countItem,
    isNear, getBaseLevel, PlayerStat,
    bankInvId, StuckDetector, ProgressWatchdog, advanceBankWalk,
    teleportNear, randInt, findNpcByName, Items
} from '#/engine/bot/tasks/BotTaskBase.js';
import type { SkillStep } from '#/engine/bot/tasks/BotTaskBase.js';
import { getNpcCombatLevel, findAggressorNpc } from '#/engine/bot/BotAction.js';

const HP_SAFE_THRESHOLD = 15;

export class PickpocketTask extends BotTask {
    private step: SkillStep;
    private state: 'VALIDATE' | 'POSITION' | 'INTERACT' | 'bank_walk' | 'bank_done' | 'flee' = 'VALIDATE';
    private lastXp = 0;
    private lastHp = 0;
    private approachTicks = 0;
    private stunTicks = 0;
    private currentTarget: Npc | null = null;

    private readonly targetNpcName: string;
    private readonly ACTION_DELAY = 2;

    private readonly stuck = new StuckDetector(30, 4, 2);
    private readonly watchdog = new ProgressWatchdog();

    constructor(step: SkillStep) {
        super('Pickpocket');
        this.step = step;
        this.targetNpcName = step.extra?.npcName as string;
    }

    private debug(player: Player, message: string): void {
        console.log(`[Pickpocket][${player.username}][${this.state}] ${message}`);
    }

    shouldRun(player: Player): boolean {
        if (getBaseLevel(player, PlayerStat.THIEVING) < this.step.minLevel) return false;

        const hp = player.stats[PlayerStat.HITPOINTS];
        if (hp < HP_SAFE_THRESHOLD) {
            this.debug(player, `not starting: HP too low (${hp})`);
            return false;
        }

        return true;
    }

    isComplete(_player: Player): boolean {
        return false;
    }

    tick(player: Player): void {
        if (this.interrupted) return;

        const banking = this.state === 'bank_walk' || this.state === 'bank_done';
        if (this.watchdog.check(player, banking)) { this.interrupt(); return; }

        if (this.cooldown > 0) {
            this.cooldown--;
            return;
        }

        // --- STUN CHECK ---
        if (this.lastHp > 0) {
            const currentHp = player.stats[PlayerStat.HITPOINTS];
            const hpDrop = this.lastHp - currentHp;

            if (hpDrop > 0 && this.lastXp === player.stats[PlayerStat.THIEVING]) {
                this.debug(player, `HP dropped by ${hpDrop} without XP gain - stunned!`);
                this.state = 'flee';
                this.stunTicks = 0;
                this.lastHp = 0;
                this.cooldown = 5; // Stun duration approx
                return;
            }

            this.lastHp = 0;
        }

        // --- DANGER HP CHECK ---
        const hp = player.stats[PlayerStat.HITPOINTS];
        if (hp < HP_SAFE_THRESHOLD && this.state !== 'flee' && this.state !== 'bank_walk' && this.state !== 'bank_done') {
            this.debug(player, `HP low (${hp}); banking to recover`);
            this.state = 'bank_walk';
            return;
        }

        // --- AGGRESSOR DETECTION ---
        if (this.state !== 'bank_walk' && this.state !== 'bank_done' && this.state !== 'flee') {
            const aggressor = findAggressorNpc(player, 8);
            if (aggressor) {
                const npcLvl = getNpcCombatLevel(aggressor);
                if (npcLvl > player.combatLevel) {
                    this.debug(player, 'aggressor attacking; fleeing');
                    this.state = 'flee';
                    this.stunTicks = 0;
                    return;
                }
            }
        }

        // --- VALIDATE ---
        if (this.state === 'VALIDATE') {
            if (getBaseLevel(player, PlayerStat.THIEVING) < this.step.minLevel) {
                this.interrupt();
                return;
            }
            this.state = 'POSITION';
            return;
        }

        // --- FLEE ---
        if (this.state === 'flee') {
            const [lx, lz] = [player.x - 5, player.z - 5];
            walkTo(player, lx, lz);
            this.stunTicks++;
            if (this.stunTicks > 5) {
                this.state = 'VALIDATE';
            }
            return;
        }

        if (this.state === 'bank_walk') {
            const result = advanceBankWalk(player, this.stuck);
            if (result === 'walk') return;
            this.cooldown = result === 'ready' ? 3 : 0;
            this.state = 'bank_done';
            return;
        }

        if (this.state === 'bank_done') {
            // No loot to deposit usually, pickpocket adds coins directly or into notes
            this.state = 'VALIDATE';
            return;
        }

        // --- POSITION ---
        if (this.state === 'POSITION') {
            const npc = findNpcByName(player.x, player.z, player.level, this.targetNpcName, 20);
            if (!npc) {
                const [sx, sz] = this.step.location;
                if (!isNear(player, sx, sz, 15)) {
                    this._stuckWalk(player, sx, sz);
                    return;
                }
                this.approachTicks++;
                if (this.approachTicks > 10) {
                    this.debug(player, `Could not find ${this.targetNpcName}.`);
                    this.interrupt();
                }
                return;
            }

            this.approachTicks = 0;
            this.currentTarget = npc;

            if (!isNear(player, npc.x, npc.z, 1)) {
                walkTo(player, npc.x, npc.z);
                return;
            }

            this.state = 'INTERACT';
            return;
        }

        // --- INTERACT ---
        if (this.state === 'INTERACT') {
            if (!this.currentTarget || !this.currentTarget.isValid()) {
                this.state = 'VALIDATE';
                return;
            }

            if (!isNear(player, this.currentTarget.x, this.currentTarget.z, 2)) {
                this.state = 'POSITION';
                return;
            }

            this.lastHp = player.stats[PlayerStat.HITPOINTS];
            interactNpc(player, this.currentTarget);
            this.lastXp = player.stats[PlayerStat.THIEVING];
            this.watchdog.notifyActivity();
            this.cooldown = this.ACTION_DELAY;
            this.state = 'VALIDATE';
            return;
        }
    }

    reset(): void {
        super.reset();
        this.state = 'VALIDATE';
        this.lastXp = 0;
        this.lastHp = 0;
        this.stunTicks = 0;
        this.approachTicks = 0;
        this.currentTarget = null;
        this.stuck.reset();
        this.watchdog.reset();
    }

    private _stuckWalk(player: Player, lx: number, lz: number): void {
        if (!this.stuck.check(player, lx, lz)) {
            walkTo(player, lx, lz);
            return;
        }
        if (this.stuck.desperatelyStuck) {
            teleportNear(player, lx, lz);
            this.stuck.reset();
            return;
        }
        const wx = player.x + randInt(-5, 5);
        const wz = player.z + randInt(-5, 5);
        walkTo(player, wx, wz);
    }
}
