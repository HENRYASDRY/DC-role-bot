if (!process.env.TOKEN) {
    console.error("❌ 錯誤：未找到 TOKEN 環境變數！");
    process.exit(1);
}
require("dotenv").config();
const { 
    Client, GatewayIntentBits, REST, Routes, 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, Events 
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// ✅ 設定允許監聽的頻道與回報頻道
// ✅ 從 .env 讀取並處理成陣列
const allowedChannelIds = process.env.ALLOWED_CHANNEL_IDS ? process.env.ALLOWED_CHANNEL_IDS.split(',') : [];// 允許監聽的頻道 ID
const specificChannelId = process.env.SPECIFIC_CHANNEL_ID;// 回報刪除/編輯訊息的頻道 ID

// ✅ 註冊 Slash 指令 `/addroles`
const commands = [
    new SlashCommandBuilder()
        .setName("addroles")
        .setDescription("創建一個按鈕來領取多個身份組")
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

client.once("ready", async () => {
    console.log(`✅ 機器人已登入：${client.user.tag}`);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash 指令已成功註冊！");
});

// ✅ 監聽 Slash 指令 `/addroles`
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === "addroles") {
        let roles = [];
        for (let i = 1; i <= 8; i++) {
            let role = interaction.options.getRole(`role${i}`);
            if (role) roles.push(role);
        }

        if (roles.length === 0) {
            return interaction.reply({ content: "❌ 必須至少選擇一個身份組！", ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor("#0099ff")
            .setTitle("🎭 點擊領取身份組才能查看頻道喔!")
            .setDescription("點擊下方按鈕領取所選身份組！");

        const row = new ActionRowBuilder().addComponents(
            roles.map(role => 
                new ButtonBuilder()
                    .setCustomId(`role_${role.id}`)
                    .setLabel(`領取 ${role.name}`)
                    .setStyle(ButtonStyle.Primary)
            )
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
});

// ✅ 監聽身份組按鈕點擊
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const roleId = interaction.customId.split("_")[1];
    const role = interaction.guild.roles.cache.get(roleId);
    const member = interaction.member;

    if (role) {
        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            await interaction.reply({ content: `🚫 你已移除身份組：${role.name}`, ephemeral: true });
        } else {
            await member.roles.add(role);
            await interaction.reply({ content: `✅ 你已獲得身份組：${role.name}`, ephemeral: true });
        }
    }
});

// ✅ 監聽訊息刪除事件
client.on(Events.MessageDelete, async (message) => {
    if (!message.content || message.author.bot || containsLink(message.content)) return;
    if (!allowedChannelIds.includes(message.channel.id)) return;

    const channel = await client.channels.fetch(specificChannelId);
    if (!channel) return;

    console.log(`[刪除] ${message.author.tag}: ${message.content}`);
    channel.send(`🗑️ <@${message.author.id}> 收回了一則訊息：\n\`${message.content}\``);
});

// ✅ 監聽訊息編輯事件
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (!oldMessage.content || !newMessage.content) return;
    if (oldMessage.author.bot || containsLink(oldMessage.content) || containsLink(newMessage.content)) return;
    if (!allowedChannelIds.includes(oldMessage.channel.id)) return;

    const channel = await client.channels.fetch(specificChannelId);
    if (!channel) return;

    console.log(`[編輯] ${oldMessage.author.tag}: ${oldMessage.content} -> ${newMessage.content}`);
    channel.send(`✏️ <@${oldMessage.author.id}> 編輯了訊息：\n\`${oldMessage.content}\` ➡️ \`${newMessage.content}\``);
});

// ✅ 判斷訊息是否包含連結
function containsLink(content) {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    return urlRegex.test(content);
}

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is active!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

client.login(process.env.TOKEN);
