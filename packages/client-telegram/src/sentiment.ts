import { redis } from './redis';
import { Context, Telegraf } from "telegraf";

interface SentimentUpdate {
    timestamp: number;
    count: number;
    tweets: {
        author: string;
        text: string;
        analysis: {
            score: number;
            credibilityScore: number;
        };
    }[];
}

export class SentimentService {
    private bot: Telegraf<Context>;
    private privateGroupId: string;

    constructor(bot: Telegraf<Context>) {
        this.bot = bot;
        this.privateGroupId = process.env.PRIVATE_GROUP_ID?.toString() || '';
        if (!this.privateGroupId) {
            console.warn('PRIVATE_GROUP_ID not set for sentiment updates');
        }
        this.setupSubscriber();
    }

    private setupSubscriber() {
        redis.subscribe("sentiment:updates");
        redis.on("message", async (channel, message) => {
            if (channel === "sentiment:updates") {
                try {
                    const update: SentimentUpdate = JSON.parse(message);
                    await this.broadcastUpdate(update);
                } catch (error) {
                    console.error("Error processing sentiment update:", error);
                }
            }
        });
    }

    private async broadcastUpdate(update: SentimentUpdate) {
        if (update.count === 0 || !this.privateGroupId) return;

        const message = this.formatUpdateMessage(update);

        try {
            const formattedGroupId = this.privateGroupId.startsWith('-100')
              ? this.privateGroupId
              : `-100${this.privateGroupId.replace('-', '')}`;

            await this.bot.telegram.sendMessage(formattedGroupId, message, { parse_mode: 'HTML' });
        } catch (error) {
            console.error(`Failed to send sentiment update to private group:`, error);
        }
    }

    private formatUpdateMessage(update: SentimentUpdate): string {
        const header = `🔥 New Significant Tweets Found!\n\n`;

        const tweets = update.tweets
            .map(tweet =>
                `<b>${tweet.author}</b>\n` +
                `${tweet.text}\n` +
                `Sentiment: ${(tweet.analysis.score * 100).toFixed(1)}%\n` +
                `Credibility: ${(tweet.analysis.credibilityScore * 100).toFixed(1)}%`
            )
            .join("\n\n");

        return header + tweets;
    }
}
