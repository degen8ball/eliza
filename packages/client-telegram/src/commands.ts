import { Context } from "telegraf";
import { IAgentRuntime, elizaLogger, stringToUuid, UUID } from "@ai16z/eliza";
import { v4 as uuidv4 } from "uuid";
import { askServer } from "./utils";

export interface CommandHandler {
    command: string;
    description: string;
    handler: (ctx: Context, runtime: IAgentRuntime) => Promise<void>;
}

export const commands: CommandHandler[] = [
    {
        command: "start",
        description: "Start by connecting a wallet",
        handler: async (ctx: Context, runtime: IAgentRuntime) => {
            try {
                const userId = ctx.from?.id.toString();
                const username =
                    ctx.from?.username || ctx.from?.first_name || "Unknown";

                if (!userId) {
                    await ctx.reply(
                        "Could not identify your user ID. Please try again."
                    );
                    return;
                }
                const sessionId = uuidv4();
                const webAppUrl = runtime.getSetting("WEBAPP_URL");
                // Check if we're already in a private chat
                if (ctx.chat?.type === "private") {
                    await ctx.reply(
                        "Please connect your wallet to complete verification:",
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: "Connect Wallet",
                                            url: `${webAppUrl}/verify?session=${sessionId}`,
                                        },
                                    ],
                                ],
                            },
                        }
                    );
                } else {
                    // If in group chat, ask user to start private chat first
                    await ctx.reply(
                        "Please start a private chat with me first by clicking the button below.",
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: "Start Private Chat",
                                            url: `https://t.me/${ctx.botInfo?.username}`,
                                        },
                                    ],
                                ],
                            },
                        }
                    );
                }

                // Get the invite link for the private group
                let inviteLink = "";
                try {
                    const privateGroupId =
                        runtime.getSetting("PRIVATE_GROUP_ID");
                    if (privateGroupId) {
                        // Also unban from private group
                        const formattedGroupId = privateGroupId
                            .toString()
                            .startsWith("-100")
                            ? privateGroupId.toString()
                            : `-100${privateGroupId.toString().replace("-", "")}`;

                        // unban user so invite link works
                        await ctx.telegram.unbanChatMember(
                            formattedGroupId,
                            parseInt(userId),
                            { only_if_banned: true }
                        );

                        const inviteLinkObj =
                            await ctx.telegram.createChatInviteLink(
                                formattedGroupId,
                                {
                                    creates_join_request: false,
                                    member_limit: 1,
                                    name: `${username} (${userId})`,
                                    expire_date:
                                        Math.floor(Date.now() / 1000) + 3600, // Link expires in 1 hour
                                }
                            );
                        inviteLink = inviteLinkObj.invite_link;
                    }
                } catch (error) {
                    elizaLogger.error(
                        "Error generating invite link for private group:",
                        error
                    );
                }

                try {
                    await askServer({
                        sessionId: sessionId,
                        inviteUrl: inviteLink,
                        telegramId: userId,
                    });
                } catch (error) {
                    elizaLogger.error(
                        "Error checking verification status:",
                        error
                    );
                }

                elizaLogger.info(
                    `Session created for user ${username} (${userId})`
                );
            } catch (error) {
                elizaLogger.error("Error in verify command:", error);
                await ctx.reply("An error occurred. Please try again later.");
            }
        },
    },
    {
        command: "help",
        description: "Show available commands",
        handler: async (ctx: Context) => {
            const helpText = commands
                .map((cmd) => `/${cmd.command} - ${cmd.description}`)
                .join("\n");
            await ctx.reply(`Available commands:\n\n${helpText}`, {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Get Started",
                                url: `https://t.me/${ctx.botInfo?.username}?start=verify`,
                            },
                            {
                                text: "Get Support",
                                url: "https://t.me/support",
                            },
                        ],
                    ],
                },
            });
        },
    },
    {
        command: "status",
        description: "Check bot status",
        handler: async (ctx: Context, runtime: IAgentRuntime) => {
            await ctx.reply(
                `✅ I'm online and running!\nAgent: ${runtime.character.name}`
            );
        },
    },
];
