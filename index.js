
require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events,
    PermissionFlagsBits,
} = require("discord.js");

const express = require("express");

// ==================== 環境變數 ====================

const TOKEN = process.env.TOKEN;
const PORT = process.env.PORT || 3000;

const allowedChannelIds = (process.env.ALLOWED_CHANNEL_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

const specificChannelId = process.env.SPECIFIC_CHANNEL_ID;

if (!TOKEN) {
    console.error("❌ 錯誤：未找到 TOKEN 環境變數！");
    process.exit(1);
}

// ==================== Discord Client ====================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// ==================== Slash 指令 ====================

const addRolesCommand = new SlashCommandBuilder()
    .setName("addroles")
    .setDescription("創建一個按鈕來領取多個身份組")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

for (let i = 1; i <= 8; i++) {
    addRolesCommand.addRoleOption(option =>
        option
            .setName(`role${i}`)
            .setDescription(`選擇身份組 ${i}`)
            .setRequired(i === 1)
    );
}

const commands = [addRolesCommand.toJSON()];

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ==================== Bot 登入完成 ====================

client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ 機器人已登入：${readyClient.user.tag}`);

    try {
        await rest.put(
            Routes.applicationCommands(readyClient.application.id),
            { body: commands }
        );

        console.log("✅ Slash 指令已成功註冊！");
    } catch (error) {
        console.error("❌ Slash 指令註冊失敗：", error);
    }
});

// ==================== Slash 指令與身份組按鈕 ====================

client.on(Events.InteractionCreate, async interaction => {
    try {
        // /addroles
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName !== "addroles") return;

            const roles = [];

            for (let i = 1; i <= 8; i++) {
                const role = interaction.options.getRole(`role${i}`);

                if (role && !roles.some(r => r.id === role.id)) {
                    roles.push(role);
                }
            }

            if (roles.length === 0) {
                return interaction.reply({
                    content: "❌ 必須至少選擇一個身份組！",
                    ephemeral: true,
                });
            }

            const embed = new EmbedBuilder()
                .setColor("#0099ff")
                .setTitle("🎭 點擊領取身份組才能查看頻道喔!")
                .setDescription("點擊下方按鈕領取所選身份組！");

            // Discord 每列最多 5 個按鈕，8 個按鈕分成兩列
            const rows = [];

            for (let i = 0; i < roles.length; i += 5) {
                const row = new ActionRowBuilder();

                row.addComponents(
                    roles.slice(i, i + 5).map(role =>
                        new ButtonBuilder()
                            .setCustomId(`role_${role.id}`)
                            .setLabel(`領取 ${role.name}`.slice(0, 80))
                            .setStyle(ButtonStyle.Primary)
                    )
                );

                rows.push(row);
            }

            return interaction.reply({
                embeds: [embed],
                components: rows,
            });
        }

        // 身份組按鈕
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith("role_")) return;

        if (!interaction.inGuild()) {
            return interaction.reply({
                content: "❌ 此按鈕只能在伺服器內使用。",
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const roleId = interaction.customId.slice("role_".length);
        const role = await interaction.guild.roles.fetch(roleId);
        const member = await interaction.guild.members.fetch(
            interaction.user.id
        );

        if (!role) {
            return interaction.editReply({
                content: "❌ 此身份組已不存在。",
            });
        }

        if (!role.editable) {
            return interaction.editReply({
                content: "❌ 機器人無法管理此身份組，請聯絡管理員。",
            });
        }

        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role);

            return interaction.editReply({
                content: `🚫 你已移除身份組：${role.name}`,
            });
        }

        await member.roles.add(role);

        return interaction.editReply({
            content: `✅ 你已獲得身份組：${role.name}`,
        });

    } catch (error) {
        console.error("❌ 互動處理失敗：", error);

        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: "❌ 操作失敗，請稍後再試。",
                });
            } else if (
                interaction.isRepliable() &&
                !interaction.replied
            ) {
                await interaction.reply({
                    content: "❌ 操作失敗，請稍後再試。",
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            console.error("❌ 互動回覆失敗：", replyError);
        }
    }
});

// ==================== 訊息刪除監控 ====================

client.on(Events.MessageDelete, async message => {
    try {
        if (message.partial) {
            message = await message.fetch().catch(() => null);
        }

        if (!message?.content || !message.author || message.author.bot) {
            return;
        }

        if (!allowedChannelIds.includes(message.channel.id)) return;
        if (containsLink(message.content)) return;
        if (!specificChannelId) return;

        const channel = await client.channels.fetch(specificChannelId);

        if (!channel?.isTextBased() || !channel.send) return;

        console.log(
            `[刪除] ${message.author.tag}: ${message.content}`
        );

        await channel.send({
            content:
                `🗑️ <@${message.author.id}> 收回了一則訊息：\n` +
                `\`\`\`\n${message.content.slice(0, 1800)}\n\`\`\``,
            allowedMentions: { parse: [] },
        });

    } catch (error) {
        console.error("❌ 訊息刪除監控失敗：", error);
    }
});

// ==================== 訊息編輯監控 ====================

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    try {
        if (oldMessage.partial) {
            oldMessage = await oldMessage.fetch().catch(() => null);
        }

        if (newMessage.partial) {
            newMessage = await newMessage.fetch().catch(() => null);
        }

        if (!oldMessage?.content || !newMessage?.content) return;
        if (!newMessage.author || newMessage.author.bot) return;

        if (oldMessage.content === newMessage.content) return;

        if (
            containsLink(oldMessage.content) ||
            containsLink(newMessage.content)
        ) {
            return;
        }

        if (!allowedChannelIds.includes(newMessage.channel.id)) return;
        if (!specificChannelId) return;

        const channel = await client.channels.fetch(specificChannelId);

        if (!channel?.isTextBased() || !channel.send) return;

        console.log(
            `[編輯] ${newMessage.author.tag}: ` +
            `${oldMessage.content} -> ${newMessage.content}`
        );

        await channel.send({
            content:
                `✏️ <@${newMessage.author.id}> 編輯了訊息：\n` +
                `\`\`\`\n${oldMessage.content.slice(0, 850)}\n\`\`\`\n` +
                `➡️ 修改後：\n` +
                `\`\`\`\n${newMessage.content.slice(0, 850)}\n\`\`\``,
            allowedMentions: { parse: [] },
        });

    } catch (error) {
        console.error("❌ 訊息編輯監控失敗：", error);
    }
});

// ==================== 判斷訊息是否包含連結 ====================

function containsLink(content) {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    return urlRegex.test(content);
}

// ==================== Render HTTP Server ====================

const app = express();

app.get("/", (req, res) => {
    res.status(200).send("Bot is active!");
});

app.get("/health", (req, res) => {
    const online = client.isReady();

    res.status(online ? 200 : 503).json({
        status: online ? "online" : "starting",
    });
});

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server is running on port ${PORT}`);
});

// ==================== 錯誤處理 ====================

client.on(Events.Error, error => {
    console.error("❌ Discord Client 錯誤：", error);
});

process.on("unhandledRejection", error => {
    console.error("❌ 未處理的 Promise 錯誤：", error);
});

// ==================== 登入 Discord ====================

client.login(TOKEN).catch(error => {
    console.error("❌ Discord 登入失敗：", error);
    process.exitCode = 1;
});

// ==================== Render 關閉處理 ====================

function shutdown(signal) {
    console.log(`收到 ${signal}，正在關閉服務...`);

    server.close();
    client.destroy();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
