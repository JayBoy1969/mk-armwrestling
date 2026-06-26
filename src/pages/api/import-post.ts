import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSecret } from '../../lib/runtime';
import { isAuthenticatedRequest } from '../../lib/auth';
import { fetchUnsplashImage } from '../../lib/unsplash';

export const prerender = false;

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;

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
    if (!(await isAuthenticatedRequest(cookies, request))) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { content, sourceUrl, customImageUrl } = (await request.json()) as {
      content?: string;
      sourceUrl?: string;
      customImageUrl?: string;
    };

    if (typeof content !== 'string' || !content.trim()) {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
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

    const trimmedSource = typeof sourceUrl === 'string' ? sourceUrl.trim() : '';
    const sourceLine = trimmedSource ? `\n\nOriginal source URL (for context only): ${trimmedSource}` : '';

    const prompt = `You are writing for MK Armwrestling (mkarmwrestling.co.uk), a Milton Keynes based armwrestling club and news site.

Below is content scraped from an external webpage. Rewrite it as an original, engaging 250-300 word blog post in a sports journalism style. Do not copy — summarise, rewrite and add context relevant to the UK armwrestling community where appropriate.${sourceLine}

Source content:
${content.trim()}

Return valid JSON only:
{
  "title": "Engaging headline",
  "body": "Full article with paragraphs separated by double newlines",
  "excerpt": "50 word summary",
  "imageSearchTerm": "2-3 word image search term"
}`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const postData: PostData = extractJson(textContent) ?? {
      title: 'Armwrestling News',
      body: `We're sharing the latest from the armwrestling world. Check back soon for the full story.`,
      excerpt: 'Latest news and updates from MK Armwrestling.',
      imageSearchTerm: 'arm wrestling competition',
    };

    // Resolve the post image: a custom uploaded image wins; otherwise Unsplash.
    let imageUrl = '/images/hero.jpg'; // Fallback

    if (typeof customImageUrl === 'string' && customImageUrl.trim()) {
      imageUrl = customImageUrl.trim();
    } else {
      const searchTerm = postData.imageSearchTerm || 'arm wrestling';
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
    console.error('Import post error:', error);

    if (error instanceof Anthropic.APIError) {
      const status = typeof error.status === 'number' ? error.status : 502;
      return new Response(JSON.stringify({ error: 'Failed to import content' }), {
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
