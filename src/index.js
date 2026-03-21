import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { handleMessage, handleImrryr, handleRobotsavers, handleMetlife, handleChases, handleShnfam, handleGif, handleArt } from './bot.js';

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

  // !gif and !art commands work in any channel
  if (message.content.startsWith('!gif ')) {
    await handleGif(message, message.content.slice(5).trim());
    return;
  }
  if (message.content.startsWith('!art ')) {
    await handleArt(message, message.content.slice(5).trim());
    return;
  }

  // Route by channel
  if (message.channel.name === 'bisco-bot') {
    await handleMessage(message);
  } else if (message.channel.name === 'imrryr') {
    await handleImrryr(message);
  } else if (message.channel.name === 'robot-savers') {
    await handleRobotsavers(message);
  } else if (message.channel.name === 'metlife') {
    await handleMetlife(message);
  } else if (message.channel.name === 'chases') {
    await handleChases(message);
  } else if (message.channel.name === 'shnfam') {
    await handleShnfam(message);
  }
});

client.login(process.env.DISCORD_TOKEN);
