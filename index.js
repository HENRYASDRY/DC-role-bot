// ✅ 1. 必須最先載入 dotenv，才能讀取 .env 檔案裡的環境變數
require("dotenv").config();

// ✅ 2. 載入後再檢查 TOKEN 是否存在
if (!process.env.TOKEN) {
    console.error("❌ 錯誤：未找到 TOKEN 環境變數！請檢查 .env 檔案設定。");
    process.exit(1);
}

const { 
    Client, GatewayIntentBits, REST, Routes, 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, Events, PermissionFlagsBits,
    MessageFlags
} = require("discord.js");
const express = require("express");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// ✅ 設定允許監聽的頻道與回報頻道（加入 trim() 避免空白字元導致比對失敗）
const allowedChannelIds = process.env.ALLOWED_CHANNEL_IDS 
    ? process.env.ALLOWED_CHANNEL_IDS.split(",").map(id => id.trim()) 
    : [];
const specificChannelId = process.env.SPECIFIC_CHANNEL_ID ? process.env.SPECIFIC_CHANNEL_ID.trim() : null;

// ✅ 註冊 Slash 指令 `/addroles`
const commands = [
    new SlashCommandBuilder()
        .setName("addroles")
        .setDescription("創建一個按鈕面板來領取多個身份組")
        // 設定只有管理員權限者可見/使用
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(option => option.setName("role1").setDescription("選擇身份組 1").setRequired(true))
        .addRoleOption(option => option.setName("role2").setDescription("選擇身份組 2").setRequired(false))
        .addRoleOption(option => option.setName("role3").setDescription("選擇身份組 3").setRequired(false))
        .addRoleOption(option => option.setName("role4").setDescription("選擇身份組 4").setRequired(false))
        .addRoleOption(option => option.setName("role5").setDescription("選擇身份組 5").setRequired(false))
        .addRoleOption(option => option.setName("role6").setDescription("選擇身份組 6").setRequired(false))
        .addRoleOption(option => option.setName("role7").setDescription("選擇身份組 7").setRequired(false))
        .addRoleOption(option => option.setName("role8").setDescription("選擇身份組 8").setRequired(false))
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

// ✅ 機器人啟動與註冊指令
client.once(Events.ClientReady, async () => {
    console.log("✅ 機器人已登入：" + client.user.tag);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log("✅ Slash 指令已成功註冊！");
    } catch (error) {
        console.error("❌ 註冊 Slash 指令時發生錯誤：", error);
    }
});

