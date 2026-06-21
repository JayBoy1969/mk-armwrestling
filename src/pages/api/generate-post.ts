import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSecret } from '../../lib/runtime';
import { isAuthenticated } from '../../lib/auth';
import { fetchUnsplashImage } from '../../lib/unsplash';

export const prerender = false;

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;
const MAX_CONTINUATIONS = 5;

interface PostData {
  title: string;
  body: string;
  excerpt: string;
  imageSearchTerm: string;
}

/**
 * Extract the first balanced JSON object from a string, tolerating markdown
 * code fences and surrounding prose. Brace-counting is string-aware so braces
 * inside the article body don't throw off the match.
 */
function extractJson(text: string): PostData | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as PostData;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    if (!(await isAuthenticated(cookies))) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const {
      topic,
      imageSearchTerm: customImageSearchTerm,
      guidance,
      customImageUrl,
    } = (await request.json()) as {
      topic?: string;
      imageSearchTerm?: string;
      guidance?: string;
      customImageUrl?: string;
    };

    if (!topic) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const anthropicApiKey = getSecret('ANTHROPIC_API_KEY');
    const unsplashAccessKey = getSecret('UNSPLASH_ACCESS_KEY');

    if (!anthropicApiKey || anthropicApiKey === 'your_anthropic_api_key_here') {
      return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const client = new Anthropic({ apiKey: anthropicApiKey });

    const trimmedGuidance = typeof guidance === 'string' ? guidance.trim() : '';
    const guidanceSection = trimmedGuidance
      ? `\n\nAdditional guidance from the editor — follow this closely: ${trimmedGuidance}`
      : '';

    const prompt = `Research and write a 250-300 word blog post about: ${topic}. Focus on armwrestling events, results, athletes, and relevant news. Write in an engaging sports journalism style.${guidanceSection}

Return your response as valid JSON with these exact fields:
{
  "title": "Engaging headline for the post",
  "body": "Full article text with paragraphs separated by double newlines",
  "excerpt": "50 word summary for preview cards",
  "imageSearchTerm": "2-3 word search term for finding a relevant image"
}

Only return the JSON object, no other text.`;

    // The web search tool runs a server-side loop. If it hits its iteration
    // limit the response comes back with stop_reason "pause_turn"; resend the
    // accumulated conversation to let the server resume.
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
    let response;

    for (let i = 0; i < MAX_CONTINUATIONS; i++) {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
        messages,
      });

      if (response.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: response.content });
    }

    if (!response) {
      return new Response(JSON.stringify({ error: 'No response from model' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Concatenate every text block — web search can split the reply across
    // several text blocks interleaved with tool-use/result blocks.
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const postData: PostData = extractJson(textContent) ?? {
      title: `${topic}`,
      body: `We're excited to share news about ${topic}. Stay tuned for more updates from MK Armwrestling.\n\nCheck back soon for the full story and coverage of this event.`,
      excerpt: `Latest news and updates about ${topic} from MK Armwrestling.`,
      imageSearchTerm: 'arm wrestling competition',
    };

    // Resolve the post image: a custom uploaded image wins; otherwise Unsplash.
    let imageUrl = '/images/hero.jpg'; // Fallback

    if (typeof customImageUrl === 'string' && customImageUrl.trim()) {
      imageUrl = customImageUrl.trim();
    } else {
      // A custom search term from the editor overrides the model's suggestion.
      const searchTerm =
        (customImageSearchTerm && customImageSearchTerm.trim()) ||
        postData.imageSearchTerm ||
        'arm wrestling';
      const found = await fetchUnsplashImage(searchTerm, unsplashAccessKey);
      if (found) imageUrl = found;
    }

    return new Response(
      JSON.stringify({
        title: postData.title,
        body: postData.body,
        excerpt: postData.excerpt,
        image: imageUrl,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Generate post error:', error);

    if (error instanceof Anthropic.APIError) {
      const status = typeof error.status === 'number' ? error.status : 502;
      return new Response(JSON.stringify({ error: 'Failed to generate content' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
