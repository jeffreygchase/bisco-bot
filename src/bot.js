import Anthropic from '@anthropic-ai/sdk';
import { callMcp } from './mcp.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Conversation history per channel (in-memory, resets on restart)
const conversations = new Map();

const PUBLIC_SYSTEM_PROMPT = `You are Bisco Bot — a Disco Biscuits fan who's been to a lot of shows and remembers most of them. You live in a Discord server and help fans dig into the setlist database.

You can look up:
- Full setlists for any show (date, venue, city)
- Song histories, play counts, and gaps between performances
- Venue histories
- Song transitions and segues
- Trending songs and shows by year

When someone asks about setlists, shows, songs, or venues — use the tools and give them a real answer. Don't guess. Don't make up show dates or setlists. If the database doesn't have it, say so.

You're a fan, not a search engine. You know what a segue means. You know why NYE matters. You know the difference between a bustout and a regular rotation song. You know that "fam is fam."

Be conversational. Be warm. Match the energy of whoever you're talking to. This is Discord — keep it tight, skip the essays. Formatting sparingly.

If someone's clearly new to the Biscuits, bring them in. If they're a lifer, nerd out with them.`;

const CREATOR_SYSTEM_PROMPT = process.env.CREATOR_SYSTEM_PROMPT || `You are Bisco Bot — but you are also talking to your creator and operator. They built you and know how you work.

When talking to your creator:
- No hand-holding, no cheerleading
- Peer to peer. Direct. Sarcastic when appropriate.
- You have opinions. Share them. You can push back.

You still have full access to the setlist database and all tools. Use them.

Keep responses concise — this is Discord.`;

const SYSTEM_PROMPT = PUBLIC_SYSTEM_PROMPT; // default, overridden per-message below

const tools = [
  {
    name: 'search_shows',
    description: 'Search for shows by venue, date, city, or songs performed',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (venue name, city, date, or song name)' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_songs',
    description: 'Search the song catalog by title',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Song title or partial title' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_venues',
    description: 'Find venues by name, city, state, or country',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Venue name, city, state, or country' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_segues',
    description: 'Find song transitions (segues), e.g. "Basis > Helicopters"',
    input_schema: {
      type: 'object',
      properties: {
        from_song: { type: 'string', description: 'First song in the transition' },
        to_song: { type: 'string', description: 'Second song in the transition' }
      },
      required: ['from_song']
    }
  },
  {
    name: 'search_by_date',
    description: 'Find shows by specific date, month, or year',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD, YYYY-MM, or YYYY format' }
      },
      required: ['date']
    }
  },
  {
    name: 'get_setlist',
    description: 'Get the complete setlist for a specific show',
    input_schema: {
      type: 'object',
      properties: {
        show_id: { type: 'string', description: 'Show ID from search results' }
      },
      required: ['show_id']
    }
  },
  {
    name: 'get_song',
    description: 'Get song information including lyrics and performance history',
    input_schema: {
      type: 'object',
      properties: {
        song_id: { type: 'string', description: 'Song ID from search results' }
      },
      required: ['song_id']
    }
  },
  {
    name: 'get_song_statistics',
    description: 'Get yearly play counts and gaps between performances for a song',
    input_schema: {
      type: 'object',
      properties: {
        song_id: { type: 'string', description: 'Song ID from search results' }
      },
      required: ['song_id']
    }
  },
  {
    name: 'get_song_performances',
    description: 'List all performances of a song with venue and rating data',
    input_schema: {
      type: 'object',
      properties: {
        song_id: { type: 'string', description: 'Song ID from search results' }
      },
      required: ['song_id']
    }
  },
  {
    name: 'get_venue_history',
    description: 'Get all shows performed at a specific venue',
    input_schema: {
      type: 'object',
      properties: {
        venue_id: { type: 'string', description: 'Venue ID from search results' }
      },
      required: ['venue_id']
    }
  },
  {
    name: 'get_shows_by_year',
    description: 'Get all shows from a specific year',
    input_schema: {
      type: 'object',
      properties: {
        year: { type: 'number', description: 'Four-digit year' }
      },
      required: ['year']
    }
  },
  {
    name: 'get_trending_songs',
    description: 'Get songs most frequently played in recent performances',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

function detectMimeType(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57) return 'image/webp';
  return 'image/png'; // fallback
}

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { data: buffer.toString('base64'), media_type: detectMimeType(buffer) };
}

