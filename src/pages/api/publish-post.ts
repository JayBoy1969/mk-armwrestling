import type { APIRoute } from 'astro';
import { savePost, generateSlug, type BlogPost } from '../../lib/blog';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();

    if (!data.title || !data.body) {
      return new Response(JSON.stringify({ error: 'Title and body are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const slug = generateSlug(data.title);
    const today = new Date().toISOString().split('T')[0];

    const post: BlogPost = {
      title: data.title,
      slug: slug,
      date: today,
      excerpt: data.excerpt || data.body.substring(0, 150) + '...',
      body: data.body,
      image: data.image || '/images/hero.jpg'
    };

    savePost(post);

    return new Response(JSON.stringify({
      success: true,
      slug: post.slug,
      message: 'Post published successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Publish post error:', error);
    return new Response(JSON.stringify({ error: 'Failed to publish post' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
