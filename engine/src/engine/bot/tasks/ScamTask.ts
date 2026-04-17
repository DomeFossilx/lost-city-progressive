import {
    BotTask, Player, walkTo, isNear, Locations, randInt, bankInvId,
} from '#/engine/bot/tasks/BotTaskBase.js';

const SCAM_PHRASES = [
    "Flash2: Doubling money! Trade me!",
    "Flash1: Trimming armor for free! Just trade me!",
    "cyan: Selling rare black lobster 1m! Limited stock!",
    "wave: Doubling all coins! 2 trades!",
    "Buying all burnt fish 100gp each!",
    "cyan: Selling rare burnt bones! Collectors item!",
    "Trimming rune platebodies for free!",
    "Follow me for a drop party at the party room!",
    "Doubling money! Legit! See my forums thread!",
    "Selling dragon scimitar 100k! Trade me fast!"
];

export class ScamTask extends BotTask {
    private state: 'walk' | 'scam' = 'walk';
    private ticksInState = 0;
    private targetLoc: [number, number, number];

    constructor() {
        super('Scam');
        // Pick a busy location: Varrock West Bank or Draynor Bank
        this.targetLoc = Math.random() < 0.5 ? Locations.VARROCK_WEST_BANK : Locations.DRAYNOR_BANK;
    }

    shouldRun(_player: Player): boolean {
        return true;
    }

    tick(player: Player): void {
        if (this.interrupted) return;
        this.ticksInState++;

        if (this.state === 'walk') {
            if (isNear(player, this.targetLoc[0], this.targetLoc[1], 3, this.targetLoc[2])) {
                this.state = 'scam';
                this.ticksInState = 0;
                return;
            }
            walkTo(player, this.targetLoc[0], this.targetLoc[1]);
            return;
        }

        if (this.state === 'scam') {
            if (this.ticksInState % 10 === 0) {
                const phrase = SCAM_PHRASES[Math.floor(Math.random() * SCAM_PHRASES.length)];
                player.say(phrase);
            }

            // After some time, finish "scamming" or move to another spot
            if (this.ticksInState > 200) {
                this.state = 'walk';
                this.targetLoc = this.targetLoc === Locations.VARROCK_WEST_BANK ? Locations.DRAYNOR_BANK : Locations.VARROCK_WEST_BANK;
                this.ticksInState = 0;
            }
        }
    }

    isComplete(_player: Player): boolean {
        // Scammers never stop scamming, but we let the planner rotate
        return false;
    }

    override reset(): void {
        super.reset();
        this.state = 'walk';
        this.ticksInState = 0;
    }
}
