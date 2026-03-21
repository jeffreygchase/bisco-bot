import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { handleMessage, handleImrryr } from './bot.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Bisco Bot is online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  console.log(`[msg] #${message.channel.name} | ${message.author.username}: ${message.content}`);

  // Ignore bots
  if (message.author.bot) return;

  // Route by channel
  if (message.channel.name === 'bisco-bot') {
    await handleMessage(message);
  } else if (message.channel.name === 'imrryr') {
    await handleImrryr(message);
  }
});

client.login(process.env.DISCORD_TOKEN);
