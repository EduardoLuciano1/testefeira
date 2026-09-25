import { getStore } from '@netlify/blobs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ecorotas-dev-secret-troque-em-producao';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405 });
  }

  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Informe e-mail e senha.' }), { status: 400 });
    }

    const users = getStore('users');
    const key = email.toLowerCase().trim();
    const user = await users.get(key, { type: 'json' });

    if (!user) {
      return new Response(JSON.stringify({ error: 'E-mail ou senha incorretos.' }), { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'E-mail ou senha incorretos.' }), { status: 401 });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return new Response(
      JSON.stringify({ token, user: { name: user.name, email: user.email } }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erro ao entrar.' }), { status: 500 });
  }
};
