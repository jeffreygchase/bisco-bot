import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { handleMessage, handleImrryr, handleRobotsavers, handleMetlife, handleChases, handleShnfam, handleGif, handleArt } from './bot.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';

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
  } else if (message.channel.name === 'shnfam' || message.channel.name === 'shnfamily') {
    await handleShnfam(message);
  }
});

client.login(process.env.DISCORD_TOKEN);

// ─── Relay Bus Poller ──────────────────────────────────────────────────────────
const RELAY_FILE = process.env.RELAY_FILE || '/home/ec2-user/relay-queue.json';

async function pollRelay() {
  if (!existsSync(RELAY_FILE)) return;
  let queue;
  try {
    queue = JSON.parse(readFileSync(RELAY_FILE, 'utf8'));
  } catch (err) {
    console.error('[relay] read error:', err.message);
    return;
  }

  let changed = false;
  for (const entry of queue) {
    if (!entry.to || !entry.to.includes('biscobot')) continue;
    if (entry.processed && entry.processed.biscobot) continue;

    const channel = client.channels.cache.find(
      c => c.name === entry.channel && c.isTextBased()
    );
    if (!channel) {
      console.warn(`[relay] no Discord channel found for ${entry.channel}`);
      continue;
    }

    try {
      await channel.send(`**[${entry.from} / ${entry.channel}]**\n> ${entry.user_text}\n${entry.body}`);
      console.log(`[relay] posted to discord/${entry.channel} from ${entry.from}`);
      if (!entry.processed) entry.processed = {};
      entry.processed.biscobot = true;
      changed = true;
    } catch (err) {
      console.error('[relay] post error:', err.message);
    }
  }

  if (changed) {
    try {
      writeFileSync(RELAY_FILE, JSON.stringify(queue, null, 2));
    } catch (err) {
      console.error('[relay] write error:', err.message);
    }
  }
}

setInterval(pollRelay, 60 * 1000);
