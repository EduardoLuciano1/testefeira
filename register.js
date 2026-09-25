import { getStore } from '@netlify/blobs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ecorotas-dev-secret-troque-em-producao';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405 });
  }

  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password || password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Preencha nome, e-mail e uma senha com 8+ caracteres.' }),
        { status: 400 }
      );
    }

    const users = getStore('users');
    const key = email.toLowerCase().trim();
    const existing = await users.get(key, { type: 'json' });

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Já existe uma conta com esse e-mail.' }),
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = { id: crypto.randomUUID(), name: name.trim(), email: key, passwordHash };
    await users.setJSON(key, user);

    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return new Response(
      JSON.stringify({ token, user: { name: user.name, email: user.email } }),
      { status: 201 }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erro ao cadastrar.' }), { status: 500 });
  }
};
