import { elizaLogger } from '@ai16z/eliza';
import { RedisService } from './redis.ts';
import { Context, Telegraf } from "telegraf";

interface SentimentUpdate {
    timestamp: number;
    metadata: {
        totalTweetsAnalyzed: number;
        significantTweetsCount: number;
        targetAccounts: string[];
        batchId: string;
    };
    statistics: {
        averageScore: number;
        averageCredibility: number;
        sentimentDistribution: Record<string, number>;
        topTopics: { topic: string; count: number }[];
    };
    tweets: {
        name: string;
        username: string;
        text: string;
        analysis: {
            score: number;
            credibilityScore: number;
            sentiment: string;
        };
        engagement: {
            likes: number;
            retweets: number;
            replies: number;
            views: number;
            bookmarks: number;
        };
    }[];
}

export class SentimentService {
    private bot: Telegraf<Context>;
    private privateGroupId: string;
    private redisService: RedisService;

    constructor(bot: Telegraf<Context>) {
        this.bot = bot;
        this.privateGroupId = process.env.PRIVATE_GROUP_ID?.toString() || '';
        this.redisService = RedisService.getInstance();

        if (!this.privateGroupId) {
            elizaLogger.warn('PRIVATE_GROUP_ID not set for sentiment updates');
        }

        this.setupSubscriber();
        elizaLogger.log("✅ Sentiment Service initialized");
    }

    private setupSubscriber(): void {
        this.redisService.subscriber.subscribe("sentiment:updates");
        this.redisService.subscriber.on("message", async (channel, message) => {
            if (channel === "sentiment:updates") {
                try {
                    const update: SentimentUpdate = JSON.parse(message);
                    await this.broadcastUpdate(update);
                } catch (error) {
                    elizaLogger.error("Error processing sentiment update:", error);
                }
            }
        });
    }

    private async broadcastUpdate(update: SentimentUpdate): Promise<void> {
        if (update.metadata.significantTweetsCount === 0 || !this.privateGroupId) return;
        const message = this.formatUpdateMessage(update);

        try {
            const formattedGroupId = this.privateGroupId.startsWith('-100')
              ? this.privateGroupId
              : `-100${this.privateGroupId.replace('-', '')}`;

            await this.bot.telegram.sendMessage(formattedGroupId, message, { parse_mode: 'HTML' });
        } catch (error) {
            elizaLogger.error(`Failed to send sentiment update to private group:`, error);
        }
    }

    private formatUpdateMessage(update: SentimentUpdate): string {
        const header = `🔥 Sentiment Analysis Update\n\n` +
            `Analyzed ${update.metadata.totalTweetsAnalyzed} tweets\n` +
            `Found ${update.metadata.significantTweetsCount} significant tweets\n\n` +
            `📊 Statistics:\n` +
            `Average Sentiment: ${(update.statistics.averageScore * 100).toFixed(1)}%\n` +
            `Average Credibility: ${(update.statistics.averageCredibility * 100).toFixed(1)}%\n\n` +
            `🔝 Top Topics: ${update.statistics.topTopics.slice(0, 3).map(topic =>
                typeof topic === 'object' && topic !== null && topic.topic ? `${topic.topic} (${topic.count})` : 'Unknown'
            ).join(', ')}\n\n` +
            `Significant Tweets:\n\n`;

        const tweets = update.tweets
            .map(tweet =>
                `<b>@${tweet.username}</b>\n` +
                `${tweet.text}\n\n` +
                `Sentiment: ${(tweet.analysis.score * 100).toFixed(1)}% (${tweet.analysis.sentiment})\n` +
                `Credibility: ${(tweet.analysis.credibilityScore * 100).toFixed(1)}%\n\n` +
                `👍 ${tweet.engagement.likes} 🔄 ${tweet.engagement.retweets} 💬 ${tweet.engagement.replies} 👀 ${tweet.engagement.views}`
            )
            .join('\n\n━━━━━━━━━━\n\n');

        return header + tweets;
    }

    public async stop(): Promise<void> {
        elizaLogger.log("Stopping sentiment monitoring...");
        await this.redisService.subscriber.unsubscribe("sentiment:updates");
    }
}
