import { getStore } from '@netlify/blobs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ecorotas-dev-secret-troque-em-producao';

function getUserFromRequest(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export default async (req) => {
  const store = getStore('posts');

  if (req.method === 'GET') {
    const posts = (await store.get('all', { type: 'json' })) || [];
    return new Response(JSON.stringify(posts), { status: 200 });
  }

  if (req.method === 'POST') {
    const user = getUserFromRequest(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Você precisa estar logado.' }), { status: 401 });
    }

    const { content } = await req.json();
    if (!content || !content.trim() || content.length > 500) {
      return new Response(JSON.stringify({ error: 'Publicação inválida (máx. 500 caracteres).' }), { status: 400 });
    }

    const posts = (await store.get('all', { type: 'json' })) || [];
    const post = {
      id: crypto.randomUUID(),
      content: content.trim(),
      authorName: user.name,
      authorEmail: user.email,
      createdAt: new Date().toISOString(),
    };
    posts.unshift(post);
    await store.setJSON('all', posts);

    return new Response(JSON.stringify(post), { status: 201 });
  }

  if (req.method === 'DELETE') {
    const user = getUserFromRequest(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Você precisa estar logado.' }), { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const posts = (await store.get('all', { type: 'json' })) || [];
    const target = posts.find((p) => p.id === id);

    if (!target) {
      return new Response(JSON.stringify({ error: 'Publicação não encontrada.' }), { status: 404 });
    }
    if (target.authorEmail !== user.email) {
      return new Response(JSON.stringify({ error: 'Você só pode excluir suas próprias publicações.' }), { status: 403 });
    }

    const updated = posts.filter((p) => p.id !== id);
    await store.setJSON('all', updated);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405 });
};