// ✅ 統一監聽互動事件（包含 Slash 指令與按鈕點擊）
client.on(Events.InteractionCreate, async (interaction) => {
    // 1. 處理 Slash 指令 `/addroles`
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "addroles") {
            let roles = [];
            for (let i = 1; i <= 8; i++) {
                let role = interaction.options.getRole("role" + i);
                // 避免重複選擇同一個身份組導致按鈕 customId 衝突
                if (role && !roles.some(r => r.id === role.id)) {
                    roles.push(role);
                }
            }

            if (roles.length === 0) {
                return interaction.reply({ 
                    content: "❌ 必須至少選擇一個有效的身份組！", 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const embed = new EmbedBuilder()
                .setColor("#0099ff")
                .setTitle("🎭 點擊領取身份組才能查看頻道喔!")
                .setDescription("點擊下方按鈕即可領取或移除所選的身份組！");

            // Discord 限制單一 ActionRow 最多只能有 5 個按鈕，這裡自動每 5 個分一排
            const rows = [];
            for (let i = 0; i < roles.length; i += 5) {
                const row = new ActionRowBuilder().addComponents(
                    roles.slice(i, i + 5).map(role => 
                        new ButtonBuilder()
                            .setCustomId("role_" + role.id)
                            .setLabel("領取 " + role.name)
                            .setStyle(ButtonStyle.Primary)
                    )
                );
                rows.push(row);
            }

            await interaction.reply({ embeds: [embed], components: rows });
        }
    }

    // 2. 處理身份組按鈕點擊
    if (interaction.isButton()) {
        if (!interaction.customId.startsWith("role_")) return;

        const roleId = interaction.customId.split("_")[1];
        const role = interaction.guild.roles.cache.get(roleId);
        const member = interaction.member;

        if (!role) {
            return interaction.reply({ 
                content: "❌ 找不到該身份組，可能已被伺服器刪除。", 
                flags: MessageFlags.Ephemeral 
            });
        }

        // 防呆機制：檢查機器人的最高身份組是否高於要發放的身份組
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ 
                content: "❌ 權限不足：機器人的身份組位置必須高於「" + role.name + "」才能幫你發放或移除喔！請通知管理員調整身份組順序。", 
                flags: MessageFlags.Ephemeral 
            });
        }

        try {
            if (member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
                await interaction.reply({ 
                    content: "🚫 你已移除身份組：**" + role.name + "**", 
                    flags: MessageFlags.Ephemeral 
                });
            } else {
                await member.roles.add(role);
                await interaction.reply({ 
                    content: "✅ 你已獲得身份組：**" + role.name + "**", 
                    flags: MessageFlags.Ephemeral 
                });
            }
        } catch (error) {
            console.error("❌ 變更身份組時發生錯誤：", error);
            await interaction.reply({ 
                content: "❌ 變更身份組失敗，請確認機器人是否擁有「管理身份組 (Manage Roles)」權限。", 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
});

// ✅ 監聽訊息刪除事件
client.on(Events.MessageDelete, async (message) => {
    // 忽略局部訊息（未快取）、無內容、機器人訊息或包含連結的訊息
    if (message.partial || !message.content || message.author?.bot || containsLink(message.content)) return;
    if (!allowedChannelIds.includes(message.channel.id)) return;
    if (!specificChannelId) return;

    try {
        const channel = await client.channels.fetch(specificChannelId);
        if (!channel) return;

        console.log("[刪除] " + message.author.tag + ": " + message.content);
        await channel.send("🗑️ <@" + message.author.id + "> 收回了一則訊息：\n`" + message.content + "`");
    } catch (error) {
        console.error("❌ 發送刪除紀錄時發生錯誤：", error);
    }
});

// ✅ 監聽訊息編輯事件
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (oldMessage.partial || newMessage.partial) return;
    if (!oldMessage.content || !newMessage.content) return;
    // 若內容沒變（例如只是 Discord 自動展開網址預覽 Embed）則忽略
    if (oldMessage.content === newMessage.content) return;
    if (oldMessage.author?.bot || containsLink(oldMessage.content) || containsLink(newMessage.content)) return;
    if (!allowedChannelIds.includes(oldMessage.channel.id)) return;
    if (!specificChannelId) return;

    try {
        const channel = await client.channels.fetch(specificChannelId);
        if (!channel) return;

        console.log("[編輯] " + oldMessage.author.tag + ": " + oldMessage.content + " -> " + newMessage.content);
        await channel.send("✏️ <@" + oldMessage.author.id + "> 編輯了訊息：\n`" + oldMessage.content + "` ➡️ `" + newMessage.content + "`");
    } catch (error) {
        console.error("❌ 發送編輯紀錄時發生錯誤：", error);
    }
});

// ✅ 判斷訊息是否包含連結
function containsLink(content) {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    return urlRegex.test(content);
}

// ✅ Express 伺服器（維持機器人運作狀態）
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot is active!");
});

app.listen(port, () => {
    console.log("🌐 Web Server is running on port " + port);
});

// ✅ 監聽 Discord 連線錯誤與限流警告（幫助在 Render Logs 抓蟲）
client.on("error", (error) => {
    console.error("❌ Discord Client 發生錯誤：", error);
});

client.rest.on("rateLimited", (info) => {
    console.warn("⚠️ 遭到 Discord API 限流 (Rate Limited)：", info);
});

// ✅ 登入 Discord 機器人並印出狀態
console.log("⏳ 正在嘗試連線至 Discord...");
client.login(process.env.TOKEN)
    .then(() => {
        console.log("🔑 Token 驗證通過，等待 Ready 事件...");
    })
    .catch((error) => {
        console.error("❌ 登入 Discord 失敗：", error);
    });