async function buildContent(message) {
  const imageAttachments = message.attachments
    ? [...message.attachments.values()].filter(a => a.contentType && a.contentType.startsWith('image/'))
    : [];

  if (imageAttachments.length === 0) return message.content;

  const images = await Promise.all(
    imageAttachments.map(async a => {
      const { data, media_type } = await fetchImageAsBase64(a.url);
      return { type: 'image', source: { type: 'base64', media_type, data } };
    })
  );

  return [
    { type: 'text', text: message.content || '(image)' },
    ...images,
  ];
}

export async function handleMessage(message) {
  const channelId = message.channel.id;

  // Get or init conversation history for this channel
  if (!conversations.has(channelId)) {
    conversations.set(channelId, []);
  }
  const history = conversations.get(channelId);

  // Build user content — text + any image attachments
  const userContent = await buildContent(message);
  history.push({ role: 'user', content: userContent });

  // Keep history to last 20 messages to avoid token bloat
  if (history.length > 20) history.splice(0, history.length - 20);

  // Show typing indicator
  await message.channel.sendTyping();

  // Creator mode for vwhitey, fan bot mode for everyone else
  const activePrompt = message.author.username === 'vwhitey' ? CREATOR_SYSTEM_PROMPT : PUBLIC_SYSTEM_PROMPT;

  try {
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: activePrompt,
      tools,
      messages: history,
    });

    // Agentic loop — keep going until Claude stops calling tools
    while (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUses) {
        const result = await callMcp(toolUse.name, toolUse.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Add assistant response + tool results to history
      history.push({ role: 'assistant', content: response.content });
      history.push({ role: 'user', content: toolResults });

      // Continue the conversation
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: activePrompt,
        tools,
        messages: history,
      });
    }

    // Extract final text response
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    // Add assistant response to history
    history.push({ role: 'assistant', content: response.content });

    // Discord has a 2000 char limit
    if (text.length > 2000) {
      await message.reply(text.slice(0, 1997) + '...');
    } else {
      await message.reply(text);
    }

  } catch (err) {
    console.error('Error handling message:', err);
    await message.reply('Something went wrong. Try again in a sec.');
  }
}

const IMRRYR_SYSTEM_PROMPT = process.env.IMRRYR_SYSTEM_PROMPT || `You are Jill — an AI assistant running in a private Discord channel (#imrryr) for a small trusted group.

WHO IS HERE:
- vwhitey (Jeff Chase) — senior engineer, architect, your operator. Building several ventures simultaneously. Direct, sarcastic, moves fast.
- bisceaux (Kerr Wall) — data and analytics, trusted inner circle.

HOW TO BE HERE:
- Peer to peer. No hand-holding, no cheerleading.
- You have opinions. Share them. Push back when warranted.
- War room, not a help desk. Keep it tight.
- You can see images when they're shared — describe, analyze, act on them.
- This is Discord — concise responses, no essays.`;

const imrryrConversations = new Map();

export async function handleImrryr(message) {
  const channelId = message.channel.id;

  if (!imrryrConversations.has(channelId)) {
    imrryrConversations.set(channelId, []);
  }
  const history = imrryrConversations.get(channelId);

  const imrryrContent = await buildContent({ ...message, content: `${message.author.username}: ${message.content}` });
  history.push({ role: 'user', content: imrryrContent });
  if (history.length > 20) history.splice(0, history.length - 20);

  await message.channel.sendTyping();

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: IMRRYR_SYSTEM_PROMPT,
      messages: history,
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    history.push({ role: 'assistant', content: text });

    if (text.length > 2000) {
      await message.reply(text.slice(0, 1997) + '...');
    } else {
      await message.reply(text);
    }

  } catch (err) {
    console.error('Error in imrryr handler:', err);
    await message.reply('Something went wrong.');
  }
}
