import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { handleMessage } from './bot.js';

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

  // Only respond in the designated bot channel
  if (message.channel.name !== 'bisco-bot') return;

  await handleMessage(message);
});

client.login(process.env.DISCORD_TOKEN);
